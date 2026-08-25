/**
 * House prices against earnings: the measure of whether a wage still buys a home.
 *
 * Two ABS series via the Data API:
 *   RPPI — Residential Property Price Index, by capital city, quarterly
 *   AWE  — Average Weekly Earnings, all employees, total earnings, half-yearly
 *
 * Why together: a house price rising means nothing on its own, because wages
 * rise too. What decides whether a young Australian can buy is whether prices
 * rose FASTER than pay. Both series are indexed to a common base year here so
 * the divergence is directly readable, which is the number the housing debate
 * usually talks around.
 *
 * KNOWN LIMIT, stated because it constrains every claim built on this: the
 * RPPI dataflow in the API ends at 2021-Q4. That is a decade of data, but it
 * is not current, and any piece using it must say so rather than implying it
 * describes today's market. ABS publishes more recent property price data in
 * releases that are not exposed through this API.
 *
 * SECOND LIMIT: AWE is average, not median. Averages are pulled up by high
 * earners, so this UNDERSTATES the affordability gap for a typical worker.
 * Erring toward understatement is deliberate: a figure that undershoots
 * survives challenge, one that overshoots does not.
 *
 * Usage:  node scripts/ingest-abs-housing-affordability.mjs [--dry-run]
 */
import { writeFileSync } from "node:fs";
import { fetchText, parseSdmxCsv, toCsv, assertProvenance } from "./lib/register.mjs";

const HOST = "https://data.api.abs.gov.au/rest";
const OUT = "data/housing-affordability.csv";
const BASE_YEAR = "2012";

const RPPI_URL = `${HOST}/data/ABS,RPPI,1.0.0/all?startPeriod=2012&format=csv`;
const AWE_URL = `${HOST}/data/ABS,AWE,1.0.0/all?startPeriod=2012&format=csv`;

const COLUMNS = [
  "period",
  "series",
  "region",
  "index_value",
  "indexed_to_2012_base",
  "raw_value",
  "unit",
  "source_tier",
  "source_url",
  "source_retrieved_at",
];

const dryRun = process.argv.includes("--dry-run");
const headers = { Accept: "application/vnd.sdmx.data+csv;labels=both" };
const retrievedAt = new Date().toISOString();

// --- property prices: index numbers, weighted average of eight capitals ----
const rppiText = await fetchText(RPPI_URL, { headers, timeoutSec: 120 });
const rppi = parseSdmxCsv(rppiText).filter(
  (r) =>
    r.MEASURE?.code === "1" &&                 // index numbers, not % change
    r.REGION?.code === "100" &&                 // weighted average of 8 capitals
    r.OBS_VALUE?.code !== "",
);

// --- earnings: all employees, total earnings, Australia, original ----------
const aweText = await fetchText(AWE_URL, { headers, timeoutSec: 120 });
const awe = parseSdmxCsv(aweText).filter(
  (r) =>
    r.MEASURE?.code === "1" &&                  // all employees average weekly total earnings
    r.ESTIMATE_TYPE?.code === "1" &&            // Earnings, NOT Standard Error. Omitting this
                                                // mixes error terms (~15) with dollar values
                                                // (~1500) and destroys the index.
    r.REGION?.code === "AUS" &&
    r.SEX?.code === "3" &&                      // persons
    r.INDUSTRY?.code === "TOT" &&               // all industries
    r.SECTOR?.code === "7" &&                   // private and public
    r.TSEST?.code === "10" &&                   // original
    r.OBS_VALUE?.code !== "",
);

/** Index a series to its earliest observation in the base year = 100. */
function indexSeries(records, valueOf, periodOf) {
  const sorted = [...records].sort((a, b) => periodOf(a).localeCompare(periodOf(b)));
  const first = sorted.find((r) => periodOf(r).startsWith(BASE_YEAR));
  const base = first ? valueOf(first) : null;
  return sorted.map((r) => ({
    record: r,
    period: periodOf(r),
    value: valueOf(r),
    indexed: base ? +((valueOf(r) / base) * 100).toFixed(1) : null,
  }));
}

const rppiIdx = indexSeries(rppi, (r) => Number(r.OBS_VALUE.code), (r) => r.TIME_PERIOD.code);
const aweIdx = indexSeries(awe, (r) => Number(r.OBS_VALUE.code), (r) => r.TIME_PERIOD.code);

const rows = [
  ...rppiIdx.map((x) => ({
    period: x.period,
    series: "Residential property price index (weighted average, 8 capital cities)",
    region: "Australia (8 capitals)",
    index_value: x.value,
    indexed_to_2012_base: x.indexed,
    raw_value: "",
    unit: "Index",
    source_tier: "primary",
    source_url: RPPI_URL,
    source_retrieved_at: retrievedAt,
  })),
  ...aweIdx.map((x) => ({
    period: x.period,
    series: "Average weekly total earnings, all employees",
    region: "Australia",
    index_value: "",
    indexed_to_2012_base: x.indexed,
    raw_value: x.value,
    unit: "AUD per week",
    source_tier: "primary",
    source_url: AWE_URL,
    source_retrieved_at: retrievedAt,
  })),
].sort((a, b) => a.period.localeCompare(b.period) || a.series.localeCompare(b.series));

assertProvenance(rows);

/** Compare only at a shared end date. The two series end at different points
 *  (property 2021-Q4, earnings 2026-S1), and differencing across different
 *  dates is not a comparison, it is a category error that a critic finds
 *  immediately. */
export function likeForLike(priceIdx, wageIdx) {
  const lastPrice = priceIdx.at(-1);
  if (!lastPrice) return null;
  const year = lastPrice.period.slice(0, 4);
  const wageSame = [...wageIdx].reverse().find((w) => w.period.slice(0, 4) <= year);
  if (!wageSame) return null;
  return {
    pricePeriod: lastPrice.period,
    priceIndex: lastPrice.indexed,
    wagePeriod: wageSame.period,
    wageIndex: wageSame.indexed,
    gapPoints: +(lastPrice.indexed - wageSame.indexed).toFixed(1),
  };
}

if (dryRun) {
  const cmp = likeForLike(rppiIdx, aweIdx);
  console.log(`[dry-run] ${rows.length} rows`);
  console.log(`[dry-run] prices: ${rppiIdx[0]?.period} = 100 -> ${rppiIdx.at(-1)?.period} = ${rppiIdx.at(-1)?.indexed}`);
  console.log(`[dry-run] earnings: ${aweIdx[0]?.period} = 100 -> ${aweIdx.at(-1)?.period} = ${aweIdx.at(-1)?.indexed}`);
  if (cmp) {
    console.log(`[dry-run] LIKE FOR LIKE at ${cmp.pricePeriod} / ${cmp.wagePeriod}:`);
    console.log(`[dry-run]   prices ${cmp.priceIndex} vs earnings ${cmp.wageIndex} = ${cmp.gapPoints} point gap`);
  }
  process.exit(0);
}

writeFileSync(OUT, toCsv(rows, COLUMNS));
console.log(`wrote ${OUT}: ${rows.length} rows, retrieved ${retrievedAt}`);
