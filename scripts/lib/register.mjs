/**
 * Shared helpers for every ingest script in this register.
 *
 * The one rule this file exists to enforce: EVERY row carries `source_url` and
 * `source_retrieved_at`. A figure whose origin a reader cannot check is not
 * data, it is an assertion, and this register is only useful to anyone because
 * every number in it can be traced back to a public record.
 *
 * `source_tier` separates records from claims:
 *   primary — a public record (a statistical agency series, a contract notice,
 *             a planning approval, a filing, a job advertisement)
 *   claim   — publicly available but promotional (a company media release)
 *
 * Mixing those two silently is how a dataset loses its authority. Kept apart,
 * a reader can trust the primary tier completely and discount the rest.
 */

/** RFC 4180 quoting: wrap in quotes when the value contains a comma, quote or
 *  newline, and double any embedded quotes. */
export function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const header = columns.join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(","));
  return [header, ...body].join("\n") + "\n";
}

export const PROVENANCE_COLUMNS = ["source_tier", "source_url", "source_retrieved_at"];

/** Throws rather than writing a row that cannot be checked. Deliberately fatal:
 *  a silently unsourced row would survive into a published figure. */
export function assertProvenance(rows) {
  const bad = [];
  rows.forEach((r, i) => {
    if (!r.source_url) bad.push(`row ${i}: missing source_url`);
    if (!r.source_retrieved_at) bad.push(`row ${i}: missing source_retrieved_at`);
    if (!["primary", "claim"].includes(r.source_tier))
      bad.push(`row ${i}: source_tier must be "primary" or "claim", got ${JSON.stringify(r.source_tier)}`);
  });
  if (bad.length) {
    throw new Error(`provenance check failed (${bad.length}):\n  ${bad.slice(0, 10).join("\n  ")}`);
  }
}

/** Fetch with retries, falling back to curl.
 *
 *  Ingest runs on a weekly cron, so a transient upstream blip must not silently
 *  produce an empty dataset. This throws instead, and the workflow fails loudly
 *  with the previous week's data left intact — a stale-but-honest register is
 *  recoverable, a silently-emptied one is not.
 *
 *  The curl fallback is deliberate, not a workaround for a bug. Some sandboxed
 *  and corporate environments permit curl while blocking node's outbound
 *  sockets, and several of the upstream statistical hosts are slow enough to
 *  exceed undici's fixed 10s connect timeout, which is not configurable through
 *  the standard fetch options. curl is present on every GitHub Actions runner
 *  and every developer machine this will realistically run on. */
export async function fetchText(url, { headers = {}, attempts = 3, sleepMs = 2000, timeoutSec = 60 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      const text = await res.text();
      if (!text.trim()) throw new Error(`empty body from ${url}`);
      return text;
    } catch (err) {
      lastErr = err;
      try {
        return await curlText(url, headers, timeoutSec);
      } catch (curlErr) {
        lastErr = curlErr;
      }
      if (i < attempts) await new Promise((r) => setTimeout(r, sleepMs * i));
    }
  }
  throw lastErr;
}

async function curlText(url, headers, timeoutSec) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const args = ["-sS", "--fail", "--max-time", String(timeoutSec), "--location"];
  for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
  args.push(url);
  // Statistical bulk downloads run to tens of megabytes; the default 1MB
  // stdout buffer would truncate them into a corrupt dataset.
  const { stdout } = await run("curl", args, { maxBuffer: 256 * 1024 * 1024 });
  if (!stdout.trim()) throw new Error(`empty body from ${url} (curl)`);
  return stdout;
}

/** Parse SDMX-CSV with `labels=both`, where each dimension header and cell is
 *  "code: Label". Returns rows keyed by the dimension ID with `{code, label}`. */
export function parseSdmxCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0]).map((h) => h.split(":")[0].trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      const raw = cells[i] ?? "";
      const m = raw.match(/^([^:]+):\s*(.*)$/);
      row[h] = m ? { code: m[1].trim(), label: m[2].trim() } : { code: raw, label: raw };
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
