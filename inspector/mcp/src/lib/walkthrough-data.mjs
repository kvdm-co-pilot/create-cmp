// walkthrough-data.mjs — the console's read side of qa/walkthrough.mjs runs (A2/A3).
//
// The walkthrough writes evidence (`qa/evidence/walkthrough/<stamp>/manifest.json`
// + pixels + trees + report.html); this module only READS manifests — the same
// derived-truth discipline as every other console section: the section is a
// mirror of what the walk actually recorded, never a re-computation.

import fs from "node:fs";
import path from "node:path";

export const WALKTHROUGH_REL_DIR = path.join("qa", "evidence", "walkthrough");

/**
 * @returns {{ available: boolean, reason?: string,
 *   runs: Array<{dir: string, relDir: string, generatedAt: string, appId: string,
 *     screenCount: number, a11yViolations: number, unsettled: number,
 *     notWalked: number, hasReport: boolean, manifest: object}> }}
 *   Newest first. `manifest` is included only for the newest run (the section
 *   renders it in full; older runs are one-line history + diff anchors).
 */
export function getWalkthroughData(projectDir, { limit = 8 } = {}) {
  const root = path.join(projectDir, WALKTHROUGH_REL_DIR);
  if (!fs.existsSync(root)) {
    return { available: false, reason: "no walkthrough runs yet — node qa/walkthrough.mjs against the live app", runs: [] };
  }
  const runs = [];
  for (const entry of fs.readdirSync(root)) {
    const dir = path.join(root, entry);
    const manifestPath = path.join(dir, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue; // diff dirs and strays are not runs
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (err) {
      // An unparseable manifest is surfaced, not treated as "no run" — same
      // honesty rule as the comments ledger.
      runs.push({ dir, relDir: path.join(WALKTHROUGH_REL_DIR, entry), error: `manifest unreadable: ${err.message}` });
      continue;
    }
    runs.push({
      dir,
      relDir: path.join(WALKTHROUGH_REL_DIR, entry),
      relDirBase: entry, // the console's /walkthrough/<base>/… static route key
      generatedAt: manifest.generatedAt ?? entry,
      appId: manifest.appId ?? "unknown",
      screenCount: (manifest.screens ?? []).length,
      a11yViolations: (manifest.screens ?? []).reduce((a, s) => a + ((s.a11y?.violations ?? []).length), 0),
      unsettled: (manifest.screens ?? []).filter((s) => s.settled === false).length,
      notWalked: (manifest.notWalked ?? []).length,
      hasReport: fs.existsSync(path.join(dir, "report.html")),
      manifest,
    });
  }
  runs.sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
  const trimmed = runs.slice(0, limit).map((r, i) => (i === 0 ? r : { ...r, manifest: undefined }));
  return trimmed.length
    ? { available: true, runs: trimmed }
    : { available: false, reason: "walkthrough directory exists but holds no runs", runs: [] };
}
