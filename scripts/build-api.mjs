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
  ],
  usage_note:
    "Every finding carries a 'limits' array. Quoting a figure without its limits is the failure mode this register exists to prevent.",
});

console.log("done");
