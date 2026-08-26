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

## Verification: how a one-sided count is checked

The strongest objection to this register is that its migration figures come from
Australia. Australia counts arrivals at its own border, publishes the total, and
both sides of the domestic argument quote it. One interested party counting, and
nobody checking, is an assertion wearing the clothes of a fact.

The intuitive fix does not work, and it is worth being precise about why, because
the reason is structural rather than evasive.

**Migration has no mirror.** Trade statistics can be audited by comparing the
exporter's record against the importer's record for the same shipment, so a gap
between them is visible and informative. Migration has no equivalent, because
almost no state records the departure of its own nationals. Exit is not
controlled the way entry is. So "ask the origin country for its side" is a
request for a number that no agency in that country is positioned to hold.

**The registers that do exist measure a different thing.** India, Pakistan,
Bangladesh, Nepal and Sri Lanka all run detailed emigration registers, several
updated monthly, and the widespread claim that these countries publish nothing is
simply false. But every one of them is a labour-protection instrument. They clear
a worker to depart under a vetted foreign employment contract, and they exist
because the destination is a jurisdiction where the sending state judges its
nationals to need protection. India's Emigration Check Required list names 18
countries designated on the basis that they "do not have strict laws regulating
the entry and employment of foreign nationals". Australia is not among them.

The consequence is a systematic near-absence of Australia from all of them:

| Origin register | Total | Destinations | To Australia |
|---|---|---|---|
| India, MEA emigration clearances | 1,249,005 | 14 | not listed |
| Bangladesh, Overseas Employment Platform | 3,427,182 | 158 | 70 |
| Sri Lanka, SLBFE registrations 2025 | 311,223 | 39 | 743 |

**These numbers must not be read as corridor sizes.** Bangladesh recording 70
does not contradict Australia recording far more Bangladesh-born arrivals, and it
is not evidence of under-reporting by either party. Students, skilled independent
migrants and family arrivals are invisible to a labour clearance bureau by
construction, and those routes carry almost everyone who reaches Australia.
Quoting 70 as the size of Bangladeshi migration to Australia would be a serious
misuse of this data, which is why `instrument_measures` is a mandatory column
rather than a footnote.

### What verification is actually available

A third party that estimates every country on one method and has no stake in the
Australian argument. That is the UN Population Division, republished through the
World Bank's keyless API as `SM.POP.TOTL` (migrant stock) and `SM.POP.NETM` (net
migration). It is independent of Australia and of the origin countries, so it is
free to disagree, and `data/corroboration.csv` records what happens when it is
allowed to. The agreement band is fixed at plus or minus 5 per cent, chosen
before the comparison was run rather than after.

**Stock: Australia passes.** In all three census years tested, the ABS count of
foreign-born residents and the UN estimate agree within 2.7 per cent. Australia's
count of who lives here is independently confirmed.

**Flow: they diverge, in 8 of 9 years.** The decisive case is the pandemic. For
the year to June 2021 the ABS records net migration of **-84,930**, Australia
losing people with the border closed. The UN series records **+116,768** for
2021.

That gap is not a scandal on either side. ABS measures border crossings directly
under the 12/16 month rule. The UN derives net migration residually from a
population balance equation and smooths it across multi-year periods, which is
appropriate for comparing 200 countries and structurally incapable of seeing a
border shut in a single year.

### The rule this register follows

- For an **annual Australian migration figure**, cite ABS. It is the better
  instrument, and this is now demonstrated rather than assumed.
- For **cross-country comparison** or the **size of a resident migrant
  population**, the UN series is legitimate independent corroboration, and
  Australia passes it.
- Quoting the UN's net migration figure **against** ABS is a misuse of it. Anyone
  citing 138,510 as Australia's 2024 intake is citing a smoothed residual, not a
  measurement.

Publishing the case against our own preferred source is deliberate. A register
that only reported checks it passed would not be worth checking.

### When an extraction fails, nothing is published

Pakistan's Bureau of Emigration and Overseas Employment publishes the longest
series of any of these: 15,172,687 workers registered for employment abroad from
1971 to July 2026, with destination detail, updated monthly. None of it appears
in this register.

BEOE returns HTTP 403 to every automated file request, and a rendered parse of
its country table failed validation: it recovered 33 of 54 rows and corrupted
country labels, rendering Qatar as "Galier". Two things follow. The figures
cannot be published, and Australia's apparent absence from the parsed rows cannot
be reported either, because a parse that mangles country names is not evidence of
what is missing from the source.

Pakistan is therefore recorded in `australia-vs-origin-country-data.csv` as
publishing, with no figures and no absence claim, and the note says plainly that
the limitation is ours and not Pakistan's.

Sri Lanka is the counter-example that shows the standard is passable. Its figures
are transcribed from an annual PDF, normally the weakest link in any dataset, but
the report prints its own total and the ingest script recomputes it. The 39
transcribed rows sum to 311,223, matching the published total exactly, and the
script throws rather than writing the file if they ever stop matching.

### Corrections made on 2026-08-26

Four rows in this register were wrong and have been corrected in place, with the
correction recorded in the row rather than quietly overwritten.

- **Bangladesh** was recorded as having no API and publishing nothing for
  Australia. Both were wrong, and the fault was in our test. The report is backed
  by a filterable JSON endpoint returning 158 destinations, Australia among them.
- **Sri Lanka** was tested against the Department of Census and Statistics, which
  is the wrong agency. Foreign employment is SLBFE, which publishes a full
  destination table annually.
- **Nepal** was recorded as not publishing Australia-bound data. That overstated
  the evidence: DoFE lists Australia at number 8 of 149 recognised destination
  countries, so the corridor is inside the system even though a published count
  for it could not be verified.
- **Pakistan**'s note was replaced with the specific, reproducible reason above.


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
