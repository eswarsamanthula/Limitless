-- Run in Supabase SQL Editor (Dashboard > SQL Editor)

-- ============================================================
--  PROJECTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  description text,
  color text DEFAULT '#6ee7b7',
  created_at timestamptz DEFAULT now()
);

-- ============================================================
--  ACCOUNTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  platform text NOT NULL,
  email text,
  account_type text DEFAULT 'free',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  note text,
  limit_hit_at timestamptz,
  reset_at timestamptz,
  limit_note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS project_ids uuid[] DEFAULT '{}';
-- Migrate any legacy project_id values into project_ids, then drop the old column
UPDATE accounts
  SET project_ids = ARRAY[project_id]
  WHERE project_id IS NOT NULL
    AND (project_ids IS NULL OR project_id != ALL(project_ids));
ALTER TABLE accounts DROP COLUMN IF EXISTS project_id;
-- group_ids: changed from JSONB to uuid[] for consistency with project_ids
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS group_ids_new uuid[] DEFAULT '{}';
UPDATE accounts SET group_ids_new = ARRAY(SELECT jsonb_array_elements_text(group_ids)::uuid) WHERE group_ids IS NOT NULL AND group_ids != '[]'::jsonb;
ALTER TABLE accounts DROP COLUMN IF EXISTS group_ids;
ALTER TABLE accounts RENAME COLUMN group_ids_new TO group_ids;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS price numeric;

-- ============================================================
--  USER DATA (JSONB key-value for cross-device sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_data (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_data_user_key ON user_data (user_id, key);

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "own_projects" ON projects
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "own_accounts" ON accounts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "user_data_select_own" ON user_data
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "user_data_insert_own" ON user_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "user_data_update_own" ON user_data
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "user_data_delete_own" ON user_data
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
--  HELPER: get user email (used by Edge Function)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_email_by_id(uid uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = auth, public
AS $$
  SELECT email FROM auth.users WHERE id = uid;
$$;

-- ============================================================
--  REALTIME PUBLICATION (for cross-device sync)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE user_data;

-- ============================================================
--  HELPER RPC: atomically remove a project from all accounts
-- ============================================================
CREATE OR REPLACE FUNCTION remove_project_from_accounts(p_user_id uuid, p_project_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE accounts
    SET project_ids = array_remove(project_ids, p_project_id)
    WHERE user_id = p_user_id
      AND p_project_id = ANY(project_ids);
$$;