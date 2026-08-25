# Australian Public AI Register

An open dataset of how Australian governments spend on artificial intelligence:
contracts, public-sector hiring, data centre investment, migration composition,
and where each political party actually stands.

**Every row carries the URL it came from and the date it was retrieved.** No
figure in this repository asks you to take our word for it.

## Why this exists

Australia publishes a great deal of relevant data and almost none of it is
joined up. Contract notices sit on AusTender, migration composition sits in ABS
SDMX endpoints, provider sanctions sit with ASQA, and parliamentary quotes sit
in Hansard XML. Answering a question that spans two of them currently means a
week of manual work, so mostly nobody does it.

This register does that joining once, in public, and keeps it current.

## Datasets

| File | What it covers | Source | Rows |
|---|---|---|---|
| `data/nom-by-visa.csv` | Net overseas migration by visa group, arrivals and departures, by state, financial years | ABS `ABS_NOM_VISA_FY` | 2,754 |

More datasets are being added. `SOURCES.md` lists every feed and its cadence.

## Provenance

Three columns appear in every dataset and are enforced by CI:

- **`source_url`** — the exact URL the row came from. For API-derived data this
  is the precise query, so you can re-run it and get the same numbers.
- **`source_retrieved_at`** — ISO 8601 timestamp of retrieval.
- **`source_tier`** — `primary` for a public record (a statistical series, a
  contract notice, a filing, a job advertisement) or `claim` for something
  publicly available but promotional, such as a company media release.

`scripts/check-provenance.mjs` fails the build if any row has a blank value in
those columns, if `source_tier` is anything other than those two values, or if a
`source_url` is a **bare homepage**. A front page changes daily and cannot
evidence a historical figure.

Keeping `primary` and `claim` apart is deliberate. A dataset that silently mixes
an audited contract value with a vendor press release is not one you can build
on. Separated, you can trust the primary tier completely and discount the rest.

## Verifying any figure

```bash
# Take any row, copy its source_url, and re-run it yourself:
curl -H "Accept: application/vnd.sdmx.data+csv;labels=both" "<source_url>"
```

Every ingest is re-runnable and idempotent:

```bash
node scripts/ingest-abs-nom.mjs --dry-run   # report row counts, write nothing
node scripts/ingest-abs-nom.mjs             # regenerate the CSV
node scripts/check-provenance.mjs           # the CI gate, run locally
```

## Citing this dataset

Please cite the DOI for the release you used, so your reference stays valid when
the data updates. Attribution is the only condition of the licence.

## Licence

**CC BY 4.0.** Use it, publish it, build on it commercially. The only
requirement is attribution. See `LICENSE`.

## Who publishes this, and their position

This register is compiled and published by **mindiam** (https://mindiam.com).

mindiam also runs an opinion section, *AI Policy Watch*, which argues a position
on Australian AI and migration policy. That section is clearly labelled as
opinion and is editorially separate from this repository.

We are telling you this because you should know it. **The data here is not
selected, filtered or framed to support that position.** The datasets are built
to be complete for their stated scope, the methodology is published in full in
`methodology.md`, and the git history of this repository is a permanent audit
trail of every change ever made to every number.

If you find a figure you cannot reproduce from its `source_url`, open an issue.
That is a defect and it will be fixed.
