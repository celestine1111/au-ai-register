/**
 * Australia's record of a migrant population, beside what the origin country
 * publishes about the same people.
 *
 * The question this answers: for each major source country, how much does
 * Australia know about people who came from there, and how much does that
 * country publish about people who left for Australia?
 *
 * The answer is asymmetric, and the asymmetry is the finding. Australia
 * measures arrivals and residents directly, through border records and the
 * Census, and publishes them through a free keyless API. Most origin countries
 * publish nothing about the Australia corridor.
 *
 * WHY, because the reason matters more than the fact and is usually misread:
 * emigration bureaus in South Asia exist to regulate LABOUR migration, which
 * is overwhelmingly Gulf-bound. India's own open data API demonstrates it
 * exactly. India publishes emigration data, but only Emigration Check Required
 * clearances, and Australia is an ECNR destination, so no record is ever
 * created. That is a design consequence of the regulatory system, not a refusal
 * to publish and not a data quality failure.
 *
 * The Australian figures come from data/population-by-country-of-birth.csv
 * (ABS ABS_ERP_COB_STATE). The origin-country findings come from live tests
 * recorded below, each with the URL tested and the date, so any of them can be
 * rechecked or corrected by pull request.
 *
 * Usage:  node scripts/build-australia-vs-origin.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { toCsv, assertProvenance } from "./lib/register.mjs";

const AU_SOURCE = "data/population-by-country-of-birth.csv";
const OUT = "data/australia-vs-origin-country-data.csv";
const TESTED = "2026-08-26";

// Live test results. `australia_bound_emigration_published` is the column that
// matters: a country can publish extensive emigration data and still publish
// nothing about the Australia corridor.
const ORIGIN = {
  India: {
    agency: "Ministry of Statistics (data.gov.in) / eMigrate",
    api: "yes",
    api_url: "https://api.data.gov.in/lists",
    emigration_published: "yes",
    australia_bound: "no",
    note: "Open data API works and carries emigration datasets, but they cover Emigration Check Required clearances only. Australia is an ECNR destination, so Indians departing for Australia generate no emigration record. Other migration datasets in the API are INTERNAL migration; visa datasets cover foreigners arriving IN India.",
  },
  Pakistan: {
    agency: "Bureau of Emigration & Overseas Employment / PBS",
    api: "no",
    api_url: "https://beoe.gov.pk/",
    emigration_published: "yes (not via API)",
    australia_bound: "not verified",
    note: "Pakistan DOES publish a detailed destination-country series: 15,172,687 workers registered for employment abroad 1971 to July 2026, updated monthly. It could not be verified here. BEOE returns HTTP 403 to every automated file request, and a rendered parse of its country PDF failed validation, recovering 33 of 54 rows and corrupting labels (rendering Qatar as 'Galier'), so it is not safe to read Australia's presence or absence from it. Recorded as not verified rather than absent: this is a limitation of our extraction, not of Pakistan's publishing.",
  },
  Bangladesh: {
    agency: "BMET / Overseas Employment Platform",
    api: "yes",
    api_url: "https://www.oep.gov.bd/reports/country-clearance",
    emigration_published: "yes",
    australia_bound: "yes",
    australia_bound_count: 70,
    note: "CORRECTED 2026-08-26. An earlier test of this register recorded no API and no Australia rows. Both were wrong, and the error was in the test, not the source. The report is backed by a server-side JSON endpoint that accepts date and country filters, and it returns 3.4 million clearances across 158 destinations since 2023-06-04. Australia is present with 70. The instrument is an overseas EMPLOYMENT clearance, so it counts vetted labour contracts and not the student and skilled-independent routes that carry almost all Bangladeshi arrivals to Australia.",
  },
  Nepal: {
    agency: "Department of Foreign Employment",
    api: "no",
    api_url: "https://dofe.gov.np/",
    emigration_published: "yes (not via API)",
    australia_bound: "not verified",
    note: "CORRECTED 2026-08-26. Previously recorded as not publishing Australia-bound data. That overstated the evidence: DoFE lists Australia at number 8 of 149 recognised destination countries for foreign employment, so the corridor is inside the system. Whether a count for it is published could not be verified, as the statistics are annual PDFs in Nepali with no machine endpoint. Volume is dominated by UAE, Malaysia, Qatar, Saudi Arabia and Kuwait. Nepalis reaching Australia arrive predominantly as students, and a student visa is not a labour permit.",
  },
  "Sri Lanka": { agency: "Sri Lanka Bureau of Foreign Employment", api: "no", api_url: "https://www.slbfe.lk/statistics/", emigration_published: "yes", australia_bound: "yes", australia_bound_count: 743, note: "CORRECTED 2026-08-26. The earlier test hit the Department of Census and Statistics, which is the wrong agency. Foreign employment is SLBFE, which publishes an Annual Statistical Report with a full destination-country table. The 2025 report records 311,223 registrations across 39 destinations, Australia 743, against Kuwait 77,657. Annual PDF, no API. Counts registered migrant workers only." },
  Iran: { agency: "Statistical Centre of Iran", api: "no", api_url: "https://www.amar.org.ir/english", emigration_published: "not verified", australia_bound: "not verified", note: "Endpoint did not respond to automated request." },
  Iraq: { agency: "Central Statistical Organization", api: "no", api_url: "https://cosit.gov.iq/en/", emigration_published: "not verified", australia_bound: "not verified", note: "Tested endpoint returned 404." },
  Lebanon: { agency: "Central Administration of Statistics", api: "no", api_url: "http://www.cas.gov.lb/", emigration_published: "not verified", australia_bound: "not verified", note: "Site reachable, no API found at the tested endpoint." },
  Egypt: { agency: "CAPMAS", api: "no", api_url: "https://www.capmas.gov.eg/", emigration_published: "not verified", australia_bound: "not verified", note: "Site reachable, no API found at the tested endpoint." },
  "South Africa": { agency: "Statistics South Africa", api: "no", api_url: "https://www.statssa.gov.za/", emigration_published: "not verified", australia_bound: "not verified", note: "Site returns a robots-restricted response to automated requests." },
  Nigeria: { agency: "National Bureau of Statistics", api: "no", api_url: "https://nigerianstat.gov.ng/", emigration_published: "not verified", australia_bound: "not verified", note: "Site reachable, no API found at the tested endpoint." },
  Kenya: { agency: "Kenya National Bureau of Statistics", api: "no", api_url: "https://www.knbs.or.ke/", emigration_published: "not verified", australia_bound: "not verified", note: "Site reachable, no API found at the tested endpoint." },
  Ethiopia: { agency: "Ethiopian Statistics Service", api: "no", api_url: "https://www.statsethiopia.gov.et/", emigration_published: "not verified", australia_bound: "not verified", note: "Endpoint did not respond to automated request." },
  Zimbabwe: { agency: "ZIMSTAT", api: "no", api_url: "https://www.zimstat.co.zw/", emigration_published: "not verified", australia_bound: "not verified", note: "Endpoint did not respond to automated request." },
  // Baselines. A finding about South Asian or African agencies is meaningless
  // without knowing what comparable agencies elsewhere do.
  England: { agency: "Office for National Statistics", api: "yes", api_url: "https://api.beta.ons.gov.uk/v1/datasets", emigration_published: "yes", australia_bound: "not verified", note: "BASELINE. ONS runs a working public API. Emigration by destination is published in UK long-term international migration estimates." },
  "New Zealand": { agency: "Stats NZ", api: "exists", api_url: "https://api.stats.govt.nz/opendata/v1/", emigration_published: "yes", australia_bound: "yes", note: "BASELINE. Stats NZ publishes migration by destination including Australia. API endpoint returned 502 on the test date." },
};

// ABS country-of-birth labels do not always match the common name.
const ABS_ALIAS = {
  India: "India",
  Pakistan: "Pakistan",
  Bangladesh: "Bangladesh",
  Nepal: "Nepal",
  "Sri Lanka": "Sri Lanka",
  Iran: "Iran",
  Iraq: "Iraq",
  Lebanon: "Lebanon",
  Egypt: "Egypt",
  "South Africa": "South Africa",
  Nigeria: "Nigeria",
  Kenya: "Kenya",
  Ethiopia: "Ethiopia",
  Zimbabwe: "Zimbabwe",
  England: "England",
  "New Zealand": "New Zealand",
};

const COLUMNS = [
  "country",
  "au_born_population_2021",
  "au_born_population_2016",
  "au_change_2016_2021",
  "au_change_pct",
  "au_data_source",
  "origin_agency",
  "origin_has_public_api",
  "origin_publishes_emigration",
  "australia_bound_emigration_published",
  "australia_bound_count",
  "origin_note",
  "origin_url_tested",
  "tested_date",
  "source_tier",
  "source_url",
  "source_retrieved_at",
];

const lines = readFileSync(AU_SOURCE, "utf8").trim().split(/\r?\n/);
const head = lines[0].split(",");
const iYear = head.indexOf("census_year");
const iCountry = head.indexOf("country_of_birth");
const iPersons = head.indexOf("persons");
const iSrc = head.indexOf("source_url");

const au = {};
let absSourceUrl = "";
for (const line of lines.slice(1)) {
  // country_of_birth may contain a quoted comma, so split respecting quotes
  const cells = line.match(/("([^"]|"")*"|[^,]*)/g).filter((_, i) => i % 2 === 0);
  const country = (cells[iCountry] ?? "").replace(/^"|"$/g, "").replace(/""/g, '"');
  const year = cells[iYear];
  const persons = Number(cells[iPersons]);
  if (!absSourceUrl) absSourceUrl = (cells[iSrc] ?? "").replace(/^"|"$/g, "");
  if (!Number.isFinite(persons)) continue;
  au[country] ??= {};
  au[country][year] = persons;
}

const retrievedAt = new Date().toISOString();
const rows = Object.entries(ORIGIN).map(([country, o]) => {
  const absName = ABS_ALIAS[country] ?? country;
  const p2021 = au[absName]?.["2021"] ?? "";
  const p2016 = au[absName]?.["2016"] ?? "";
  const chg = p2021 !== "" && p2016 !== "" ? p2021 - p2016 : "";
  const pct = chg !== "" && p2016 ? ((chg / p2016) * 100).toFixed(1) : "";
  return {
    country,
    au_born_population_2021: p2021,
    au_born_population_2016: p2016,
    au_change_2016_2021: chg,
    au_change_pct: pct,
    au_data_source: "ABS ABS_ERP_COB_STATE via ABS Data API",
    origin_agency: o.agency,
    origin_has_public_api: o.api,
    origin_publishes_emigration: o.emigration_published,
    australia_bound_emigration_published: o.australia_bound,
    australia_bound_count: o.australia_bound_count ?? "",
    origin_note: o.note,
    origin_url_tested: o.api_url,
    tested_date: TESTED,
    source_tier: "primary",
    source_url: absSourceUrl,
    source_retrieved_at: retrievedAt,
  };
});

rows.sort((a, b) => (Number(b.au_born_population_2021) || 0) - (Number(a.au_born_population_2021) || 0));
assertProvenance(rows);

if (process.argv.includes("--dry-run")) {
  console.log(`[dry-run] ${rows.length} rows`);
  for (const r of rows) {
    console.log(
      `  ${r.country.padEnd(14)} AU-born 2021 ${String(r.au_born_population_2021).padStart(9)}  ` +
        `origin API: ${String(r.origin_has_public_api).padEnd(7)} AU-bound data: ${r.australia_bound_emigration_published}`,
    );
  }
  process.exit(0);
}

writeFileSync(OUT, toCsv(rows, COLUMNS));
console.log(`wrote ${OUT}: ${rows.length} rows`);
