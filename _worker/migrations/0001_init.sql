-- 老板 SBTI 后端初始 schema
-- Cloudflare D1（SQLite 方言）

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  ua TEXT,
  ip_hash TEXT,
  completed_at INTEGER,
  main_type TEXT,
  sub_type TEXT,
  dim_e INTEGER,
  dim_c INTEGER,
  dim_t INTEGER,
  dim_m INTEGER,
  answers_json TEXT,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_paid ON sessions(paid, paid_at);
CREATE INDEX IF NOT EXISTS idx_sessions_main_type ON sessions(main_type);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_order_id TEXT,
  amount_cent INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  webhook_payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS share_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_session ON share_events(session_id);
CREATE INDEX IF NOT EXISTS idx_share_platform ON share_events(platform, created_at);
