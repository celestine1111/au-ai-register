/**
 * Australia's own migration figures, checked against a third party that can
 * contradict them.
 *
 * THE OBJECTION. Every headline migration number in Australian debate is
 * produced by the ABS or Home Affairs. Both sides quote it, but a figure
 * published by one interested party and checked by nobody is an assertion
 * dressed as a fact. If this register is going to be cited, the Australian
 * numbers have to face the same test it applies to everyone else.
 *
 * WHY THE OBVIOUS CHECK DOES NOT WORK. The intuitive fix is to ask the origin
 * country for its side and compare, the way trade statistics are checked by
 * "mirror" comparison between exporter and importer records. Migration has no
 * mirror. Almost no state records the departure of its own nationals, because
 * almost no state controls exit. The labour bureaus that do keep records, in
 * India, Bangladesh, Pakistan, Nepal and Sri Lanka, are counting a narrow
 * instrument (vetted foreign employment contracts) that carries almost nobody
 * to Australia. See data/origin-country-emigration-registers.csv. Those numbers
 * cannot confirm or refute an Australian arrival count, because they are not
 * measuring the same thing.
 *
 * WHAT DOES WORK. A third party that estimates every country on one method and
 * has no stake in the Australian argument. That is the UN Population Division,
 * republished through the World Bank's keyless API. It is independent of
 * Australia and independent of the origin countries, so it is free to disagree.
 *
 * AND IT DOES DISAGREE, on one of the two measures. That split is the finding,
 * and it is more useful than either a clean pass or a clean fail:
 *
 *   STOCK  (how many foreign-born people live in Australia)
 *          ABS Census and the UN estimate land within a couple of per cent.
 *          Australia's count of who is here is independently confirmed.
 *
 *   FLOW   (how many people net arrive in a year)
 *          The two differ by more than a factor of two. Not because either is
 *          dishonest: ABS measures flow directly at the border under the 12/16
 *          month rule, while the UN derives it residually from population
 *          balance and smooths it across multi-year periods, which flattens
 *          exactly the post-2022 spike that the whole Australian argument is
 *          about.
 *
 * The practical rule that falls out, and it is the honest one to publish: for
 * annual Australian migration flow, ABS is the better instrument and the UN
 * figure should not be quoted against it. For international comparison and for
 * the size of the resident migrant population, the UN series is independent
 * corroboration and Australia passes it. Anyone quoting the UN's 138,510 as
 * Australia's 2024 migration intake is quoting a smoothed residual, not a
 * measurement, and this file exists so that mistake is checkable.
 *
 * Usage:  node scripts/build-corroboration.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { toCsv, assertProvenance } from "./lib/register.mjs";

const OUT = "data/corroboration.csv";
// Anything inside this band counts as agreement between two independent
// instruments. Stated up front rather than chosen after seeing the results.
const AGREEMENT_BAND_PCT = 5;

const readCsv = (f) => {
  const lines = readFileSync(`data/${f}`, "utf8").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.match(/("([^"]|"")*"|[^,]*)/g).filter((_, i) => i % 2 === 0);
    const o = {};
    head.forEach((h, i) => (o[h] = (cells[i] ?? "").replace(/^"|"$/g, "").replace(/""/g, '"')));
    return o;
  });
};

const COLUMNS = [
  "measure",
  "australian_period",
  "australian_value",
  "australian_source",
  "independent_period",
  "independent_value",
  "independent_source",
  "difference",
  "difference_pct",
  "verdict",
  "explanation",
  "source_tier",
  "source_url",
  "source_retrieved_at",
];

const dryRun = process.argv.includes("--dry-run");
const retrievedAt = new Date().toISOString();
const rows = [];

const cob = readCsv("population-by-country-of-birth.csv");
const nom = readCsv("nom-by-visa.csv");
const ind = readCsv("independent-migration-estimates.csv");

const absUrl = cob[0]?.source_url ?? "";
const wbStockUrl = ind.find((r) => r.country_iso3 === "AUS" && r.indicator === "migrant_stock")?.source_url ?? "";
const wbNetUrl = ind.find((r) => r.country_iso3 === "AUS" && r.indicator === "net_migration")?.source_url ?? "";

const verdict = (pct) =>
  Math.abs(pct) <= AGREEMENT_BAND_PCT ? "corroborated" : "divergent";

const add = (o) => {
  const diff = o.australian_value - o.independent_value;
  const pct = (diff / o.independent_value) * 100;
  rows.push({
    ...o,
    difference: Math.round(diff),
    difference_pct: pct.toFixed(1),
    verdict: verdict(pct),
    source_tier: "primary",
    source_retrieved_at: retrievedAt,
  });
};

// --- 1. STOCK: foreign-born residents ------------------------------------
// ABS Census counts every resident's country of birth. The UN estimates the
// same population independently. Census years only, matched to the nearest UN
// reference year, which is stated in the row rather than hidden.
const UN_STOCK_YEAR_FOR_CENSUS = { 2011: "2010", 2016: "2015", 2021: "2020" };

for (const [censusYear, unYear] of Object.entries(UN_STOCK_YEAR_FOR_CENSUS)) {
  const inYear = cob.filter((r) => r.census_year === censusYear && r.region === "Australia");
  const total = Number(inYear.find((r) => r.country_of_birth === "Total")?.persons ?? 0);
  const auBorn = Number(inYear.find((r) => r.country_of_birth === "Australia")?.persons ?? 0);
  if (!total || !auBorn) continue;
  const overseasBorn = total - auBorn;

  const un = ind.find(
    (r) => r.country_iso3 === "AUS" && r.indicator === "migrant_stock" && r.year === unYear,
  );
  if (!un) continue;

  add({
    measure: "Foreign-born residents of Australia (stock)",
    australian_period: `Census ${censusYear}`,
    australian_value: overseasBorn,
    australian_source: "ABS ABS_ERP_COB_STATE, total population minus Australia-born",
    independent_period: unYear,
    independent_value: Number(un.value),
    independent_source: "UN Population Division international migrant stock, via World Bank SM.POP.TOTL",
    explanation:
      `Two independent counts of the same resident population, ${censusYear} census against the UN's ${unYear} reference year. ` +
      "A direct enumeration checked against an external estimate built on a different method.",
    source_url: `${absUrl} | ${wbStockUrl}`,
  });
}

// --- 2. FLOW: net overseas migration --------------------------------------
// ABS NOM is arrivals minus departures by visa group, financial year ending.
// Excluding the 'Total' visa group is essential: including it double counts,
// because the total row is itself a sum of the groups.
const nomByYear = {};
for (const r of nom) {
  if (r.region !== "Australia") continue;
  if (/total/i.test(r.visa_group)) continue;
  const y = r.financial_year_ending;
  const v = Number(r.persons);
  if (!Number.isFinite(v)) continue;
  nomByYear[y] ??= { arrivals: 0, departures: 0 };
  if (/arrival/i.test(r.migration_type)) nomByYear[y].arrivals += v;
  else if (/departure/i.test(r.migration_type)) nomByYear[y].departures += v;
}

for (const [year, v] of Object.entries(nomByYear).sort()) {
  const net = v.arrivals - v.departures;
  if (!net) continue;
  const un = ind.find(
    (r) => r.country_iso3 === "AUS" && r.indicator === "net_migration" && r.year === year,
  );
  if (!un) continue;

  add({
    measure: "Net overseas migration to Australia (flow)",
    australian_period: `Financial year ending ${year}`,
    australian_value: net,
    australian_source: "ABS ABS_NOM_VISA_FY, arrivals minus departures, all visa groups excluding Total",
    independent_period: `Calendar year ${year}`,
    independent_value: Number(un.value),
    independent_source: "UN Population Division net migration, via World Bank SM.POP.NETM",
    explanation:
      "Not like for like on period (Australian financial year against UN calendar year) and, more importantly, not like for like on method. " +
      "ABS measures border crossings directly under the 12/16 month rule. The UN derives net migration residually from population balance and smooths it across multi-year periods, " +
      "which suppresses short spikes. Where these diverge, ABS is the better instrument for an annual Australian figure.",
    source_url: `${nom[0]?.source_url ?? ""} | ${wbNetUrl}`,
  });
}

assertProvenance(rows);

if (dryRun) {
  console.log(`[dry-run] ${rows.length} corroboration rows (agreement band +/-${AGREEMENT_BAND_PCT}%)\n`);
  for (const r of rows) {
    console.log(
      `[dry-run] ${r.measure.slice(0, 46).padEnd(46)} ${r.australian_period.padEnd(26)} ` +
        `AU ${Number(r.australian_value).toLocaleString().padStart(10)}  ` +
        `IND ${Number(r.independent_value).toLocaleString().padStart(10)}  ` +
        `${String(r.difference_pct).padStart(7)}%  ${r.verdict}`,
    );
  }
  process.exit(0);
}

writeFileSync(OUT, toCsv(rows, COLUMNS));
console.log(`wrote ${OUT}: ${rows.length} rows, retrieved ${retrievedAt}`);
