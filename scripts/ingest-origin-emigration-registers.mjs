/**
 * Emigration registers published by the origin countries themselves.
 *
 * THE OBJECTION THIS ANSWERS. Every other migration figure in this register is
 * measured by Australia. One party counting a flow it has a stake in is not
 * verified, it is asserted. The fair test is whether the countries people leave
 * publish their own count, and whether that count agrees.
 *
 * THE RESULT IS NOT WHAT EITHER SIDE OF THE DEBATE EXPECTS.
 *
 * The common claim that these countries publish nothing is false. South Asian
 * labour-sending states run some of the most detailed emigration statistics in
 * the world, because each operates a worker-protection bureau that must clear a
 * departure before it happens. India's MEA, Pakistan's Bureau of Emigration and
 * Overseas Employment, Bangladesh's overseas employment platform, Nepal's
 * Department of Foreign Employment and Sri Lanka's Bureau of Foreign Employment
 * all publish destination-country breakdowns. Several update monthly.
 *
 * But the count for Australia in those registers is near zero, and the reason is
 * not concealment. These are LABOUR CLEARANCE systems. They record a worker
 * departing under a foreign employment contract that the bureau has vetted, and
 * they exist because the destination is a jurisdiction where the sending state
 * judges its nationals to need protection. That is why the volume runs to the
 * Gulf. India's ECR list names 18 countries designated on the basis that they
 * "do not have strict laws regulating the entry and employment of foreign
 * nationals". Australia is not on it, so an Indian moving to Australia generates
 * no record at all.
 *
 * WHAT THIS MEANS FOR ANY COMPARISON. The origin registers and the Australian
 * series are not two counts of one flow that can be reconciled. They are
 * instruments pointed at different flows. Bangladesh recording 70 clearances to
 * Australia does not contradict Australia recording tens of thousands of
 * Bangladesh-born arrivals; the 70 is contract labour, and almost nobody reaches
 * Australia that way. Students, skilled independent migrants and family arrivals
 * are invisible to a labour clearance bureau by construction.
 *
 * So this dataset settles the question honestly in both directions. It refutes
 * "these countries hide their numbers", and it refutes any attempt to read a low
 * clearance count as the true size of a migration corridor. Anyone quoting a row
 * from here without the instrument_measures field is misusing it, which is why
 * that field is mandatory rather than a note.
 *
 * Usage:  node scripts/ingest-origin-emigration-registers.mjs [--dry-run]
 */
import { writeFileSync } from "node:fs";
import { fetchText, toCsv, assertProvenance } from "./lib/register.mjs";

const OUT = "data/origin-country-emigration-registers.csv";

const COLUMNS = [
  "origin_country",
  "origin_agency",
  "destination_country",
  "persons",
  "period_start",
  "period_end",
  "instrument",
  "instrument_measures",
  "covers_australia",
  "source_tier",
  "source_url",
  "source_retrieved_at",
];

const dryRun = process.argv.includes("--dry-run");
const retrievedAt = new Date().toISOString();
const rows = [];

// --- Bangladesh -----------------------------------------------------------
// The Overseas Employment Platform run by the Bureau of Manpower, Employment
// and Training. Server-side DataTables endpoint; the filter fields are the same
// ones the public form posts. Data begins 2023-06-04, which the site states
// explicitly because earlier records are still being migrated.
const BD_START = "2023-06-04";
const BD_END = new Date().toISOString().slice(0, 10);
const BD_URL =
  "https://www.oep.gov.bd/reports/country-clearance" +
  `?draw=1&start=0&length=300&approval_date_from=${BD_START}&approval_date_to=${BD_END}&all_skills=0`;

const bdRaw = await fetchText(BD_URL, {
  headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
  timeoutSec: 120,
});
const bdJson = JSON.parse(bdRaw);
const bdRows = bdJson?.payload?.data ?? [];
if (!bdRows.length) throw new Error("Bangladesh OEP returned no destination rows");

for (const r of bdRows) {
  rows.push({
    origin_country: "Bangladesh",
    origin_agency: "Bureau of Manpower, Employment and Training (Overseas Employment Platform)",
    destination_country: r.country_name,
    persons: r.total_employee,
    period_start: BD_START,
    period_end: BD_END,
    instrument: "Overseas employment clearance",
    instrument_measures:
      "Workers cleared to depart under a vetted foreign employment contract. Excludes students, skilled independent migrants, family migration and anyone travelling without a cleared labour contract.",
    covers_australia: "yes",
    source_tier: "primary",
    source_url: BD_URL,
    source_retrieved_at: retrievedAt,
  });
}

