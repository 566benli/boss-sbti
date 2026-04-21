-- 提现记录表：由管理员人工录入，用于对账「虎皮椒钱包剩余 = GMV - 交易手续费估算 - 已提现」
-- gross_cent: 本次从虎皮椒钱包扣掉的总额（和虎皮椒后台的提现流水金额一致）
-- net_cent:   实际到银行卡的金额（可选，便于后续核对）
-- fee_cent:   虎皮椒收取的提现手续费 = gross - net（可选）

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gross_cent INTEGER NOT NULL,
  net_cent INTEGER,
  fee_cent INTEGER,
  ref_no TEXT,
  notes TEXT,
  withdrawn_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_at ON withdrawals(withdrawn_at);
