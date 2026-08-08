-- Phase 10: expand fx_quotes for StableFX RFQ lifecycle.

ALTER TABLE fx_quotes
  ADD COLUMN IF NOT EXISTS spread NUMERIC,
  ADD COLUMN IF NOT EXISTS maker TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'quoted'
    CHECK (status IN ('quoted', 'executed', 'settled', 'expired', 'failed')),
  ADD COLUMN IF NOT EXISTS stablefx_quote_id TEXT,
  ADD COLUMN IF NOT EXISTS stablefx_trade_id TEXT,
  ADD COLUMN IF NOT EXISTS remittance_id UUID REFERENCES remittances (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS fx_quotes_status_idx ON fx_quotes (status);
CREATE INDEX IF NOT EXISTS fx_quotes_stablefx_quote_id_idx ON fx_quotes (stablefx_quote_id);
CREATE INDEX IF NOT EXISTS fx_quotes_remittance_id_idx ON fx_quotes (remittance_id);

DROP TRIGGER IF EXISTS fx_quotes_set_updated_at ON fx_quotes;
CREATE TRIGGER fx_quotes_set_updated_at
  BEFORE UPDATE ON fx_quotes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
