/**
 * Living costs by household type, from ABS Selected Living Cost Indexes (LCI).
 *
 * Why this rather than CPI, and it matters: **the ABS states that CPI is not a
 * cost-of-living index.** CPI measures price change for a fixed basket and
 * **excludes mortgage interest charges**, which were removed in 1998. That is
 * why ABS publishes the LCI separately — it includes mortgage interest and
 * splits results by household type.
 *
 * So when someone says the official inflation figure understates what
 * households actually feel, the sophisticated version of that argument is not
 * a conspiracy claim. It is ABS publishing a second series precisely because
 * the first one does not measure household living costs.
 *
 * Household types, which map onto real groups rather than an average:
 *   P1    Employee households          — working people, mortgage exposed
 *   P2    Age pensioner households     — retirees on the pension
 *   P3    Other government transfer recipients
 *   P4    Self-funded retiree households
 *   PBLCI Pensioner and beneficiary households
 *
 * Current to 2026-Q2, which makes this the freshest series in the register.
 *
 * LIMIT: an index measures change from a base, not level. A household type
 * with lower index growth is not better off in absolute terms, only facing
 * slower cost growth from wherever it started.
 *
 * Usage:  node scripts/ingest-abs-living-costs.mjs [--dry-run]
 */
import { writeFileSync } from "node:fs";
import { fetchText, parseSdmxCsv, toCsv, assertProvenance } from "./lib/register.mjs";

const HOST = "https://data.api.abs.gov.au/rest";
const OUT = "data/living-costs-by-household.csv";
const URL = `${HOST}/data/ABS,LCI,1.0.0/all?startPeriod=2012&format=csv`;

const COLUMNS = [
  "period",
  "household_type",
  "household_type_code",
  "index_group",
  "index_number",
  "source_tier",
  "source_url",
  "source_retrieved_at",
];

const dryRun = process.argv.includes("--dry-run");
const retrievedAt = new Date().toISOString();

const text = await fetchText(URL, {
  headers: { Accept: "application/vnd.sdmx.data+csv;labels=both" },
  timeoutSec: 120,
});

// MEASURE 1 = index numbers. INDEX 10001 = All groups, the headline series per
// household type. Sub-indices (health, education, insurance) are excluded here
// to keep the dataset readable; they are one parameter change away if needed.
const rows = parseSdmxCsv(text)
  .filter(
    (r) =>
      r.MEASURE?.code === "1" &&
      r.INDEX?.code === "10001" &&
      r.OBS_VALUE?.code !== "",
  )
  .map((r) => ({
    period: r.TIME_PERIOD.code,
    household_type: r.HOUSHOLD_TYPE?.label ?? "",
    household_type_code: r.HOUSHOLD_TYPE?.code ?? "",
    index_group: r.INDEX?.label ?? "All groups",
    index_number: r.OBS_VALUE.code,
    source_tier: "primary",
    source_url: URL,
    source_retrieved_at: retrievedAt,
  }))
  .sort(
    (a, b) =>
      a.period.localeCompare(b.period) ||
      a.household_type_code.localeCompare(b.household_type_code),
  );

assertProvenance(rows);

if (dryRun) {
  const byType = {};
  for (const r of rows) {
    byType[r.household_type] ??= [];
    byType[r.household_type].push(r);
  }
  console.log(`[dry-run] ${rows.length} rows`);
  console.log(`[dry-run] ${rows[0]?.period} to ${rows.at(-1)?.period}`);
  console.log("[dry-run] cost growth since the first available quarter:");
  for (const [type, rs] of Object.entries(byType)) {
    const first = Number(rs[0].index_number);
    const last = Number(rs.at(-1).index_number);
    const pct = (((last - first) / first) * 100).toFixed(1);
    console.log(`[dry-run]   ${type.padEnd(48)} +${pct}%`);
  }
  process.exit(0);
}

writeFileSync(OUT, toCsv(rows, COLUMNS));
console.log(`wrote ${OUT}: ${rows.length} rows, retrieved ${retrievedAt}`);
