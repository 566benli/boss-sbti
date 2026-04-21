-- 老板 SBTI 账号系统（users 表 + sessions/orders 关联）
-- 每位测试者首次进入自动创建专属账号；cookie 登出后可用 code + 可选 PIN 重新登入。

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                 -- 内部 UUID
  code TEXT UNIQUE NOT NULL,           -- 易记账号码，如 'AB12CD'（6 位 base32 子集）
  nickname TEXT,                       -- 可选昵称
  pin_hash TEXT,                       -- 可选 PIN 的 sha256(salt + pin) 哈希；未设置 PIN 时为 NULL
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  ua TEXT,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_code ON users(code);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);

-- 给 sessions 加账号归属列（老数据保持 NULL）
ALTER TABLE sessions ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, created_at);

-- 给 orders 加账号归属列（老数据保持 NULL）
ALTER TABLE orders ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
