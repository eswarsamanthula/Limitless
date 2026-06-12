'use strict';

// ═══════════════════════════════════════════════════════════════
//  PROMPTS
// ═══════════════════════════════════════════════════════════════

function loadPrompts() {
  if (state.prompts.length) return state.prompts;
  try { return JSON.parse(localStorage.getItem('limitless_prompts') || '[]'); }
  catch { return []; }
}
function savePrompts(prompts) {
  state.prompts = prompts;
  localStorage.setItem('limitless_prompts', JSON.stringify(prompts));
  if (typeof setUserData === 'function') setUserData('prompts', prompts).catch(() => {});
}

function renderPrompts(query = '') {
  const list = document.getElementById('prompts-list');
  if (!list) return;
  list.innerHTML = '';
  let prompts = loadPrompts();
  if (query) {
    const q = query.toLowerCase();
    prompts = prompts.filter(p => (p.title||'').toLowerCase().includes(q) || (p.text||'').toLowerCase().includes(q) || (p.tag||'').toLowerCase().includes(q));
  }
  if (prompts.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">✎</span><p>${query ? 'No prompts match your search.' : 'No prompts saved yet.'}</p>${!query ? '<button class="btn-primary" onclick="openPromptModal()">+ Add Prompt</button>' : ''}</div>`;
    return;
  }
  prompts.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'prompt-card';
    card.style.animationDelay = `${i * 30}ms`;
    card.innerHTML = `
      <div class="prompt-card-top">
        <span class="prompt-card-title">${escHtml(p.title || 'Untitled')}</span>
        <span class="prompt-card-platform">${escHtml(p.platform || 'Any')}</span>
      </div>
      <div class="prompt-card-text">${escHtml(p.text || '')}</div>
      <div class="prompt-card-bottom">
        <span class="prompt-card-tag">${escHtml(p.tag || 'general')}</span>
        <div class="prompt-card-actions">
          <button onclick="event.stopPropagation();copyPrompt('${p.id}')">Copy</button>
          <button onclick="event.stopPropagation();openPromptModal('${p.id}')">Edit</button>
          <button onclick="event.stopPropagation();exportPrompt('${p.id}')">↓</button>
          <button class="danger" onclick="event.stopPropagation();deletePrompt('${p.id}')">Delete</button>
        </div>
      </div>`;
    card.addEventListener('click', () => copyPromptById(p));
    list.appendChild(card);
  });
}
function copyPromptById(prompt) {
  navigator.clipboard.writeText(prompt.text || '').then(() => showToast('Prompt copied ✎')).catch(() => showToast('Could not copy'));
}
function copyPrompt(id) {
  const prompt = loadPrompts().find(p => p.id === id);
  if (prompt) copyPromptById(prompt);
}
function deletePrompt(id) {
  const prompts = loadPrompts().filter(p => p.id !== id);
  savePrompts(prompts);
  renderPrompts(document.getElementById('prompts-search')?.value || '');
  showToast('Prompt deleted');
}
function openPromptModal(id) {
  const prompts = loadPrompts();
  const p = id ? prompts.find(x => x.id === id) : null;
  document.getElementById('prompt-id').value = id || '';
  document.getElementById('prompt-title').value = p?.title || '';
  document.getElementById('prompt-text').value = p?.text || '';
  document.getElementById('prompt-tag').value = p?.tag || '';
  const platform = p?.platform || 'Any';
  document.querySelectorAll('#prompt-platform-chips .reason-chip').forEach(c => c.classList.toggle('selected', c.dataset.platform === platform));
  document.getElementById('modal-prompt-title').textContent = id ? 'Edit Prompt' : 'Save Prompt';
  openModal('modal-prompt');
}
function handleSavePrompt() {
  const id = document.getElementById('prompt-id').value;
  const title = document.getElementById('prompt-title').value.trim();
  const text = document.getElementById('prompt-text').value.trim();
  const tag = document.getElementById('prompt-tag').value.trim() || 'general';
  const platform = document.querySelector('#prompt-platform-chips .reason-chip.selected')?.dataset.platform || 'Any';
  if (!title) { showToast('Please enter a title'); return; }
  if (!text) { showToast('Please enter a prompt'); return; }
  const prompts = loadPrompts();
  if (id) {
    const idx = prompts.findIndex(x => x.id === id);
    if (idx >= 0) prompts[idx] = { ...prompts[idx], title, text, tag, platform };
  } else {
    prompts.unshift({ id: Date.now().toString(), title, text, tag, platform, created_at: new Date().toISOString() });
  }
  savePrompts(prompts);
  closeModal('modal-prompt');
  renderPrompts();
  showToast(id ? 'Prompt updated ✎' : 'Prompt saved ✎');
}

