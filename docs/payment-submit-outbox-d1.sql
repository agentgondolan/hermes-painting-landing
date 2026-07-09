CREATE TABLE IF NOT EXISTS payment_submit_outbox (
  stripe_session_id TEXT PRIMARY KEY,
  stripe_event_id TEXT,
  verified_email TEXT,
  mge_order_draft_id TEXT,
  mge_order_id TEXT,
  state TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_submit_outbox_event
  ON payment_submit_outbox (stripe_event_id);

CREATE INDEX IF NOT EXISTS idx_payment_submit_outbox_draft
  ON payment_submit_outbox (mge_order_draft_id);
