-- Phase 10 remake: payins, payouts, custody wallet mapping for consumer remit.

CREATE TABLE IF NOT EXISTS payins (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id  TEXT NOT NULL UNIQUE,
  sender_email       TEXT,
  sender_user_id     TEXT,
  amount             NUMERIC NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'USD',
  status             TEXT NOT NULL DEFAULT 'created'
                     CHECK (status IN ('created', 'pending', 'complete', 'expired', 'failed', 'active')),
  deposit_address    TEXT,
  chain              TEXT DEFAULT 'ARC',
  merchant_wallet_id TEXT,
  received_at        TIMESTAMPTZ,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payins_user_idx ON payins (sender_user_id);
CREATE INDEX IF NOT EXISTS payins_status_idx ON payins (status);
CREATE INDEX IF NOT EXISTS payins_payment_intent_idx ON payins (payment_intent_id);

CREATE TABLE IF NOT EXISTS custody_wallets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL UNIQUE,
  sub_wallet_id  TEXT NOT NULL,
  address        TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payouts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id        TEXT NOT NULL UNIQUE,
  recipient_id     TEXT NOT NULL,
  remittance_id    UUID REFERENCES remittances (id) ON DELETE SET NULL,
  amount           NUMERIC NOT NULL,
  currency         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  chain            TEXT,
  tx_hash          TEXT,
  idempotency_key  TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_remittance_idx ON payouts (remittance_id);
CREATE INDEX IF NOT EXISTS payouts_status_idx ON payouts (status);

ALTER TABLE fx_quotes
  ADD COLUMN IF NOT EXISTS payin_id UUID REFERENCES payins (id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS payins_set_updated_at ON payins;
CREATE TRIGGER payins_set_updated_at
  BEFORE UPDATE ON payins
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS payouts_set_updated_at ON payouts;
CREATE TRIGGER payouts_set_updated_at
  BEFORE UPDATE ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS custody_wallets_set_updated_at ON custody_wallets;
CREATE TRIGGER custody_wallets_set_updated_at
  BEFORE UPDATE ON custody_wallets
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
