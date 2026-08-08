-- Off-chain titles/descriptions for milestones and subscription plans.
-- On-chain ids come from ConditionalEscrow / SubscriptionManager (Arc testnet).
-- Does not alter contracts — metadata only.

CREATE TABLE IF NOT EXISTS milestone_metadata (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id          INTEGER NOT NULL DEFAULT 5042002,
  milestone_id      BIGINT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  creator_address   TEXT,
  tx_hash           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS milestone_metadata_chain_idx
  ON milestone_metadata (chain_id);

CREATE TABLE IF NOT EXISTS subscription_plan_metadata (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id          INTEGER NOT NULL DEFAULT 5042002,
  plan_id           BIGINT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  creator_address   TEXT,
  tx_hash           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, plan_id)
);

CREATE INDEX IF NOT EXISTS subscription_plan_metadata_chain_idx
  ON subscription_plan_metadata (chain_id);

DROP TRIGGER IF EXISTS milestone_metadata_set_updated_at ON milestone_metadata;
CREATE TRIGGER milestone_metadata_set_updated_at
  BEFORE UPDATE ON milestone_metadata
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS subscription_plan_metadata_set_updated_at ON subscription_plan_metadata;
CREATE TRIGGER subscription_plan_metadata_set_updated_at
  BEFORE UPDATE ON subscription_plan_metadata
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
