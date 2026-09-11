PRAGMA foreign_keys = ON;

-- Durable webhook processing. Existing rows were already acknowledged by the
-- old handler, so they start as processed; new rows explicitly start received.
ALTER TABLE stripe_event ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'processed'
  CHECK (processing_status IN ('received', 'processing', 'processed', 'failed'));
ALTER TABLE stripe_event ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0
  CHECK (attempts >= 0);
ALTER TABLE stripe_event ADD COLUMN processing_started_at TEXT;
ALTER TABLE stripe_event ADD COLUMN processed_at TEXT;
ALTER TABLE stripe_event ADD COLUMN last_error TEXT;

UPDATE stripe_event SET processed_at = received_at WHERE processed_at IS NULL;
CREATE INDEX idx_stripe_event_processing
  ON stripe_event(processing_status, processing_started_at);

-- Keep accounting and disputes separate from the coarse order status. An open
-- dispute blocks entry but deliberately keeps its seat allocated.
ALTER TABLE "order" ADD COLUMN locale TEXT NOT NULL DEFAULT 'ca'
  CHECK (locale IN ('ca', 'es', 'en'));
ALTER TABLE "order" ADD COLUMN terms_version TEXT;
ALTER TABLE "order" ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0
  CHECK (refunded_cents >= 0);
ALTER TABLE "order" ADD COLUMN dispute_status TEXT NOT NULL DEFAULT 'none'
  CHECK (dispute_status IN ('none', 'open', 'won', 'lost'));
ALTER TABLE "order" ADD COLUMN disputed_at TEXT;

CREATE INDEX idx_order_dispute ON "order"(dispute_status, status);