function exportPrompt(id) {
  const prompt = loadPrompts().find(p => p.id === id);
  if (!prompt) return;
  const lines = [
    prompt.title ? `# ${prompt.title}` : '# Saved Prompt',
    `Platform: ${prompt.platform || 'Any'}`,
    `Tag: ${prompt.tag || 'general'}`,
    prompt.created_at ? `Saved: ${new Date(prompt.created_at).toLocaleString()}` : '',
    '',
    prompt.text || '—',
  ].filter(l => l !== null).join('\n');

  const blob = new Blob([lines], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(prompt.title || 'prompt').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  showSuccess('Exported ↓');
}

// ═══════════════════════════════════════════════════════════════
//  SAVED CHATS
// ═══════════════════════════════════════════════════════════════

function loadChats() {
  if (state.chats.length) return state.chats;
  try { return JSON.parse(localStorage.getItem('limitless_chats') || '[]'); }
  catch { return []; }
}
function saveChats(chats) {
  state.chats = chats;
  localStorage.setItem('limitless_chats', JSON.stringify(chats));
  if (typeof setUserData === 'function') setUserData('chats', chats).catch(() => {});
}

function renderChats(query = '') {
  const list = document.getElementById('chats-list');
  if (!list) return;
  list.innerHTML = '';

  let chats = loadChats();
  if (query) {
    const q = query.toLowerCase();
    chats = chats.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.platform || '').toLowerCase().includes(q) ||
      (c.note || '').toLowerCase().includes(q)
    );
  }

  if (chats.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">◌</span>
        <p>${query ? 'No chats match your search.' : 'No saved chats yet.<br/>Save a link to any AI conversation to find it fast.'}</p>
        ${!query ? '<button class="btn-primary" onclick="openChatModal()">+ Save Chat</button>' : ''}
      </div>`;
    return;
  }

  chats.forEach((chat, i) => {
    const color = window.PLATFORM_COLORS?.[chat.platform] || '#888';
    const card = document.createElement('div');
    card.className = 'chat-card';
    card.style.animationDelay = `${i * 30}ms`;
    card.innerHTML = `
      <div class="chat-platform-dot" style="background:${color}"></div>
      <div class="chat-info">
        <div class="chat-title-text">${escHtml(chat.title || 'Untitled')}</div>
        <div class="chat-meta">
          <span>${escHtml(chat.platform || '')}</span>
          ${chat.note ? `<span>· ${escHtml(chat.note)}</span>` : ''}
          ${chat.url ? `<span style="color:var(--text-faint);overflow:hidden;text-overflow:ellipsis;max-width:200px">${escHtml(chat.url)}</span>` : ''}
        </div>
      </div>
      <div class="chat-actions">
        <button onclick="event.stopPropagation();openChatModal('${chat.id}')">Edit</button>
        ${chat.url ? `<button class="chat-open-btn" data-url="${escHtml(chat.url)}">Open ↗</button>` : ''}
        <button onclick="event.stopPropagation();exportChat('${chat.id}')">↓</button>
        <button class="danger" onclick="event.stopPropagation();deleteChatById('${chat.id}')">Delete</button>
      </div>
    `;
    if (chat.url) {
      card.addEventListener('click', () => window.open(chat.url, '_blank'));
      const openBtn = card.querySelector('.chat-open-btn');
      if (openBtn) {
        openBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(chat.url, '_blank');
        });
      }
    }
    list.appendChild(card);
  });
}

function deleteChatById(id) {
  const chats = loadChats().filter(c => c.id !== id);
  saveChats(chats);
  renderChats(document.getElementById('chats-search')?.value || '');
  showToast('Chat removed');
}
function exportChat(id) {
  const chat = loadChats().find(c => c.id === id);
  if (!chat) return;
  const lines = [
    chat.title ? `# ${chat.title}` : '# Saved Chat',
    `Platform: ${chat.platform || '—'}`,
    chat.note ? `Note: ${chat.note}` : '',
    chat.url ? `URL: ${chat.url}` : '',
    chat.saved_at ? `Saved: ${new Date(chat.saved_at).toLocaleString()}` : '',
  ].filter(l => l !== null).join('\n');

  const blob = new Blob([lines], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(chat.title || 'chat').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  showSuccess('Exported ↓');
}

