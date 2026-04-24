-- 4D天性测评 D1 数据库初始化
-- 在 Cloudflare 控制台 -> D1 数据库 -> Console 中执行

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  f INTEGER DEFAULT 0,
  t INTEGER DEFAULT 0,
  n INTEGER DEFAULT 0,
  s INTEGER DEFAULT 0,
  green INTEGER DEFAULT 0,
  yellow INTEGER DEFAULT 0,
  blue INTEGER DEFAULT 0,
  orange INTEGER DEFAULT 0,
  primary_color TEXT,
  primary_type TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_created_at ON results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_primary_color ON results(primary_color);
