-- ============================================================
--  LIMITLESS — user_data table for cross-device sync
--  Each row stores a JSON blob keyed by user_id + key.
--  This replaces localStorage for all syncable user data.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_data (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

-- Row‑level security: users can only see/edit their own rows
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_data_select_own" ON user_data
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_data_insert_own" ON user_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_data_update_own" ON user_data
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_data_delete_own" ON user_data
  FOR DELETE USING (auth.uid() = user_id);

-- Index for fast lookups by (user_id, key)
CREATE INDEX IF NOT EXISTS idx_user_data_user_key ON user_data (user_id, key);
