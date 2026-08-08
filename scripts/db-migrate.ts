/**
 * Apply db/migrations/*.sql to Supabase Postgres.
 *
 * Run: npm run db:migrate
 *
 * Automated path: set SUPABASE_DB_URL (or DATABASE_URL) to the direct Postgres
 * connection string from Supabase → Project Settings → Database.
 *
 * Manual path: if only SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, verifies
 * connectivity and prints SQL to paste into Supabase Dashboard → SQL Editor.
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const MIGRATIONS_DIR = path.join(__dirname, "..", "db", "migrations");

function loadMigrationFiles(): { name: string; sql: string }[] {
  const names = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  return names.map((name) => ({
    name,
    sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"),
  }));
}

async function applyViaPostgres(connectionString: string, sql: string): Promise<void> {
  let pg: { Client: new (config: { connectionString: string }) => PgClient };

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pg = require("pg");
  } catch {
    throw new Error(
      "pg package is required for automated migrations. Install with: npm install --save-dev pg @types/pg"
    );
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

interface PgClient {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
}

async function verifySupabaseTables(): Promise<{
  remittances: boolean;
  fxQuotesPhase10: boolean;
  remitPayins: boolean;
}> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { remittances: false, fxQuotesPhase10: false, remitPayins: false };
  }

  const headers = {
    apikey:        key,
    Authorization: `Bearer ${key}`,
  };

  const remittancesRes = await fetch(`${url}/rest/v1/remittances?select=id&limit=1`, {
    headers,
  });
  const remittances = remittancesRes.ok;

  // Phase 10 columns — select fails if migration 002 not applied.
  const fxRes = await fetch(
    `${url}/rest/v1/fx_quotes?select=id,status,spread,stablefx_quote_id&limit=1`,
    { headers }
  );
  const fxQuotesPhase10 = fxRes.ok;

  // Migration 003 — payins / payouts / custody_wallets
  const payinsRes = await fetch(`${url}/rest/v1/payins?select=id&limit=1`, {
    headers,
  });
  const remitPayins = payinsRes.ok;

  return { remittances, fxQuotesPhase10, remitPayins };
}

function printManualInstructions(migrations: { name: string; sql: string }[]): void {
  console.log("\n=== Manual migration required ===\n");
  console.log(
    "Set SUPABASE_DB_URL to your direct Postgres connection string for automated runs,"
  );
  console.log("or apply the SQL below in Supabase Dashboard → SQL Editor → New query.\n");

  for (const migration of migrations) {
    console.log(`--- ${migration.name} ---\n`);
    console.log(migration.sql);
    console.log();
  }
}

async function main(): Promise<void> {
  const migrations = loadMigrationFiles();
  if (migrations.length === 0) {
    throw new Error(`No .sql files found in ${MIGRATIONS_DIR}`);
  }

  const combinedSql = migrations.map((m) => m.sql).join("\n\n");
  const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

  if (dbUrl) {
    console.log("Applying migrations via direct Postgres connection...");
    await applyViaPostgres(dbUrl, combinedSql);
    console.log(`✓ Applied ${migrations.length} migration file(s).`);
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && key) {
    console.log("Checking Supabase connectivity...");
    const tablesReady = await verifySupabaseTables();

    if (tablesReady.remittances && tablesReady.fxQuotesPhase10 && tablesReady.remitPayins) {
      console.log("✓ remittances + fx_quotes + payins reachable — schema OK.");
      return;
    }

    if (tablesReady.remittances && tablesReady.fxQuotesPhase10 && !tablesReady.remitPayins) {
      console.log("✓ remittances + fx_quotes OK, but payins/payouts tables missing.");
      console.log("Apply db/migrations/003_remit_payins_payouts.sql in Supabase SQL Editor:\n");
      const phase003 = migrations.filter((m) => m.name.includes("003"));
      printManualInstructions(phase003.length ? phase003 : migrations);
      process.exitCode = 1;
      return;
    }

    if (tablesReady.remittances && !tablesReady.fxQuotesPhase10) {
      console.log("✓ remittances OK, but Phase 10 fx_quotes columns missing.");
      console.log("Apply db/migrations/002_fx_quotes_phase10.sql in Supabase SQL Editor:\n");
      const phase10 = migrations.filter((m) => m.name.includes("002"));
      printManualInstructions(phase10.length ? phase10 : migrations);
      process.exitCode = 1;
      return;
    }

    console.log(
      "Supabase credentials are set but schema is not present (or not yet visible via REST)."
    );
    printManualInstructions(migrations);
    process.exitCode = 1;
    return;
  }

  console.log("No SUPABASE_DB_URL, DATABASE_URL, or Supabase credentials found.");
  printManualInstructions(migrations);
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("db:migrate FAILED:", message);
  process.exit(1);
});
