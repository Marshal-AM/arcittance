-- Path B ledger: attribute Mint→facilitator funds to remit senders.

CREATE TABLE IF NOT EXISTS mint_ledger (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id     TEXT NOT NULL,
  amount             NUMERIC NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'USD',
  bank_account_id    TEXT,
  deposit_id         TEXT,
  transfer_id        TEXT,
  recipient_address_id TEXT,
  mint_tx_hash       TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'deposited', 'minted', 'spent', 'failed')),
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mint_ledger_user_idx ON mint_ledger (sender_user_id);
CREATE INDEX IF NOT EXISTS mint_ledger_status_idx ON mint_ledger (status);

DROP TRIGGER IF EXISTS mint_ledger_set_updated_at ON mint_ledger;
CREATE TRIGGER mint_ledger_set_updated_at
  BEFORE UPDATE ON mint_ledger
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