function openChatModal(chatId = null) {
  const chat = chatId ? loadChats().find(c => c.id === chatId) : null;
  document.getElementById('chat-id').value = chatId || '';
  document.getElementById('chat-title').value = chat?.title || '';
  document.getElementById('chat-url').value = chat?.url || '';
  document.getElementById('chat-note').value = chat?.note || '';

  const knownPlatforms = ['Claude','ChatGPT','Gemini','Grok','Copilot'];
  const savedPlatform = chat?.platform || 'Claude';
  const isKnown = knownPlatforms.includes(savedPlatform);
  const customInput = document.getElementById('chat-custom-platform');
  document.querySelectorAll('#chat-platform-chips .reason-chip').forEach(chip => {
    const match = isKnown
      ? chip.dataset.platform === savedPlatform
      : chip.dataset.platform === 'Other';
    chip.classList.toggle('selected', match);
  });
  if (!isKnown && savedPlatform) {
    customInput.style.display = 'block';
    customInput.value = savedPlatform;
  } else {
    customInput.style.display = 'none';
    customInput.value = '';
  }

  document.getElementById('modal-chat-title').textContent = chatId ? 'Edit Chat' : 'Save Chat';
  openModal('modal-chat');
}

function handleSaveChat() {
  const id = document.getElementById('chat-id').value;
  const title = document.getElementById('chat-title').value.trim();
  const url = document.getElementById('chat-url').value.trim();
  const note = document.getElementById('chat-note').value.trim();
  const selectedChipPlatform = document.querySelector('#chat-platform-chips .reason-chip.selected')?.dataset.platform || 'Other';
  const customPlatformVal = document.getElementById('chat-custom-platform')?.value.trim();
  const platform = selectedChipPlatform === 'Other' && customPlatformVal ? customPlatformVal : selectedChipPlatform;

  if (!title) { showToast('Please enter a title'); return; }

  const chats = loadChats();
  if (id) {
    const idx = chats.findIndex(c => c.id === id);
    if (idx >= 0) chats[idx] = { ...chats[idx], title, url, note, platform };
  } else {
    chats.unshift({ id: Date.now().toString(), title, url, note, platform, saved_at: new Date().toISOString() });
  }
  saveChats(chats);
  closeModal('modal-chat');
  renderChats();
  showToast(id ? 'Chat updated ◌' : 'Chat saved ◌');
}

// ═══════════════════════════════════════════════════════════════
//  MESSAGES
// ═══════════════════════════════════════════════════════════════

const MSG_KEY = 'limitless_messages';

function loadMessages() {
  try { return JSON.parse(localStorage.getItem(MSG_KEY) || '[]'); }
  catch { return []; }
}

function saveMessages(msgs) {
  localStorage.setItem(MSG_KEY, JSON.stringify(msgs));
  state.messages = msgs;
}

