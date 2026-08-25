/**
 * Australian national accounts: GDP, GDP per capita, and GDP per hour worked.
 *
 * Dataflow ANA_AGG, "Australian National Accounts Key Aggregates", via the ABS
 * Data API.
 *
 * Why these three series together: they separate the two ways an economy can
 * grow. Headline GDP rises when you add people OR when each person produces
 * more. GDP per capita and GDP per hour worked isolate the second. When
 * headline GDP rises while GDP per capita falls, the growth came from
 * population rather than productivity, and the average person is worse off
 * while the aggregate looks healthy.
 *
 * That distinction is usually collapsed in public debate, where "the economy
 * grew" is reported without saying which mechanism produced it. These are the
 * official numbers that let anyone check.
 *
 * MEASURES, and picking the wrong one produces a misleading series:
 *   M1 Chain volume measures  — REAL terms, inflation-adjusted. Use this.
 *   M3 Current prices         — nominal, inflates with prices. Not comparable
 *                               across years without deflating.
 * This ingest keeps M1 and M2 (its percentage changes) and drops the rest.
 *
 * Usage:  node scripts/ingest-abs-national-accounts.mjs [--dry-run]
 */
import { writeFileSync } from "node:fs";
import { fetchText, parseSdmxCsv, toCsv, assertProvenance } from "./lib/register.mjs";

const DATAFLOW = "ABS,ANA_AGG,1.0.0";
const HOST = "https://data.api.abs.gov.au/rest";
const OUT = "data/gdp-per-capita-vs-population.csv";

// The series that answer "population growth or productivity growth?"
const ITEMS = new Set([
  "GPM",         // Gross domestic product
  "GPM_PCA",     // GDP per capita
  "GPM_PHW",     // GDP per hour worked
  "GVA_MKT_PHW", // Gross value added per hour worked, market sector
  "GPM_HRW",     // Hours worked
]);

// Real terms only. Nominal series are not comparable across years.
const MEASURES = new Set(["M1", "M2"]);

const COLUMNS = [
  "period",
  "data_item",
  "data_item_code",
  "measure",
  "measure_code",
  "seasonal_adjustment",
  "value",
  "unit",
  "source_tier",
  "source_url",
  "source_retrieved_at",
];

const dryRun = process.argv.includes("--dry-run");
const url = `${HOST}/data/${DATAFLOW}/all?startPeriod=2000&format=csv`;

const text = await fetchText(url, {
  headers: { Accept: "application/vnd.sdmx.data+csv;labels=both" },
  timeoutSec: 120,
});

const retrievedAt = new Date().toISOString();

const rows = parseSdmxCsv(text)
  .filter(
    (r) =>
      ITEMS.has(r.DATA_ITEM?.code) &&
      MEASURES.has(r.MEASURE?.code) &&
      r.OBS_VALUE?.code !== "",
  )
  .map((r) => ({
    period: r.TIME_PERIOD.code,
    data_item: r.DATA_ITEM?.label ?? "",
    data_item_code: r.DATA_ITEM?.code ?? "",
    measure: r.MEASURE?.label ?? "",
    measure_code: r.MEASURE?.code ?? "",
    seasonal_adjustment: r.TSEST?.label ?? "",
    value: r.OBS_VALUE.code,
    unit: r.UNIT_MEASURE?.label ?? "",
    source_tier: "primary",
    source_url: url,
    source_retrieved_at: retrievedAt,
  }))
  .sort(
    (a, b) =>
      a.period.localeCompare(b.period) ||
      a.data_item_code.localeCompare(b.data_item_code) ||
      a.measure_code.localeCompare(b.measure_code),
  );

assertProvenance(rows);

if (dryRun) {
  const items = [...new Set(rows.map((r) => r.data_item))];
  const periods = [...new Set(rows.map((r) => r.period))];
  console.log(`[dry-run] ${rows.length} rows`);
  console.log(`[dry-run] periods: ${periods[0]} to ${periods.at(-1)} (${periods.length})`);
  console.log(`[dry-run] series: ${items.join(" | ")}`);
  process.exit(0);
}

writeFileSync(OUT, toCsv(rows, COLUMNS));
console.log(`wrote ${OUT}: ${rows.length} rows, retrieved ${retrievedAt}`);
