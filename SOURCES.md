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

**State planning portals have no consistent API.** Data centre approvals will
need per-jurisdiction handling and will be the most fragile feed in the register.
