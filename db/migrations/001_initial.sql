-- Phase 5: initial Supabase schema for remittances, receipts, FX quotes, compliance.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS remittances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  on_chain_id         BIGINT,
  sender_address      TEXT NOT NULL,
  recipient_address   TEXT NOT NULL,
  amount              BIGINT NOT NULL,
  fee                 BIGINT NOT NULL DEFAULT 0,
  destination_chain_id INTEGER,
  routing_method      SMALLINT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'settled', 'failed')),
  tx_hash             TEXT,
  attestation_hash    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS remittances_status_idx ON remittances (status);
CREATE INDEX IF NOT EXISTS remittances_sender_idx ON remittances (sender_address);
CREATE INDEX IF NOT EXISTS remittances_created_at_idx ON remittances (created_at DESC);

CREATE TABLE IF NOT EXISTS receipts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id     UUID REFERENCES remittances (id) ON DELETE SET NULL,
  batch_id          UUID,
  attestation_hash  TEXT NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('single', 'batch')),
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipts_remittance_id_idx ON receipts (remittance_id);
CREATE INDEX IF NOT EXISTS receipts_attestation_hash_idx ON receipts (attestation_hash);
CREATE INDEX IF NOT EXISTS receipts_batch_id_idx ON receipts (batch_id);

-- Stub for Phase 10 StableFX quote history.
CREATE TABLE IF NOT EXISTS fx_quotes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair         TEXT NOT NULL,
  quote_amount NUMERIC,
  rate         NUMERIC,
  expires_at   TIMESTAMPTZ,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fx_quotes_pair_created_idx ON fx_quotes (pair, created_at DESC);

CREATE TABLE IF NOT EXISTS compliance_checks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address    TEXT NOT NULL,
  reason     TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open'
             CHECK (status IN ('open', 'reviewed', 'cleared')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_checks_address_idx ON compliance_checks (address);
CREATE INDEX IF NOT EXISTS compliance_checks_status_idx ON compliance_checks (status);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS remittances_set_updated_at ON remittances;
CREATE TRIGGER remittances_set_updated_at
  BEFORE UPDATE ON remittances
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