function renderMessages(query = '') {
  const list = document.getElementById('messages-list');
  if (!list) return;

  let msgs = loadMessages();

  if (query) {
    const q = query.toLowerCase();
    msgs = msgs.filter(m =>
      (m.title || '').toLowerCase().includes(q) ||
      (m.platform || '').toLowerCase().includes(q) ||
      (m.prompt || '').toLowerCase().includes(q) ||
      (m.reply || '').toLowerCase().includes(q) ||
      (m.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  list.innerHTML = '';

  if (msgs.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">✦</span>
        <p>${query ? 'No messages match your search.' : 'No messages saved yet.<br/>Save any AI conversation — your prompt and the reply.'}</p>
        ${!query ? '<button class="btn-primary" onclick="openMessageModal()">+ Save Message</button>' : ''}
      </div>`;
    return;
  }

  msgs.forEach((msg, i) => {
    const color = window.PLATFORM_COLORS?.[msg.platform] || '#888';
    const card = document.createElement('div');
    card.className = 'message-card';
    card.style.animationDelay = `${i * 25}ms`;
    const tagsHtml = (msg.tags || []).map(t =>
      `<span class="msg-tag">${escHtml(t)}</span>`
    ).join('');
    const promptPreview = (msg.prompt || '').slice(0, 120);
    const replyPreview  = (msg.reply  || '').slice(0, 160);
    const dateStr = msg.created_at
      ? new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      : '';

    card.innerHTML = `
      <div class="msg-card-header">
        <div class="msg-card-left">
          <span class="msg-platform-dot" style="background:${color}"></span>
          <span class="msg-platform-name">${escHtml(msg.platform || '')}</span>
          ${msg.title ? `<span class="msg-card-title">${escHtml(msg.title)}</span>` : ''}
        </div>
        <div class="msg-card-meta">
          ${dateStr ? `<span class="msg-date">${dateStr}</span>` : ''}
          <div class="msg-card-actions">
            <button class="msg-action-btn" title="Edit" onclick="event.stopPropagation();openMessageModal('${msg.id}')">✎</button>
            <button class="msg-action-btn" title="Copy prompt" onclick="event.stopPropagation();copyMsgPart('${msg.id}','prompt')">⊡</button>
            <button class="msg-action-btn" title="Export" onclick="event.stopPropagation();exportMessage('${msg.id}')">↓</button>
            <button class="msg-action-btn danger" title="Delete" onclick="event.stopPropagation();deleteMessage('${msg.id}')">✕</button>
          </div>
        </div>
      </div>
      <div class="msg-card-body">
        <div class="msg-bubble msg-bubble-user">
          <span class="msg-bubble-label">You</span>
          <div class="msg-bubble-text">${escHtml(promptPreview)}${msg.prompt && msg.prompt.length > 120 ? '<span class="msg-truncate">…</span>' : ''}</div>
        </div>
        <div class="msg-bubble msg-bubble-ai">
          <span class="msg-bubble-label">${escHtml(msg.platform || 'AI')}</span>
          <div class="msg-bubble-text">${escHtml(replyPreview)}${msg.reply && msg.reply.length > 160 ? '<span class="msg-truncate"> — tap to read more</span>' : ''}</div>
        </div>
      </div>
      ${tagsHtml ? `<div class="msg-card-tags">${tagsHtml}</div>` : ''}
    `;

    card.addEventListener('click', () => openMessageViewer(msg.id));
    list.appendChild(card);
  });
}

function openMessageViewer(msgId) {
  const msg = loadMessages().find(m => m.id === msgId);
  if (!msg) return;
  const color = window.PLATFORM_COLORS?.[msg.platform] || '#888';

  document.getElementById('msg-view-title').textContent = msg.title || 'Message';
  document.getElementById('msg-view-platform').innerHTML =
    `<span style="display:inline-flex;align-items:center;gap:0.4rem;font-size:0.75rem;color:var(--text-muted)"><span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0"></span>${escHtml(msg.platform || '')}</span>`;
  document.getElementById('msg-view-prompt').textContent = msg.prompt || '—';
  document.getElementById('msg-view-reply').textContent  = msg.reply  || '—';

  const tagsEl = document.getElementById('msg-view-tags');
  tagsEl.innerHTML = (msg.tags || []).map(t => `<span class="msg-tag">${escHtml(t)}</span>`).join('');

  const copyPromptBtn = document.getElementById('msg-view-copy-prompt');
  const copyReplyBtn  = document.getElementById('msg-view-copy-reply');
  const copyBothBtn   = document.getElementById('msg-view-copy-both');
  const exportBtn     = document.getElementById('msg-view-export');

  copyPromptBtn.onclick = () => { navigator.clipboard.writeText(msg.prompt || ''); showSuccess('Prompt copied ✓'); };
  copyReplyBtn.onclick  = () => { navigator.clipboard.writeText(msg.reply  || ''); showSuccess('Reply copied ✓'); };
  copyBothBtn.onclick   = () => {
    const text = `[My Message]\n${msg.prompt || ''}\n\n[${msg.platform || 'AI'} Reply]\n${msg.reply || ''}`;
    navigator.clipboard.writeText(text);
    showSuccess('Both copied ✓');
  };
  exportBtn.onclick = () => exportMessage(msgId);

  openModal('modal-message-view');
}

function openMessageModal(msgId = null) {
  const msg = msgId ? loadMessages().find(m => m.id === msgId) : null;
  document.getElementById('message-id').value = msgId || '';
  document.getElementById('message-title').value   = msg?.title  || '';
  document.getElementById('message-prompt').value  = msg?.prompt || '';
  document.getElementById('message-reply').value   = msg?.reply  || '';
  document.getElementById('message-tags').value    = (msg?.tags || []).join(', ');

  const knownPlatforms = ['Claude','ChatGPT','Gemini','Grok','Copilot'];
  const savedPlatform = msg?.platform || 'Claude';
  const isKnown = knownPlatforms.includes(savedPlatform);
  const customInput = document.getElementById('message-custom-platform');
  document.querySelectorAll('#message-platform-chips .reason-chip').forEach(chip => {
    const match = isKnown ? chip.dataset.platform === savedPlatform : chip.dataset.platform === 'Other';
    chip.classList.toggle('selected', match);
  });
  if (!isKnown && savedPlatform) {
    customInput.style.display = 'block';
    customInput.value = savedPlatform;
  } else {
    customInput.style.display = 'none';
    customInput.value = '';
  }

  document.getElementById('modal-message-title').textContent = msgId ? 'Edit Message' : 'Save Message';
  updateCharCount('message-prompt', 'prompt-char-count');
  updateCharCount('message-reply',  'reply-char-count');
  openModal('modal-message');
}

function handleSaveMessage() {
  const id      = document.getElementById('message-id').value;
  const title   = document.getElementById('message-title').value.trim();
  const prompt  = document.getElementById('message-prompt').value.trim();
  const reply   = document.getElementById('message-reply').value.trim();
  const tagsRaw = document.getElementById('message-tags').value.trim();
  const tags    = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const selectedChip = document.querySelector('#message-platform-chips .reason-chip.selected');
  const customPlatform = document.getElementById('message-custom-platform')?.value.trim();
  const platform = (selectedChip?.dataset.platform === 'Other' && customPlatform)
    ? customPlatform
    : (selectedChip?.dataset.platform || 'Claude');

  if (!prompt && !reply) { showWarn('Add at least a prompt or a reply'); return; }

  let msgs = loadMessages();
  if (id) {
    const idx = msgs.findIndex(m => m.id === id);
    if (idx > -1) msgs[idx] = { ...msgs[idx], title, prompt, reply, tags, platform };
  } else {
    msgs.unshift({ id: Date.now().toString(), title, prompt, reply, tags, platform, created_at: new Date().toISOString() });
  }
  saveMessages(msgs);
  if (typeof setUserData === 'function') setUserData('messages', msgs).catch(() => {});
  closeModal('modal-message');
  renderMessages(document.getElementById('messages-search')?.value || '');
  showSuccess(id ? 'Message updated ✓' : 'Message saved ✦');
}

function deleteMessage(msgId) {
  const updated = loadMessages().filter(m => m.id !== msgId);
  saveMessages(updated);
  if (typeof setUserData === 'function') setUserData('messages', updated).catch(() => {});
  renderMessages(document.getElementById('messages-search')?.value || '');
  showSuccess('Message deleted');
}

function copyMsgPart(msgId, part) {
  const msg = loadMessages().find(m => m.id === msgId);
  if (!msg) return;
  navigator.clipboard.writeText(part === 'prompt' ? (msg.prompt || '') : (msg.reply || ''));
  showSuccess(part === 'prompt' ? 'Prompt copied ✓' : 'Reply copied ✓');
}

function exportMessage(msgId) {
  const msg = loadMessages().find(m => m.id === msgId);
  if (!msg) return;
  const lines = [
    msg.title ? `# ${msg.title}` : '# Saved Message',
    `Platform: ${msg.platform || '—'}`,
    msg.tags?.length ? `Tags: ${msg.tags.join(', ')}` : '',
    msg.created_at ? `Saved: ${new Date(msg.created_at).toLocaleString()}` : '',
    '',
    '## My Message',
    msg.prompt || '—',
    '',
    `## ${msg.platform || 'AI'} Reply`,
    msg.reply || '—',
  ].filter(l => l !== null).join('\n');

  const blob = new Blob([lines], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(msg.title || 'message').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  showSuccess('Exported ↓');
}

function updateCharCount(textareaId, countId) {
  const ta = document.getElementById(textareaId);
  const el = document.getElementById(countId);
  if (!ta || !el) return;
  const update = () => { el.textContent = ta.value.length > 0 ? `${ta.value.length} chars` : ''; };
  update();
  ta.addEventListener('input', update);
}
