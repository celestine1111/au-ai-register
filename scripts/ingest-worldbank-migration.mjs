/**
 * Independent migration estimates from the World Bank, serving the UN
 * Population Division's figures.
 *
 * WHY THIS DATASET EXISTS. Everything else in this register measuring migration
 * into Australia is measured BY Australia. That is a fair objection: a single
 * party counting a flow it has an interest in is not verified, it is asserted.
 *
 * The obvious fix is to ask the origin country for its side. That fix does not
 * work, and the reason is structural rather than evasive. Trade statistics can
 * be verified by "mirror" comparison because both countries record the same
 * shipment, so a gap between the two is visible. Migration has no mirror.
 * Almost no country records departures of its own nationals, because almost no
 * country controls exit. India's emigration file covers 14 destinations because
 * it is a labour-protection instrument for a designated list of countries, not
 * a register of everyone who leaves. Asking Delhi how many Indians moved to
 * Australia asks for a number no Indian agency is positioned to hold.
 *
 * So verification has to come from a THIRD party that estimates both sides on
 * one method. That is the UN Population Division, whose estimates the World
 * Bank republishes through a keyless API. Two indicators matter:
 *
 *   SM.POP.TOTL — international migrant STOCK, people living in a country who
 *                 were born elsewhere. A level.
 *   SM.POP.NETM — NET MIGRATION, arrivals minus departures. A flow.
 *
 * Both are independent of Australia and independent of the origin country, so
 * either can contradict the Australian series. One of them does. See
 * build-corroboration.mjs, which is the point of collecting this.
 *
 * LIMIT, and it is the important one: these are COUNTRY TOTALS, not corridors.
 * The UN does not publish "Indians who moved to Australia" on this API. India's
 * net migration of -630,830 in 2024 is everyone leaving India for everywhere,
 * so it bounds the Australian corridor from above and cannot confirm it
 * directly. A dataset that pretended otherwise would be the exact failure this
 * register was built to avoid.
 *
 * Usage:  node scripts/ingest-worldbank-migration.mjs [--dry-run]
 */
import { writeFileSync } from "node:fs";
import { fetchText, toCsv, assertProvenance } from "./lib/register.mjs";

const OUT = "data/independent-migration-estimates.csv";
const HOST = "https://api.worldbank.org/v2";

// Grouped so the CSV can be read by why-each-country-is-here, not just by code.
// "origin" = countries named in the Australian migration debate as sources.
// "reference" = Australia itself plus comparable destinations, for contrast.
const COUNTRIES = [
  ["AUS", "Australia", "reference"],
  ["NZL", "New Zealand", "reference"],
  ["GBR", "United Kingdom", "reference"],
  ["CAN", "Canada", "reference"],
  ["IND", "India", "origin"],
  ["PAK", "Pakistan", "origin"],
  ["BGD", "Bangladesh", "origin"],
  ["NPL", "Nepal", "origin"],
  ["LKA", "Sri Lanka", "origin"],
  ["PHL", "Philippines", "origin"],
  ["CHN", "China", "origin"],
  ["VNM", "Viet Nam", "origin"],
  ["IDN", "Indonesia", "origin"],
  ["AFG", "Afghanistan", "origin"],
  ["IRN", "Iran, Islamic Rep.", "origin"],
  ["IRQ", "Iraq", "origin"],
  ["LBN", "Lebanon", "origin"],
  ["EGY", "Egypt, Arab Rep.", "origin"],
  ["MAR", "Morocco", "origin"],
  ["NGA", "Nigeria", "origin"],
  ["ZAF", "South Africa", "origin"],
  ["KEN", "Kenya", "origin"],
  ["ETH", "Ethiopia", "origin"],
  ["SDN", "Sudan", "origin"],
  ["SOM", "Somalia", "origin"],
];

const INDICATORS = [
  ["SM.POP.NETM", "net_migration", "Net migration (arrivals minus departures), UN Population Division estimate"],
  ["SM.POP.TOTL", "migrant_stock", "International migrant stock (foreign-born residents), UN Population Division estimate"],
];

const COLUMNS = [
  "year",
  "country_iso3",
  "country_name",
  "country_role",
  "indicator",
  "indicator_code",
  "value",
  "measure_note",
  "source_tier",
  "source_url",
  "source_retrieved_at",
];

const dryRun = process.argv.includes("--dry-run");
const retrievedAt = new Date().toISOString();
const rows = [];

for (const [code, label, note] of INDICATORS) {
  for (const [iso3, name, role] of COUNTRIES) {
    const url = `${HOST}/country/${iso3}/indicator/${code}?format=json&date=1995:2024&per_page=200`;
    let payload;
    try {
      payload = JSON.parse(await fetchText(url, { timeoutSec: 45 }));
    } catch (err) {
      // A single country failing must not silently shrink the dataset. Fail the
      // run so the previous week's file survives intact and the workflow is red.
      throw new Error(`World Bank ${code} for ${iso3} failed: ${err.message}`);
    }
    const series = Array.isArray(payload?.[1]) ? payload[1] : [];
    if (!series.length) throw new Error(`World Bank ${code} for ${iso3} returned no series`);

    for (const r of series) {
      if (r.value === null || r.value === undefined) continue;
      rows.push({
        year: r.date,
        country_iso3: iso3,
        country_name: name,
        country_role: role,
        indicator: label,
        indicator_code: code,
        value: Math.round(Number(r.value)),
        measure_note: note,
        source_tier: "primary",
        source_url: url,
        source_retrieved_at: retrievedAt,
      });
    }
  }
}

rows.sort(
  (a, b) =>
    a.indicator.localeCompare(b.indicator) ||
    a.country_iso3.localeCompare(b.country_iso3) ||
    a.year.localeCompare(b.year),
);

assertProvenance(rows);

if (dryRun) {
  console.log(`[dry-run] ${rows.length} rows across ${COUNTRIES.length} countries`);
  const latestNet = rows.filter((r) => r.indicator === "net_migration" && r.year === "2024");
  console.log("[dry-run] net migration 2024, UN estimate:");
  for (const r of latestNet.sort((a, b) => a.value - b.value)) {
    console.log(`[dry-run]   ${r.country_name.padEnd(22)} ${r.value.toLocaleString().padStart(12)}`);
  }
  process.exit(0);
}

writeFileSync(OUT, toCsv(rows, COLUMNS));
console.log(`wrote ${OUT}: ${rows.length} rows, retrieved ${retrievedAt}`);
