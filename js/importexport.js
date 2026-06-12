'use strict';

const LIMITLESS_ACCT_COLS = ['id','user_id','platform','email','account_type','project_ids','group_ids','note','price','limit_hit_at','reset_at','limit_note','created_at'];
const LIMITLESS_PROJ_COLS = ['id','user_id','name','description','color','created_at'];
const LIMITLESS_SIG = ['platform','email','account_type','price'];

function _dl(text, name, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportLimitlessCSV() {
  try {
    const accounts = await _fetchAll('accounts');
    const projects = await _fetchAll('projects');
    _dl(_csv(accounts, LIMITLESS_ACCT_COLS), 'limitless_accounts.csv', 'text/csv');
    _dl(_csv(projects, LIMITLESS_PROJ_COLS), 'limitless_projects.csv', 'text/csv');
    showToast('Downloaded: limitless_accounts.csv + limitless_projects.csv');
  } catch(e) { showToast('Export failed: ' + e.message); }
}

async function exportLimitlessXLSX() {
  try {
    if (typeof XLSX === 'undefined') { showToast('Loading SheetJS…'); return; }
    const accounts = await _fetchAll('accounts');
    const projects = await _fetchAll('projects');
    const wb = XLSX.utils.book_new();
    wb.SheetNames.push('Accounts');
    wb.Sheets['Accounts'] = XLSX.utils.json_to_sheet(accounts.map(r => _pick(r, LIMITLESS_ACCT_COLS)));
    wb.SheetNames.push('Projects');
    wb.Sheets['Projects'] = XLSX.utils.json_to_sheet(projects.map(r => _pick(r, LIMITLESS_PROJ_COLS)));
    XLSX.writeFile(wb, 'limitless_export.xlsx');
    showToast('Downloaded: limitless_export.xlsx');
  } catch(e) { showToast('Export failed: ' + e.message); }
}

async function handleLimitlessImport(e) {
  const file = e.target?.files?.[0];
  if (!file) return;
  e.target.value = '';
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    let rows;
    if (ext === 'csv') rows = _parseCSV(await file.text());
    else if (ext === 'xlsx') rows = _parseXLSX(await file.arrayBuffer());
    else { showToast('Unsupported file type. Use .csv or .xlsx'); return; }
    if (!rows || !rows.length) { showToast('Empty file'); return; }

    const sig = Object.keys(rows[0]).map(k => k.toLowerCase().trim());
    const isLimit = LIMITLESS_SIG.some(s => sig.includes(s));
    if (!isLimit) { showToast('Not a valid Limitless export file'); return; }

    const acctCols = ['platform','email','account_type'];
    const accounts = rows.filter(r => acctCols.some(s => r[s] !== undefined));
    const projCols = ['name','description','color'];
    const projects = rows.filter(r => projCols.some(s => r[s] !== undefined));

    let imported = 0;
    const sb = window.__sb;
    if (!sb || !currentUser) { showToast('Not authenticated'); return; }

    if (accounts.length) {
      for (const a of accounts) {
        const { id, user_id, created_at, ...rest } = a;
        const row = _normalizeAccount(rest);
        try { await sb.from('accounts').insert({ ...row, user_id: currentUser.id }); imported++; } catch(_) {}
      }
    }
    if (projects.length) {
      for (const p of projects) {
        const { id, user_id, created_at, ...rest } = p;
        try { await sb.from('projects').insert({ ...rest, user_id: currentUser.id }); imported++; } catch(_) {}
      }
    }
    showToast(`Imported ${imported} rows`);
    if (imported > 0) { await loadAll(); renderView(); }
  } catch(e) { showToast('Import failed: ' + e.message); }
}

function _csv(data, cols) {
  const esc = v => { const s = v == null ? '' : String(v); return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g,'""') + '"' : s; };
  return [cols.join(','), ...data.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

function _pick(obj, cols) {
  const r = {};
  cols.forEach(c => { if (obj[c] !== undefined) r[c] = obj[c]; });
  return r;
}

function _normalizeAccount(row) {
  const r = { ...row };
  if (r.project_ids && typeof r.project_ids === 'string') {
    try { r.project_ids = JSON.parse(r.project_ids); } catch { r.project_ids = []; }
  } else if (!r.project_ids) r.project_ids = [];
  if (r.group_ids && typeof r.group_ids === 'string') {
    try { r.group_ids = JSON.parse(r.group_ids); } catch { r.group_ids = []; }
  } else if (!r.group_ids) r.group_ids = [];
  if (r.price === '' || r.price === undefined || r.price === null) r.price = null;
  else if (typeof r.price === 'string') { const n = parseFloat(r.price); r.price = isNaN(n) ? null : n; }
  r.project_id = null;
  ['limit_hit_at','reset_at','limit_note','note'].forEach(k => {
    if (r[k] === '' || r[k] === undefined) r[k] = null;
  });
  return r;
}

function _parseCSV(text) {
  const lines = text.trim().split('\n');
  if (!lines.length) return [];
  const cols = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = [];
    let inQ = false, cur = '';
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    const row = {};
    cols.forEach((c, idx) => { if (vals[idx] !== undefined) row[c.trim()] = vals[idx]; });
    rows.push(row);
  }
  return rows;
}

function _parseXLSX(buf) {
  const wb = XLSX.read(buf, { type: 'array' });
  const rows = [];
  wb.SheetNames.forEach(sn => {
    const sheet = wb.Sheets[sn];
    if (!sheet) return;
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    data.forEach(r => rows.push(r));
  });
  return rows;
}

async function _fetchAll(table) {
  const sb = window.__sb;
  if (!sb || !currentUser) throw new Error('Not authenticated');
  const { data, error } = await sb.from(table).select('*').eq('user_id', currentUser.id).order('created_at');
  if (error) throw error;
  return data || [];
}