// --- Sri Lanka ------------------------------------------------------------
// Sri Lanka Bureau of Foreign Employment, Annual Statistical Report 2025,
// page 5: "Migrant Employees' Registration with the SLBFE by Country and
// Manpower Level".
//
// This one is transcribed from a PDF rather than pulled from an API, because
// SLBFE publishes an annual report and no machine endpoint. Transcription is
// normally the weakest link in a dataset like this, so it is made checkable:
// the report prints its own total, and the assertion below recomputes it. If
// any figure here is ever mistyped or edited, the sum stops matching and this
// script fails rather than writing a quietly wrong file.
//
// This is also the reason Pakistan is absent from this dataset. Pakistan's
// Bureau of Emigration and Overseas Employment publishes an equivalent and far
// longer series (15,172,687 workers registered 1971 to July 2026), but it is
// served behind a filter that refuses automated download, and the automated
// parse of its PDF failed this same total check: it recovered 33 of 54 rows and
// corrupted country labels, rendering "Qatar" as "Galier". Publishing those
// numbers would have been indefensible, and reading Australia's absence out of
// a parse that mangles country names would have been worse. Pakistan is
// therefore recorded in data-availability.csv as publishing, with no figures
// and no absence claim. See methodology.md.
const LK_PERIOD = ["2025-01-01", "2025-12-31"];
const LK_URL = "https://www.slbfe.lk/wp-content/uploads/2026/07/ASR-2025-WEB-SITE-final.pdf";
const LK_PUBLISHED_TOTAL = 311223;
const LK = [
  ["Kuwait", 77657],
  ["U A E", 59611],
  ["Saudi Arabia", 36441],
  ["Qatar", 44914],
  ["Maldives", 11068],
  ["Romania", 12597],
  ["Israel", 13252],
  ["Japan", 11090],
  ["Oman", 7028],
  ["South Korea", 6494],
  ["Jordan", 3635],
  ["Bahrain", 3719],
  ["Cyprus", 3800],
  ["United Kingdom", 2085],
  ["Singapore", 2394],
  ["Malaysia", 1830],
  ["Seychelles", 1292],
  ["Lebanon", 1132],
  ["Serbia", 1171],
  ["Russia", 1492],
  ["New Zealand", 733],
  ["Australia", 743],
  ["Turkey", 1622],
  ["Bangladesh", 452],
  ["Hong Kong", 576],
  ["Iraq", 263],
  ["Canada", 206],
  ["Ireland", 438],
  ["Mauritius", 215],
  ["Malta", 266],
  ["Lithuania", 103],
  ["India", 177],
  ["Papua New Guinea", 190],
  ["Fiji", 110],
  ["Bulgaria", 69],
  ["Poland", 157],
  ["Vietnam", 124],
  ["Ethiopia", 71],
  ["Others", 2006],
];

const lkSum = LK.reduce((s, [, v]) => s + v, 0);
if (lkSum !== LK_PUBLISHED_TOTAL) {
  throw new Error(
    `Sri Lanka transcription check failed: rows sum to ${lkSum}, ` +
      `report page 5 states ${LK_PUBLISHED_TOTAL}. Do not publish until these agree.`,
  );
}

for (const [destination, persons] of LK) {
  rows.push({
    origin_country: "Sri Lanka",
    origin_agency: "Sri Lanka Bureau of Foreign Employment",
    destination_country: destination,
    persons,
    period_start: LK_PERIOD[0],
    period_end: LK_PERIOD[1],
    instrument: "Migrant employee registration",
    instrument_measures:
      "Departing migrant workers registered with the SLBFE by manpower level. Excludes students, skilled independent migrants, family migration and any departure not registered as foreign employment.",
    covers_australia: "yes",
    source_tier: "primary",
    source_url: LK_URL,
    source_retrieved_at: retrievedAt,
  });
}


rows.sort(
  (a, b) =>
    a.origin_country.localeCompare(b.origin_country) ||
    Number(b.persons) - Number(a.persons),
);

assertProvenance(rows);

if (dryRun) {
  const byOrigin = {};
  for (const r of rows) (byOrigin[r.origin_country] ??= []).push(r);
  for (const [origin, rs] of Object.entries(byOrigin)) {
    const total = rs.reduce((s, r) => s + Number(r.persons), 0);
    const aus = rs.find((r) => /austral/i.test(r.destination_country));
    console.log(`[dry-run] ${origin}: ${rs.length} destinations, ${total.toLocaleString()} persons`);
    console.log(`[dry-run]   top: ${rs.slice(0, 3).map((r) => `${r.destination_country} ${Number(r.persons).toLocaleString()}`).join(", ")}`);
    console.log(`[dry-run]   Australia: ${aus ? Number(aus.persons).toLocaleString() : "absent from register"}`);
  }
  process.exit(0);
}

writeFileSync(OUT, toCsv(rows, COLUMNS));
console.log(`wrote ${OUT}: ${rows.length} rows, retrieved ${retrievedAt}`);
