/**
 * Generates a static JSON API from the CSV datasets, served by GitHub Pages.
 *
 * Why static files rather than a server: an agent consuming this needs zero
 * install, zero authentication and zero adoption decision by whoever runs it.
 * GitHub Pages serves these with permissive CORS, costs nothing, and cannot go
 * down independently of GitHub. A hosted API would add a bill, a failure mode,
 * and a security review for any institution wanting to depend on it.
 *
 * The endpoint that matters most is /api/findings.json. Raw CSV tells a machine
 * what the data contains; findings.json tells it what the data SUPPORTS, with
 * the source query and the limits attached to each claim. An agent answering
 * "what share of Australian migration is students" should get 51.7% together
 * with "2023 was a post-reopening outlier, cite the composition not the total"
 * in the same response, because a citation that later proves misleading costs
 * the citing outlet more than it costs us, and they do not come back.
 *
 * Usage:  node scripts/build-api.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const OUT_DIR = "docs/api";
const BASE = "https://celestine1111.github.io/au-ai-register";
const REPO = "https://github.com/celestine1111/au-ai-register";
const RAW = "https://raw.githubusercontent.com/celestine1111/au-ai-register/main/data";

function splitLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function readCsv(name) {
  const lines = readFileSync(`data/${name}`, "utf8").trim().split(/\r?\n/);
  const head = splitLine(lines[0]);
  return lines.slice(1).map((l) => {
    const c = splitLine(l);
    return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ""]));
  });
}

mkdirSync(OUT_DIR, { recursive: true });
const write = (name, obj) => {
  writeFileSync(`${OUT_DIR}/${name}`, JSON.stringify(obj, null, 2) + "\n");
  console.log(`  ${OUT_DIR}/${name}`);
};

const generatedAt = new Date().toISOString();
const DATASETS = [
  "nom-by-visa.csv",
  "population-by-country-of-birth.csv",
  "ai-attributed-job-changes.csv",
  "australia-vs-origin-country-data.csv",
  "gdp-per-capita-vs-population.csv",
  "housing-affordability.csv",
  "living-costs-by-household.csv",
  "india-emigration-by-destination.csv",
  "origin-country-emigration-registers.csv",
  "independent-migration-estimates.csv",
  "corroboration.csv",
];

console.log("building static API:");

// --- raw dataset endpoints -------------------------------------------------
const counts = {};
for (const f of DATASETS) {
  const rows = readCsv(f);
  counts[f] = rows.length;
  write(f.replace(/\.csv$/, ".json"), {
    dataset: f,
    rows: rows.length,
    generated_at: generatedAt,
    license: "CC-BY-4.0",
    source_csv: `${RAW}/${f}`,
    data: rows,
  });
}

// --- computed: migration composition, the headline finding -----------------
const nom = readCsv("nom-by-visa.csv");
const composition = {};
for (const r of nom) {
  if (r.region !== "Australia") continue;
  const v = Number(r.persons);
  if (!Number.isFinite(v)) continue;
  const y = r.financial_year_ending;
  composition[y] ??= { groups: {}, source_url: r.source_url };
  const sign = r.migration_type === "NOM arrivals" ? 1 : -1;
  composition[y].groups[r.visa_group] = (composition[y].groups[r.visa_group] ?? 0) + sign * v;
}

const compositionOut = Object.entries(composition)
  .map(([year, { groups, source_url }]) => {
    const total = groups["Total"] ?? 0;
    const sum = (...k) => k.reduce((a, x) => a + (groups[x] ?? 0), 0);
    const students = sum(
      "Temporary visa - Higher education sector",
      "Temporary visa - Vocational Education and Training sector",
      "Temporary visa - Student other",
    );
    const skilled = sum("Permanent visa - Skill", "Temporary visa - Temporary work (skilled)");
    const pct = (n) => (total ? +((n / total) * 100).toFixed(1) : null);
    return {
      financial_year_ending: year,
      net_overseas_migration_total: total,
      students_net: students,
      students_share_pct: pct(students),
      skilled_net: skilled,
      skilled_share_pct: pct(skilled),
      permanent_skill_net: groups["Permanent visa - Skill"] ?? 0,
      permanent_skill_share_pct: pct(groups["Permanent visa - Skill"] ?? 0),
      by_visa_group: groups,
      source_url,
    };
  })
  .sort((a, b) => a.financial_year_ending.localeCompare(b.financial_year_ending));

write("migration-composition.json", {
  description:
    "Net overseas migration composition by financial year, Australia-wide. Net is arrivals minus departures per visa group.",
  generated_at: generatedAt,
  license: "CC-BY-4.0",
  caveats: [
    "Net overseas migration uses the ABS 12-in-16-month residency rule. It is NOT the same measure as Home Affairs visa grants and the two legitimately differ.",
    "2023 total net migration was a post-border-reopening catch-up (518,090 against 203,590 in 2022). The composition holds across years; the total does not. Cite composition, or show 2019, 2022 and 2023 together.",
    "'Temporary visa - Total' includes visitors, who are not a migration programme intake. Use component rows for questions about programme settings.",
    "Visa group is not occupation. This supports statements about intake composition by visa class, not about which occupations migrants enter.",
  ],
  data: compositionOut,
});

// --- findings: what the data supports, with limits attached ----------------
const latest = compositionOut.find((c) => c.financial_year_ending === "2023");
const cob = readCsv("population-by-country-of-birth.csv");
const cobFor = (country, year) => {
  const r = cob.find((x) => x.country_of_birth === country && x.census_year === year);
  return r ? Number(r.persons) : null;
};
const jobs = readCsv("ai-attributed-job-changes.csv");
const strictJobs = jobs.filter(
  (r) => r.attribution === "company_stated" && r.disputed === "no" && r.jobs_location === "Australia",
);

// --- computed: quarters where GDP grew while GDP per capita fell -----------
const ana = readCsv("gdp-per-capita-vs-population.csv");
const byPeriod = {};
for (const r of ana) {
  if (r.measure_code !== "M2") continue;
  if (r.seasonal_adjustment && !r.seasonal_adjustment.includes("Seasonally")) continue;
  const v = Number(r.value);
  if (!Number.isFinite(v)) continue;
  byPeriod[r.period] ??= { source_url: r.source_url };
  byPeriod[r.period][r.data_item_code] = v;
}
const quarters = Object.entries(byPeriod)
  .filter(([, v]) => v.GPM !== undefined && v.GPM_PCA !== undefined)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([period, v]) => ({
    period,
    gdp_pct_change: v.GPM,
    gdp_per_capita_pct_change: v.GPM_PCA,
    gdp_up_per_capita_down: v.GPM > 0 && v.GPM_PCA < 0,
  }));
const last12 = quarters.slice(-12);
const divergent = last12.filter((q) => q.gdp_up_per_capita_down).length;

write("gdp-vs-per-capita.json", {
  description:
    "Quarterly percentage change in GDP against GDP per capita, seasonally adjusted, chain volume measures. Where headline GDP rises while GDP per capita falls, growth came from population rather than productivity.",
  generated_at: generatedAt,
  license: "CC-BY-4.0",
  caveats: [
    "Chain volume (real) measures only. Nominal current-price series are not comparable across years.",
    "A single quarter of divergence is noise. The pattern matters, not any one point.",
    "GDP per capita falling does not by itself identify migration as the cause; it identifies that output per person fell while aggregate output rose.",
  ],
  quarters_analysed: quarters.length,
  last_12_quarters_divergent: divergent,
  data: quarters,
});

// --- corroboration: how Australia's own figures fare against a third party --
const corr = readCsv("corroboration.csv");
const stockChecks = corr.filter((r) => /stock/i.test(r.measure));
const flowChecks = corr.filter((r) => /flow/i.test(r.measure));
const stockOk = stockChecks.filter((r) => r.verdict === "corroborated").length;
const flowOk = flowChecks.filter((r) => r.verdict === "corroborated").length;
const worstFlow = flowChecks
  .slice()
  .sort((a, b) => Math.abs(Number(b.difference_pct)) - Math.abs(Number(a.difference_pct)))[0];

const registers = readCsv("origin-country-emigration-registers.csv");
const byOrigin = {};
for (const r of registers) {
  const o = (byOrigin[r.origin_country] ??= { total: 0, destinations: 0, australia: null });
  o.total += Number(r.persons) || 0;
  o.destinations += 1;
  if (/^austral/i.test(r.destination_country)) o.australia = Number(r.persons);
}

const nomNegative = (() => {
  const r = corr.find((x) => /flow/i.test(x.measure) && /2021/.test(x.australian_period));
  return r ? { net: Number(r.australian_value) } : null;
})();

write("findings.json", {
  description:
    "Claims this register supports, each with the source query that produces it and the limits that constrain it. Intended for machine consumption: quote the claim, carry the limit.",
  generated_at: generatedAt,
  license: "CC-BY-4.0",
  attribution_required: "mindiam, Australian Public AI Register",
  publisher_disclosure:
    "Compiled and published by mindiam, which also runs AI Policy Watch, a clearly labelled opinion section arguing a position on Australian AI and migration policy. The data is not selected, filtered or framed to support that position; the methodology is published in full and the git history is a permanent audit trail.",
  findings: [
    {
      id: "migration-composition-2023",
      claim: `In 2023, students were ${latest?.students_share_pct}% of Australia's net overseas migration and skilled workers ${latest?.skilled_share_pct}%. Permanent skilled migration alone was ${latest?.permanent_skill_share_pct}%.`,
      values: {
        students_share_pct: latest?.students_share_pct,
        skilled_share_pct: latest?.skilled_share_pct,
        permanent_skill_share_pct: latest?.permanent_skill_share_pct,
        total: latest?.net_overseas_migration_total,
      },
      source: "ABS ABS_NOM_VISA_FY via the ABS Data API",
      source_url: latest?.source_url,
      limits: [
        "2023 is a post-border-reopening outlier on TOTAL migration. The composition point holds across 2019, 2022 and 2023; the total does not.",
        "Net overseas migration is not the same measure as visa grants.",
      ],
    },
    {
      id: "origin-composition-shift",
      claim:
        "Between the 2016 and 2021 censuses, India-born residents of Australia rose 45% (+222,630) while England-born fell 3% (-28,110).",
      values: {
        india_2016: cobFor("India", "2016"),
        india_2021: cobFor("India", "2021"),
        england_2016: cobFor("England", "2016"),
        england_2021: cobFor("England", "2021"),
      },
      source: "ABS ABS_ERP_COB_STATE via the ABS Data API",
      source_url: cob[0]?.source_url,
      limits: [
        "STOCK, not flow: counts residents at a point in time, so change nets out departures and deaths and is not arrivals.",
        "Census years only; the latest point is 2021.",
        "The 2016-2021 interval contains roughly eighteen months of closed borders, which suppresses growth against a normal period.",
      ],
    },
    {
      id: "india-emigration-destinations",
      claim:
        "India's official emigration data records 1,249,005 clearances between January 2021 and November 2024, across 14 destination countries. Australia is not among them, and neither are the United States, the United Kingdom or Canada. The list is Saudi Arabia, UAE, Kuwait, Qatar, Oman, Malaysia, Bahrain, Jordan, Iraq, Lebanon, Thailand, Indonesia, South Sudan and Sudan.",
      values: { total_clearances: 1249005, destination_countries: 14, australia_present: false, top_destination: "Saudi Arabia", top_destination_clearances: 563813 },
      source: "Ministry of External Affairs (India), via the data.gov.in open data API",
      source_url: "https://api.data.gov.in/resource/bdf138e1-72c7-4dc8-a9cf-cfe9eb410bd1?format=json",
      limits: [
        "This covers Emigration Check Required (ECR) destinations only. Australia, the US, the UK and Canada are ECNR destinations where no clearance is required, so no record is generated. Australia's absence reflects the design of India's regulatory system, NOT an absence of Indian migration to Australia.",
        "Emigration clearance applies to a specific class of worker, not to students or skilled independent migrants, who are the majority of Indian arrivals in Australia.",
        "This measures departures cleared by India. Australia's own count of India-born residents (712,040 at the 2021 Census) is the authoritative figure for who is actually here.",
      ],
    },
    {
      id: "origin-country-data-availability",
      claim:
        "Australia publishes migration data through a free keyless API. Most origin countries publish nothing covering the Australia corridor, because their emigration systems regulate Gulf-bound labour migration and Australia-bound migration is students and skilled independents that never enter those systems.",
      evidence:
        "India's own open data API publishes emigration data covering Emigration Check Required clearances only, and Australia is an ECNR destination, so no record is created. Nepal publishes labour permits by destination and its top five are UAE, Malaysia, Qatar, Saudi Arabia and Kuwait. Bangladesh's country-clearance report lists Australia as selectable and returns no rows.",
      source: "Live endpoint tests, 2026-08-25",
      source_url: `${RAW}/australia-vs-origin-country-data.csv`,
      limits: [
        "'not verified' in the dataset means the tested endpoint yielded nothing, NOT that a country publishes nothing. Cite as 'not published at the endpoint tested on 2026-08-25'.",
        "This is a gap in comparability caused by regulatory design. It is not evidence of concealment or of data quality failure by any country.",
      ],
    },
    {
      id: "living-costs-by-household-type",
      claim:
        "Since 2012, living costs rose fastest for government transfer recipients (+51.7%) and pensioner and beneficiary households (+50.0%), and slowest for employee households (+45.5%). ABS states CPI is not a cost-of-living index and excludes mortgage interest, which is why it publishes this separate series.",
      values: {
        employee_households_pct: 45.5,
        age_pensioner_households_pct: 48.5,
        other_govt_transfer_recipients_pct: 51.7,
        self_funded_retiree_households_pct: 45.8,
        pensioner_and_beneficiary_households_pct: 50.0,
        period: "2012-Q1 to 2026-Q2",
      },
      source: "ABS LCI (Selected Living Cost Indexes) via the ABS Data API",
      source_url: "https://data.api.abs.gov.au/rest/data/ABS,LCI,1.0.0/all?startPeriod=2012&format=csv",
      limits: [
        "An index measures change from a base, not level. A household type with lower index growth is not better off in absolute terms, only facing slower cost growth from wherever it started.",
        "Weighted average of eight capital cities. Regional and rural households are not separately identified.",
        "This is the All groups index. Sub-indices (health, education, insurance) are in the dataset and can differ substantially.",
      ],
    },
    {
      id: "house-prices-vs-earnings",
      claim:
        "Between 2012 and 2021, Australian capital city house prices rose 94.5% while average weekly earnings rose 26.2%. Prices outran pay by more than three and a half times over the same decade.",
      values: { property_index_2021Q4: 194.5, earnings_index_2021S2: 126.2, gap_index_points: 68.3, base_year: 2012 },
      source: "ABS RPPI (Residential Property Price Index, weighted average of eight capitals) and ABS AWE (Average Weekly Earnings), both via the ABS Data API",
      source_url: "https://data.api.abs.gov.au/rest/data/ABS,RPPI,1.0.0/all?startPeriod=2012&format=csv",
      limits: [
        "The RPPI dataflow available through the API ends at 2021-Q4. This does NOT describe the current market and must not be presented as though it does.",
        "AWE is an average, not a median. Averages are pulled up by high earners, so this UNDERSTATES the gap facing a typical worker.",
        "Both series are indexed to 2012 = 100. Comparisons must be at the same date; the two series have different end points.",
      ],
    },
    {
      id: "growth-by-population-not-productivity",
      claim: `In ${divergent} of the last 12 quarters, Australia's headline GDP grew while GDP per capita fell. Aggregate output rose because the population rose, not because output per person rose.`,
      values: { divergent_quarters_of_last_12: divergent, quarters_analysed: quarters.length, latest_period: quarters.at(-1)?.period },
      source: "ABS ANA_AGG (National Accounts Key Aggregates) via the ABS Data API",
      source_url: quarters.at(-1)?.period ? byPeriod[quarters.at(-1).period].source_url : null,
      limits: [
        "Chain volume (real) measures. Nominal series are not comparable across years.",
        "This identifies that output per person fell while aggregate output rose. It does not by itself identify migration as the cause; that is an argument built on this fact, not the fact itself.",
        "A single quarter of divergence is noise. Cite the pattern across quarters, not one point.",
      ],
    },
    {
      id: "ai-attributed-job-losses",
      claim: `Australian AI-attributed job losses that are employer-stated, undisputed and onshore, in the current dataset: ${strictJobs.length}.`,
      values: { strict_rows: strictJobs.length, total_rows: jobs.length },
      source: "Compiled from employer statements and reporting",
      source_url: `${RAW}/ai-attributed-job-changes.csv`,
      limits: [
        "The dataset is a seed, not an exhaustive search. An empty strict result means none found yet, not none exists.",
        "Only attribution=company_stated AND disputed=no rows may carry a headline figure.",
        "attribution=company_denied rows are employers stating AI was NOT the cause and must never be counted as displacement.",
      ],
    },
    {
      id: "australian-migration-figures-independently-checked",
      claim:
        `Australia's count of its foreign-born population is independently corroborated (${stockOk} of ${stockChecks.length} census years agree with the UN Population Division within 5%). ` +
        `Its annual migration FLOW figure is not (${flowOk} of ${flowChecks.length} years agree). The divergence is a method difference, not evidence that either is wrong.`,
      values: {
        stock_checks: stockChecks.length,
        stock_corroborated: stockOk,
        flow_checks: flowChecks.length,
        flow_corroborated: flowOk,
        largest_flow_divergence_year: worstFlow?.australian_period,
        largest_flow_divergence_pct: worstFlow?.difference_pct,
      },
      source: "ABS Census and ABS_NOM_VISA_FY against UN Population Division via World Bank SM.POP.TOTL and SM.POP.NETM",
      source_url: `${RAW}/corroboration.csv`,
      limits: [
        "STOCK corroborates, FLOW does not. Do not report this as a single verdict on Australian migration statistics.",
        "The flow divergence is explained: ABS measures border crossings directly under the 12/16 month rule, while the UN derives net migration residually from population balance and smooths it across multi-year periods.",
        "The clearest demonstration is the pandemic. For the year to June 2021 the ABS records net migration of -84,930, Australia losing people with the border closed. The UN series records +116,768 for 2021. A smoothed residual cannot see a border shut.",
        "Therefore: for an annual Australian migration figure, cite ABS. The UN and World Bank series is appropriate for cross-country comparison, not for Australian year-on-year change, and quoting it against ABS is a misuse of it.",
      ],
    },
    {
      id: "origin-countries-do-publish-emigration-data",
      claim:
        "The claim that migrant-origin countries publish no emigration data is false. India, Bangladesh, Pakistan, Nepal and Sri Lanka all operate emigration registers with destination-country detail, several updated monthly. " +
        "But Australia is near-absent from all of them, because these are labour-clearance systems whose volume runs to the Gulf.",
      values: Object.fromEntries(
        Object.entries(byOrigin).map(([k, v]) => [
          k,
          { destinations: v.destinations, total_persons: v.total, to_australia: v.australia },
        ]),
      ),
      source: "Bangladesh Overseas Employment Platform; Sri Lanka Bureau of Foreign Employment Annual Statistical Report 2025",
      source_url: `${RAW}/origin-country-emigration-registers.csv`,
      limits: [
        "These count vetted foreign-employment contracts ONLY. Students, skilled independent migrants and family migration are invisible to them by construction.",
        "A low Australia figure therefore does NOT measure the size of the migration corridor to Australia, and must never be quoted as if it did. Bangladesh recording 70 clearances does not contradict Australia recording far more Bangladesh-born arrivals; the two count different things.",
        "Periods differ by source and are given per row. Bangladesh runs from 2023-06-04 because earlier records are still being migrated; Sri Lanka is calendar 2025.",
        "Pakistan is deliberately excluded from the figures. It publishes an equivalent series (15,172,687 workers 1971 to July 2026) but blocks automated download, and our parse of its PDF failed validation, so no Pakistani figures and no absence claim are published here.",
      ],
    },
    {
      id: "australia-has-run-negative-net-migration",
      claim: `Australia recorded NEGATIVE net overseas migration of ${(nomNegative?.net ?? 0).toLocaleString()} in the year to June 2021. A reduced or negative intake is not hypothetical for Australia; it has happened recently and is measured.`,
      values: { financial_year_ending: 2021, net_overseas_migration: nomNegative?.net ?? null },
      source: "ABS ABS_NOM_VISA_FY via the ABS Data API",
      source_url: `${RAW}/corroboration.csv`,
      limits: [
        "This was caused by pandemic border closure, not by policy design. It shows a negative year is measurable and survivable, not that it was chosen or that its effects generalise to a planned reduction.",
        "The same year saw departures of temporary visa holders that would not recur under a policy-driven reduction.",
        "Cite it as precedent for the measurement, not as a model of the outcome.",
      ],
    },
  ],
});

// --- catalogue -------------------------------------------------------------
write("index.json", {
  name: "Australian Public AI Register",
  description:
    "Open, provenance-gated data on Australian migration and public-sector AI. Every row carries its source URL and retrieval timestamp.",
  license: "CC-BY-4.0",
  attribution_required: "mindiam, Australian Public AI Register",
  repository: REPO,
  documentation: BASE,
  generated_at: generatedAt,
  authentication: "none",
  rate_limit: "none",
  openapi: `${BASE}/api/openapi.json`,
  endpoints: [
    { path: "/api/findings.json", description: "Claims this register supports, each with its source query and its limits. Start here." },
    { path: "/api/migration-composition.json", description: "Net overseas migration composition by year, computed." },
    { path: "/api/nom-by-visa.json", description: `Net overseas migration by visa group. ${counts["nom-by-visa.csv"]} rows.` },
    { path: "/api/population-by-country-of-birth.json", description: `Resident population by country of birth. ${counts["population-by-country-of-birth.csv"]} rows.` },
    { path: "/api/ai-attributed-job-changes.json", description: `AI-attributed job changes with dispute tracking. ${counts["ai-attributed-job-changes.csv"]} rows.` },
    { path: "/api/australia-vs-origin-country-data.json", description: `Australia's record beside origin-country publication. ${counts["australia-vs-origin-country-data.csv"]} rows.` },
    { path: "/api/corroboration.json", description: `Australian figures checked against the UN Population Division, an independent third party. Stock corroborates, flow diverges. ${counts["corroboration.csv"]} rows.` },
    { path: "/api/origin-country-emigration-registers.json", description: `Emigration registers published by the origin countries themselves, with destination breakdowns. ${counts["origin-country-emigration-registers.csv"]} rows.` },
    { path: "/api/independent-migration-estimates.json", description: `UN Population Division net migration and migrant stock for 25 countries, via the World Bank. Independent of Australia and of the origin countries. ${counts["independent-migration-estimates.csv"]} rows.` },
  ],
  usage_note:
    "Every finding carries a 'limits' array. Quoting a figure without its limits is the failure mode this register exists to prevent.",
});

console.log("done");
