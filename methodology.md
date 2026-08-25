# Methodology

How every number in this register is produced, so you can audit it or disagree
with it on specifics rather than in general.

## Standing rules

**One row, one source.** Every row records where it came from and when. No row
is derived from a source that is not named in that row.

**Publish what the data says.** Where a join or a calculation produces a result
that is inconvenient, surprising, or weaker than expected, the result is
published as produced. A methodology that bends toward a conclusion has no value
to anyone, including the person it was bent for.

**Primary before claim.** Where a fact is available from both a public record
and a company announcement, the record is used and the announcement is dropped.
Where only an announcement exists, the row is marked `source_tier: claim`.

**Documented conduct, not inferred traits.** Rows about wrongdoing record
findings made by a named body against a named organisation, with the source
document. This register does not record, infer or aggregate characteristics of
national, ethnic or religious groups.

**Corrections are commits.** Errors are fixed in place with the correction
described in the commit message. Nothing is quietly rewritten; the git history
is the audit trail.

## Per-dataset

### `data/nom-by-visa.csv` — net overseas migration by visa group

**Source.** ABS dataflow `ABS_NOM_VISA_FY` ("Overseas migration, arrivals,
departures, state/territory, visa and citizenship"), retrieved from the ABS Data
API at `https://data.api.abs.gov.au/rest/`.

**Scope.** Financial years from 2015 (`--start` is configurable). All visa
groups, all states and territories, all three migration types (NOM arrivals, NOM
departures, and net).

**Transformations.** None to the values. The SDMX response is parsed with
`labels=both`, so each dimension is stored with both its ABS code and its
human-readable label, and the observation value is carried through unchanged.
Rows with an empty observation are dropped, since they carry no information.
Rows are sorted by year, region, migration type then visa group, so a weekly
re-run produces a diff of real changes rather than a reshuffle.

**Known limits.**

- The series is annual and lags. It is not a real-time measure of arrivals.
- Net overseas migration uses the ABS 12-in-16-month residency rule. It is
  therefore **not** the same measure as visa grants published by Home Affairs,
  and the two legitimately differ. Do not treat them as interchangeable.
- "Temporary visa - Total" includes visitors, which are not a migration
  programme intake in the sense most policy discussion means. Use the component
  rows, not the total, when the question is about programme settings.
- Visa group is not occupation. This dataset supports statements about the
  composition of the intake by visa class. It does not by itself support
  statements about which occupations migrants enter.

**Verify it.** Copy any row's `source_url` and re-run it. The response is the
data this file was built from.

## Datasets not yet built

Listed so their absence is visible rather than implied. Each will get its own
section here when it lands, before the data is published.

- Commonwealth AI contract notices, including vendor country and ultimate parent
- Public sector AI job advertisements
- AI data centre investment and planning approvals
- Party positions on AI and technology policy, by policy area
- AI-attributed job losses, employer-stated and reported tiers kept separate
- Automation leading indicators: robot installations, humanoid production, capex
- Procurement and visa-integrity findings against named organisations
- GDP per capita against population growth
- Resources and sovereign wealth comparisons
