/**
 * Australian resident population by country of birth, from the ABS Data API.
 *
 * Dataflow ABS_ERP_COB_STATE: estimated resident population by country of
 * birth, age, sex and state.
 *
 * Why this dataset matters: it is the only official series that shows how the
 * COMPOSITION of Australia's migrant population has changed by origin over
 * time. The public debate runs on a single headline intake number, which cannot
 * show that some source countries grew by 45% in five years while others went
 * backwards. That shift is measurable, and nobody publishes it in a form you
 * can query.
 *
 * IMPORTANT LIMIT, recorded here because misreading it is the obvious failure
 * mode: this is a STOCK series, not a flow. It counts people resident in
 * Australia at a point in time, so year-on-year change nets out departures and
 * deaths and is NOT the same as arrivals. For flow, use nom-by-visa.csv.
 *
 * Second limit: the series is published for CENSUS YEARS ONLY (1996, 2001,
 * 2006, 2011, 2016, 2021), not annually. The most recent point is therefore
 * 2021, and the 2016-2021 interval contains roughly eighteen months of closed
 * borders, which suppresses growth relative to a normal period.
 *
 * Usage:  node scripts/ingest-abs-country-of-birth.mjs [--dry-run]
 */
import { writeFileSync } from "node:fs";
import { fetchText, parseSdmxCsv, toCsv, assertProvenance } from "./lib/register.mjs";

const DATAFLOW = "ABS,ABS_ERP_COB_STATE,1.0.0";
const HOST = "https://data.api.abs.gov.au/rest";
const OUT = "data/population-by-country-of-birth.csv";

const COLUMNS = [
  "census_year",
  "country_of_birth",
  "country_code",
  "region",
  "persons",
  "source_tier",
  "source_url",
  "source_retrieved_at",
];

const dryRun = process.argv.includes("--dry-run");
const url = `${HOST}/data/${DATAFLOW}/all?format=csv`;

const text = await fetchText(url, {
  headers: { Accept: "application/vnd.sdmx.data+csv;labels=both" },
  timeoutSec: 120,
});

const retrievedAt = new Date().toISOString();

// Australia-wide, all ages, both sexes. The dataflow also carries state, age
// and sex breakdowns; those multiply the row count by roughly 500x for no gain
// at the level this register reports, and a dataset nobody can open is not a
// dataset anyone cites.
const rows = parseSdmxCsv(text)
  .filter(
    (r) =>
      r.REGION?.code === "AUS" &&
      r.SEX?.code === "3" &&
      r.AGE?.code?.startsWith("TOT") &&
      r.OBS_VALUE?.code !== "",
  )
  .map((r) => ({
    census_year: r.TIME_PERIOD.code,
    country_of_birth: r.COUNTRY_BIRTH?.label ?? "",
    country_code: r.COUNTRY_BIRTH?.code ?? "",
    region: "Australia",
    persons: r.OBS_VALUE.code,
    source_tier: "primary",
    source_url: url,
    source_retrieved_at: retrievedAt,
  }))
  .sort(
    (a, b) =>
      a.census_year.localeCompare(b.census_year) ||
      a.country_of_birth.localeCompare(b.country_of_birth),
  );

assertProvenance(rows);

if (dryRun) {
  const years = [...new Set(rows.map((r) => r.census_year))];
  const countries = new Set(rows.map((r) => r.country_of_birth));
  console.log(`[dry-run] ${rows.length} rows`);
  console.log(`[dry-run] census years: ${years.join(", ")}`);
  console.log(`[dry-run] countries of birth: ${countries.size}`);
  process.exit(0);
}

writeFileSync(OUT, toCsv(rows, COLUMNS));
console.log(`wrote ${OUT}: ${rows.length} rows, retrieved ${retrievedAt}`);
