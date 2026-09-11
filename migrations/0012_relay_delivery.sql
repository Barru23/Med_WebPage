PRAGMA foreign_keys = ON;

ALTER TABLE "order" ADD COLUMN relay_sheet_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (relay_sheet_status IN ('pending', 'sent', 'failed'));
ALTER TABLE "order" ADD COLUMN relay_email_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (relay_email_status IN ('pending', 'sent', 'failed', 'unknown'));
ALTER TABLE "order" ADD COLUMN relay_sheet_synced_at TEXT;
ALTER TABLE "order" ADD COLUMN relay_email_sent_at TEXT;
ALTER TABLE "order" ADD COLUMN relay_attempts INTEGER NOT NULL DEFAULT 0
  CHECK (relay_attempts >= 0);
ALTER TABLE "order" ADD COLUMN relay_last_error TEXT;

-- The legacy flag proves that the sheet was accepted, but the old Apps Script
-- returned OK even when MailApp failed. Never resend those historical emails
-- automatically: expose them as unknown for a human decision.
UPDATE "order"
SET relay_sheet_status = 'sent',
    relay_sheet_synced_at = relay_synced_at,
    relay_email_status = 'unknown'
WHERE relay_synced_at IS NOT NULL;

CREATE INDEX idx_order_relay_channels
  ON "order"(status, relay_sheet_status, relay_email_status);
