// digest.mjs — B4: "what happened since you last looked", derived from the
// ledgers that already exist. The Evidence timeline holds receipt history;
// this is the narrative layer over ALL the ledgers at once: commits, lane
// verdicts (each latest.json revision's own verdict), approval events, open
// comments. Nothing here is a new record — every line is derived from git or
// a committed ledger, so the digest can never disagree with the audit trail.

const short = (s) => String(s ?? "").slice(0, 7);

/**
 * @param {string} projectDir
 * @param {{ execFileAsync: Function, sinceDays?: number, limit?: number }} deps
 * @returns {Promise<{available: boolean, reason?: string, since: string,
 *   commits: Array<{sha, subject, when}>,
 *   laneRuns: Array<{sha, when, verdict, strength?: string}>,
 *   approvalEvents: Array<{sha, when, subject}>,
 *   openComments: number|null}>}
 */
export async function getDigestData(projectDir, { execFileAsync, sinceDays = 7, limit = 30 } = {}) {
  const git = async (args) =>
    (await execFileAsync("git", args, { cwd: projectDir, timeout: 8000, maxBuffer: 4 * 1024 * 1024 })).stdout;
  const since = `${sinceDays} days ago`;

  let commits;
  try {
    const raw = await git(["log", `--since=${since}`, `--max-count=${limit}`, "--pretty=%H%x00%ci%x00%s"]);
    commits = raw
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [sha, when, subject] = l.split("\0");
        return { sha: short(sha), when, subject };
      });
  } catch (err) {
    return { available: false, reason: `not a git repo (or git failed): ${err.message}`, since, commits: [], laneRuns: [], approvalEvents: [], openComments: null };
  }

  // Lane runs: every revision of the receipt inside the window, verdict read
  // from THAT commit's bytes — the committed receipt is the record, per the
  // evidence discipline (commit each receipt; git history is the ledger).
  const laneRuns = [];
  try {
    const raw = await git(["log", `--since=${since}`, "--pretty=%H%x00%ci", "--", "qa/evidence/latest.json"]);
    for (const line of raw.split("\n").filter(Boolean).slice(0, 12)) {
      const [sha, when] = line.split("\0");
      try {
        const body = await git(["show", `${sha}:qa/evidence/latest.json`]);
        const receipt = JSON.parse(body);
        const onDevice = receipt.strength?.onDeviceSteps ?? [];
        laneRuns.push({
          sha: short(sha),
          when,
          verdict: receipt.verdict ?? "unknown",
          strength: onDevice.length ? `on-device: ${onDevice.join("+")}` : "desktop-only",
        });
      } catch {
        laneRuns.push({ sha: short(sha), when, verdict: "unreadable" });
      }
    }
  } catch {
    /* no receipt history — the section says so via the empty list */
  }

  // Approval events: commits touching the approvals ledger. The subject line is
  // the human-readable record of WHAT was approved/reopened.
  let approvalEvents = [];
  try {
    const raw = await git(["log", `--since=${since}`, "--pretty=%H%x00%ci%x00%s", "--", "qa/approvals.json"]);
    approvalEvents = raw
      .split("\n")
      .filter(Boolean)
      .slice(0, 12)
      .map((l) => {
        const [sha, when, subject] = l.split("\0");
        return { sha: short(sha), when, subject };
      });
  } catch {
    /* ledger absent */
  }

  // Open comments — read via the committed ledger directly (cheap, no bridge).
  let openComments = null;
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const ledger = path.join(projectDir, "qa", "comments.json");
    if (fs.existsSync(ledger)) {
      const data = JSON.parse(fs.readFileSync(ledger, "utf8"));
      openComments = (data.comments ?? []).filter((c) => c.status === "open").length;
    }
  } catch {
    openComments = null; // unreadable ledger is surfaced as unknown, not zero
  }

  return { available: true, since, commits, laneRuns, approvalEvents, openComments };
}
