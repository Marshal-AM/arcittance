/**
 * CI gate: fail if Polkadot/Paseo/XCM/PVM/mock-token references remain.
 */

import * as fs   from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..");

const SCAN_DIRS = [
  "contracts",
  "config",
  "circle",
  "scripts",
  "test/unit",
  "deployments",
  "db",
  "docs",
  ".github",
  "frontend",
];

const SCAN_FILES = [
  "hardhat.config.ts",
  "package.json",
  ".env.example",
  "frontend/.env.example",
];

const EXCLUDE_DIRS = new Set([
  "node_modules",
  "artifacts",
  "cache",
  "typechain-types",
  "legacy",
  ".next",
  "__tests__",
  "__mocks__",
  "cypress",
]);

const EXCLUDE_FILE_PATTERNS = [
  /check-forbidden-refs/,
  /MIGRATION_STATUS/,
  /phaseDocs/,
  /lib\/papi\//,
  /jest\.env/,
  /polkadot-api\.ts$/,
];

const FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /PASEO_RPC_URL/gi,           label: "PASEO_RPC_URL" },
  { pattern: /PASEO_WS_URL/gi,           label: "PASEO_WS_URL" },
  { pattern: /\b420420417\b/g,            label: "Paseo chain ID 420420417" },
  { pattern: /\bparachainId\b/g,         label: "parachainId" },
  { pattern: /\bIXcm\b/g,                label: "IXcm" },
  { pattern: /0x00000000000000000000000000000000000a0000/gi, label: "XCM precompile" },
  { pattern: /0xFFFFFFFF/gi,              label: "precompile formula 0xFFFFFFFF" },
  { pattern: /\bmUSDC\b/g,               label: "mUSDC" },
  { pattern: /\bmUSDT\b/g,               label: "mUSDT" },
  { pattern: /\b1337\b/g,                label: "asset id 1337" },
  { pattern: /\b1984\b/g,                label: "asset id 1984" },
  { pattern: /MOCK_ERC20/gi,             label: "MOCK_ERC20" },
  { pattern: /polkadot-api/gi,            label: "polkadot-api" },
  { pattern: /@polkadot\/api/gi,         label: "@polkadot/api" },
  { pattern: /rust-contracts/gi,         label: "rust-contracts" },
  { pattern: /activeScheduler/gi,        label: "activeScheduler" },
  { pattern: /PayrollSchedulerFallback/gi, label: "PayrollSchedulerFallback" },
  { pattern: /MockIXcm/gi,               label: "MockIXcm" },
  { pattern: /MockPayrollScheduler/gi,    label: "MockPayrollScheduler" },
  { pattern: /ReentrantScheduler/gi,     label: "ReentrantScheduler" },
];

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    if (entry.name === "package-lock.json") continue;
    if (entry.name === ".env.local") continue;
    if (entry.name === "cypress.env.json") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (/\.(ts|tsx|sol|json|md|yml|yaml|example|local)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function main(): void {
  const files: string[] = [];
  for (const d of SCAN_DIRS) {
    files.push(...collectFiles(path.join(ROOT, d)));
  }
  for (const f of SCAN_FILES) {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) files.push(full);
  }

  const violations: string[] = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (EXCLUDE_FILE_PATTERNS.some(p => p.test(rel))) continue;
    if (rel.includes("test/mocks")) continue;
    if (rel.includes("test/integration/legacy")) continue;

    const content = fs.readFileSync(file, "utf8");
    for (const { pattern, label } of FORBIDDEN_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        violations.push(`${rel}: contains forbidden reference "${label}"`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("Forbidden Polkadot/Paseo references found:\n");
    violations.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }

  console.log(`check-forbidden-refs: OK (${files.length} files scanned)`);
}

main();
