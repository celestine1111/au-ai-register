/**
 * Net overseas migration by visa group, from the ABS Data API.
 *
 * Dataflow ABS_NOM_VISA_FY: "Overseas migration, arrivals, departures,
 * state/territory, visa and citizenship", financial years.
 *
 * Why this dataset leads the register: it is the only official series that
 * splits net overseas migration by VISA GROUP. The public debate runs on a
 * single headline NOM number, which hides that the composition (temporary
 * versus permanent, student versus skilled) moves independently of the total.
 * Every argument about intake settings needs the composition, and almost
 * nobody publishes it in a usable form.
 *
 * ENDPOINT NOTE, and it costs an afternoon if you miss it: the live host is
 * data.api.abs.gov.au/rest/. Older ABS documentation and most tutorials still
 * show api.data.abs.gov.au (subdomain order swapped), which does not resolve at
 * all — so a build against it fails as a DNS error and reads like a network
 * flake rather than a wrong URL. Verified live 2026-08-23.
 *
 * Usage:  node scripts/ingest-abs-nom.mjs [--dry-run] [--start 2015]
 */
import { writeFileSync } from "node:fs";
import { fetchText, parseSdmxCsv, toCsv, assertProvenance } from "./lib/register.mjs";

const DATAFLOW = "ABS,ABS_NOM_VISA_FY,1.0.0";
const HOST = "https://data.api.abs.gov.au/rest";
const OUT = "data/nom-by-visa.csv";

const COLUMNS = [
  "financial_year_ending",
  "visa_group",
  "visa_group_code",
  "migration_type",
  "region",
  "persons",
  "unit",
  "source_tier",
  "source_url",
  "source_retrieved_at",
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const start = (args[args.indexOf("--start") + 1] ?? "2015").replace(/\D/g, "") || "2015";

const url = `${HOST}/data/${DATAFLOW}/all?startPeriod=${start}&format=csv`;

const text = await fetchText(url, {
  headers: { Accept: "application/vnd.sdmx.data+csv;labels=both" },
});

const retrievedAt = new Date().toISOString();
const parsed = parseSdmxCsv(text);

const rows = parsed
  .filter((r) => r.OBS_VALUE?.code !== "" && r.TIME_PERIOD?.code)
  .map((r) => ({
    financial_year_ending: r.TIME_PERIOD.code,
    visa_group: r.MEASURE?.label ?? "",
    visa_group_code: r.MEASURE?.code ?? "",
    migration_type: r.MIGRATIONTYPE?.label ?? "",
    region: r.REGION?.label ?? "",
    persons: r.OBS_VALUE.code,
    unit: r.UNIT_MEASURE?.label ?? "",
    // The ABS series is an official statistical publication, so every row is a
    // primary record. `url` is the exact query that produced it, which means a
    // reader can re-run the identical call and get the identical numbers.
    source_tier: "primary",
    source_url: url,
    source_retrieved_at: retrievedAt,
  }))
  // Stable ordering so a weekly re-run produces a git diff of real changes
  // rather than reshuffled rows. The diff IS the changelog, so noise in it
  // destroys the audit trail the register exists to provide.
  .sort(
    (a, b) =>
      a.financial_year_ending.localeCompare(b.financial_year_ending) ||
      a.region.localeCompare(b.region) ||
      a.migration_type.localeCompare(b.migration_type) ||
      a.visa_group.localeCompare(b.visa_group),
  );

assertProvenance(rows);

if (dryRun) {
  console.log(`[dry-run] ${rows.length} rows from ${url}`);
  console.log(`[dry-run] years ${rows[0]?.financial_year_ending} to ${rows.at(-1)?.financial_year_ending}`);
  console.log(`[dry-run] visa groups: ${[...new Set(rows.map((r) => r.visa_group))].join(" | ")}`);
  process.exit(0);
}

writeFileSync(OUT, toCsv(rows, COLUMNS));
console.log(`wrote ${OUT}: ${rows.length} rows, retrieved ${retrievedAt}`);
