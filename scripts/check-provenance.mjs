/**
 * CI gate: every row in every dataset must be checkable.
 *
 * This register's only asset is that a reader can verify any figure in it
 * against a public record. A single row with a blank source_url quietly turns
 * the dataset from evidence into assertion, and nobody downstream can tell
 * which row it was. So this fails the build rather than warning.
 *
 * Checks, per data/*.csv:
 *   1. source_url, source_retrieved_at and source_tier columns exist
 *   2. no row has a blank value in any of them
 *   3. source_tier is exactly "primary" or "claim"
 *   4. source_url is a well-formed absolute http(s) URL
 *   5. source_url is NOT a bare homepage — a front page changes daily and
 *      cannot evidence a historical figure
 *   6. source_retrieved_at parses as a date and is not in the future
 *
 * Usage:  node scripts/check-provenance.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DATA_DIR = "data";
const REQUIRED = ["source_tier", "source_url", "source_retrieved_at"];
const TIERS = new Set(["primary", "claim"]);

function splitCsvLine(line) {
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function isBareHomepage(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, "") === "" && !u.search && !u.hash;
  } catch {
    return false;
  }
}

let files;
try {
  files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv"));
} catch {
  console.log("no data/ directory yet — nothing to check");
  process.exit(0);
}

if (files.length === 0) {
  console.log("no CSV datasets yet — nothing to check");
  process.exit(0);
}

const now = Date.now();
let totalRows = 0;
const failures = [];

for (const file of files) {
  const full = path.join(DATA_DIR, file);
  const lines = readFileSync(full, "utf8").trim().split(/\r?\n/);
  if (lines.length < 2) {
    failures.push(`${file}: has a header but no rows`);
    continue;
  }
  const headers = splitCsvLine(lines[0]);
  const missingCols = REQUIRED.filter((c) => !headers.includes(c));
  if (missingCols.length) {
    failures.push(`${file}: missing required column(s): ${missingCols.join(", ")}`);
    continue;
  }
  const idx = Object.fromEntries(REQUIRED.map((c) => [c, headers.indexOf(c)]));

  lines.slice(1).forEach((line, i) => {
    totalRows++;
    const cells = splitCsvLine(line);
    const lineNo = i + 2;
    const tier = cells[idx.source_tier]?.trim();
    const url = cells[idx.source_url]?.trim();
    const at = cells[idx.source_retrieved_at]?.trim();

    if (!tier) failures.push(`${file}:${lineNo} blank source_tier`);
    else if (!TIERS.has(tier)) failures.push(`${file}:${lineNo} source_tier "${tier}" must be primary or claim`);

    if (!url) failures.push(`${file}:${lineNo} blank source_url`);
    else if (!/^https?:\/\//i.test(url)) failures.push(`${file}:${lineNo} source_url is not an absolute http(s) URL: ${url}`);
    else if (isBareHomepage(url)) failures.push(`${file}:${lineNo} source_url is a bare homepage, which cannot evidence a figure: ${url}`);

    if (!at) failures.push(`${file}:${lineNo} blank source_retrieved_at`);
    else {
      const ts = Date.parse(at);
      if (Number.isNaN(ts)) failures.push(`${file}:${lineNo} source_retrieved_at is not a date: ${at}`);
      else if (ts > now + 86_400_000) failures.push(`${file}:${lineNo} source_retrieved_at is in the future: ${at}`);
    }
  });
}

if (failures.length) {
  console.error(`provenance check FAILED — ${failures.length} problem(s):\n`);
  for (const f of failures.slice(0, 40)) console.error(`  ${f}`);
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  process.exit(1);
}

console.log(`provenance OK: ${totalRows} rows across ${files.length} dataset(s) — ${files.join(", ")}`);
