# Sources

Every upstream feed, its access method, and whether it is currently working.
Verified by live request on the date shown.

## Live and in use

| Source | Endpoint | Auth | Cadence | Verified |
|---|---|---|---|---|
| ABS Data API | `https://data.api.abs.gov.au/rest/` | none | weekly | 2026-08-23 |

## Verified reachable, not yet ingested

| Source | Endpoint | Auth | Notes |
|---|---|---|---|
| data.gov.au (CKAN) | `https://data.gov.au/data/api/3/action/package_search` | none | Net Overseas Migration, Student visa program, Visitor visa program, Temporary visa holders in Australia, International student data |
| World Bank | `https://api.worldbank.org/v2/` | none | bilateral migrant stock, for international comparison |

## Enforcement and compliance (verified 2026-08-25)

| Source | Access | Cadence | Notes |
|---|---|---|---|
| Home Affairs country profiles | `homeaffairs.gov.au/research-and-statistics/statistics/country-profiles/profiles/<country>` | annual | HTTP 200 with a browser user agent, 403 without. Population by country of birth, permanent places granted by migration category, by year. One profile per source country. |
| Immigration Detention and Community Statistics Summary | `homeaffairs.gov.au/research-and-stats/files/immigration-detention-community-statistics-summary-<date>.pdf` | monthly | PDF. Detention population by nationality, detention group, criminal history, time in detention. |
| ABS estimated resident population by country of birth | `ABS_ERP_COB_STATE` via ABS Data API | annual | 130,561 rows from 2020. The authoritative Australian-side country-level series. |

**Scope limits on the enforcement data, so nothing is overstated from it:**

- The detention summary counts people **in detention**. It is not a count of
  unlawful non-citizens, most of whom are not detained. Do not present one as
  the other.
- **Removals** appear in Home Affairs annual reports, not in the monthly
  summary, and therefore arrive on a different cadence.
- **Overstayer estimates** are published irregularly and are modelled estimates,
  not counts. They belong in `source_tier: primary` but the row must record that
  they are estimates.

## Known problems

**The ABS endpoint most documentation gives you is dead.** Tutorials and older
ABS pages publish `api.data.abs.gov.au`, which does not resolve at all. The live
host is `data.api.abs.gov.au/rest/` — the subdomain order is swapped. A build
against the wrong one fails as a DNS error, which reads like a network flake
rather than a wrong URL. Confirmed 2026-08-23.

**AusTender is not usable from data.gov.au.** The "AusTender Contract Notice
Export" dataset published there is from **2013**, and the historical per-year
contract files stop at 2019-20. `www.tenders.gov.au` is reachable but returns
403 to a default user agent. Commonwealth contract notices are therefore the one
dataset in this register with no clean API, and the contracts ingest will need a
properly-headered fetch or a scraping layer. This is the largest technical risk
in the project and is flagged rather than hidden.

**IFR robot installation data is commercial.** Headline global figures appear in
free press releases, which is sufficient for a leading-indicator series. Country
breakdowns are paywalled and will not be included unless licensed.

**Home Affairs statistics pages are JavaScript-rendered.** Both the statistics
index and the live immigration detention page return HTTP 200 but contain no
tables and no linked data files in the raw HTML. The country profiles DO render
server-side and are scrapeable with a browser user agent. Everything else on
that domain needs either the underlying PDF or a rendering scraper.

**Source-country emigration bureaus measure a different channel.** Pakistan's
BEOE, Nepal's DoFE and Bangladesh's BMET publish country-wise emigration data,
but they regulate *labour* migration, which is overwhelmingly Gulf-bound.
Migration to Australia is predominantly student and skilled-independent and does
not pass through those systems, so their Australia figures are not comparable
with ABS or Home Affairs counts. This is a definitional mismatch, not an
accuracy problem, and any comparison must label both sides by what they count.
BEOE additionally returns 403 to a browser user agent and needs Firecrawl.

**The destination country is authoritative for who is in it.** No foreign
corroboration is required for any claim about the migrant population resident in
Australia, or about visas Australia granted. ABS and Home Affairs are the best
available sources in the world for those facts. Foreign data is only required
for claims about what another country recorded, such as an assertion that it
under-reports.

**State planning portals have no consistent API.** Data centre approvals will
need per-jurisdiction handling and will be the most fragile feed in the register.
