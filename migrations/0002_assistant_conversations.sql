CREATE TABLE assistant_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE assistant_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  actions_json TEXT,
  proposal_status TEXT CHECK(proposal_status IN ('pending','confirmed','dismissed')),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_assistant_conversations_user_updated ON assistant_conversations(user_id, updated_at DESC);
CREATE INDEX idx_assistant_messages_conversation_created ON assistant_messages(conversation_id, created_at);