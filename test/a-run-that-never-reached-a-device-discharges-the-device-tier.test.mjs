// A RUN THAT NEVER TOUCHED A PHONE DISCHARGES THE TIER THAT EXISTS TO PROVE ONE.
//
// The device tier is now scheduled by the app this tree STAMPS: a PASS fleet
// record whose `stampedOutputHash` equals the current stamp discharges it,
// "whichever slice bought it" (docs/GATE-RULES.md Rule 4,
// scripts/proof-plan.mjs `fleetProof`). That is the right key. What is read
// beside it is not: `fleetProof` returns the record on a digest match and
// `tierState` accepts it on `verdict === "PASS"` ALONE — the RUNG is never
// asked for.
//
// A fleet check is PASS at whatever rung it was told to require:
// `scripts/fleet-check.mjs --min-level L1` runs the desktop lane, touches no
// device, and writes `{verdict: "PASS", rung: "L1"}` (fleet-check.mjs:
// `verdict: failures.length ? "FAIL" : "PASS"`). Measured on this tree
// 2026-09-22, with such a record on disk and a `template/` edit in the slice:
//
//   device (fleet L2)  DISCHARGED
//       the stamped app is byte-identical to the one proven at … — verdict PASS, rung L1
//
// so `gh pr merge` is not blocked, and an edit to the template merges with the
// device tier's own question — does this app run on a phone — never asked. The
// word the line uses for it is "proven".
//
// THE CLASS, NOT THE INSTANCE. The fact being dropped is not "L1": it is that a
// recorded run attests a LEVEL, and every reader of that record must hold it to
// the level its own tier declares. One reader already does — the publish gate
// spells `rung >= 2` (scripts/hooks/proof-gate.mjs) — and the two that decide
// the TIER do not, so the same fact has one spelling in the release path and
// none in the schedule. This file asserts it at both of the schedule's readers,
// over every rung below the requirement, and it takes the requirement from the
// tier's own declared command rather than spelling "L2" a fourth time.
//
// The control case is the point of the tier existing at all: a record AT the
// required rung still discharges. A fix that simply stopped discharging would
// buy back the 3.5-minute run this whole slice exists to avoid.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { TIERS } from "../scripts/proof-plan.mjs";
import { LEVELS } from "../scripts/fleet-check.mjs";
import { stampedOutput, STAMPED_OUTPUT_RULE } from "../scripts/stamped-output.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRANCH = "slice/under-test";

/** Everything `bin/create-cmp.mjs` and `scripts/proof-plan.mjs` read. */
const COPIED = ["bin", "src", "template", "packages", "scripts", "options.schema.json", "package.json"];

/**
 * The rung the device tier ITSELF demands, read out of the command it tells an
 * agent to run — `TIERS.device.cmd` ends in `--min-level L2`. Taken from there
 * so this file cannot be the place the requirement drifts: if the tier is ever
 * declared at another rung, these cases follow it.
 */
const REQUIRED = /--min-level\s+(L\d)/.exec(TIERS.device.cmd)?.[1];

/** Every rung a fleet check can PASS at that is BELOW what this tier asks for, plus the record that asserts none at all. */
const BELOW = [...LEVELS.slice(0, LEVELS.indexOf(REQUIRED)), null];

/** A copy of this repository on a slice branch, with `origin/main` at the commit it opened from. */
function repoCopy() {
  // realpath: os.tmpdir() is a symlink on macOS and proof-plan.mjs only runs
  // main() when `path.resolve(process.argv[1])` is its own resolved spelling.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "unproven-discharge-")));
  for (const entry of COPIED) fs.cpSync(path.join(ROOT, entry), path.join(tmp, entry), { recursive: true });
  const git = (...a) => execFileSync("git", a, { cwd: tmp, stdio: ["ignore", "pipe", "ignore"] });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("add", "-A");
  git("commit", "-qm", "the tree the slice opened from");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("switch", "-q", "-c", BRANCH);
  return { dir: tmp, dispose: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

const artifact = (repo, name, body) => {
  fs.mkdirSync(path.join(repo.dir, "qa-artifacts"), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, "qa-artifacts", name), `${JSON.stringify(body, null, 2)}\n`);
};

/** The record `fleet-check` writes when its lane passed at `rung` over these exact stamped bytes. */
function recordAt(repo, stamped, rung) {
  artifact(repo, "fleet-latest.json", {
    schema: "cmp-fleet-check/1",
    ranAt: "2026-09-22T09:00:00.000Z",
    verdict: "PASS", // fleet-check: `failures.length ? "FAIL" : "PASS"` — PASS is relative to --min-level
    rung,
    pack: "cmp",
    requiredLevel: rung ?? "L1",
    failures: [],
    avd: rung === REQUIRED ? "Medium_Phone_API_35" : null,
    stampedOutputHash: stamped.hash,
    // The rule fleet-check writes beside the digest; without it a record reads as rule 1 (scripts/stamped-output.mjs).
    stampedOutputRule: STAMPED_OUTPUT_RULE,
    stampedOutputFiles: stamped.files,
    commit: null,
    treeWasDirty: false,
    laneVerdict: "PASS",
    steps: [{ name: rung === REQUIRED ? "e2eSmoke" : "desktopTest", verdict: "PASS", durationMs: 4000 }],
  });
  // A declared slice that has discharged nothing: the bookkeeping is out of the
  // way, so what answers below is the record and only the record.
  artifact(repo, "proof-plan.json", {
    schema: "prooflane-proof-plan/1",
    slice: "a slice that edited the template",
    branch: BRANCH,
    openedAt: "2026-09-22T09:00:00.000Z",
    base: null,
    declared: { suite: "per-commit", frameworkCheck: "per-commit", device: "at-close", review: "at-close" },
    discharged: null,
    reviewDischarged: null,
  });
}

function planOutput(repo, args = []) {
  const r = spawnSync(process.execPath, [path.join(repo.dir, "scripts", "proof-plan.mjs"), ...args], { cwd: repo.dir, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function deviceBlock(out) {
  const m = out.match(/\n {2}L2 run +([\s\S]*?)(?=\n {2}review +|$)/);
  assert.ok(m, `no device block in:\n${out}`);
  return m[1];
}

test("a fleet record BELOW the rung the device tier declares must not discharge it — at either reader", () => {
  assert.ok(REQUIRED, `the device tier's command does not name a --min-level, so this file cannot read what it requires: ${TIERS.device.cmd}`);
  assert.ok(BELOW.length > 1, `no rung below ${REQUIRED} to test with — LEVELS is ${LEVELS.join(", ")}`);

  const repo = repoCopy();
  try {
    // A slice that edits a file which SHIPS, so the tier is genuinely required
    // and the state below is a real answer rather than "none".
    fs.appendFileSync(path.join(repo.dir, "template/composeApp/src/commonMain/kotlin/com/example/app/App.kt"), "\n// a line that ships\n");
    const stamped = stampedOutput(repo.dir);

    for (const rung of BELOW) {
      recordAt(repo, stamped, rung);

      const block = deviceBlock(planOutput(repo).out);
      assert.doesNotMatch(
        block,
        /^DISCHARGED/,
        `a fleet record at rung ${rung ?? "none"} — below the ${REQUIRED} this tier's own command requires — discharged the device tier. ` +
          `A \`--min-level L1\` run is PASS without an emulator ever being attached, so the app this slice changed merges with the tier's own question never asked; ` +
          `the publish gate holds the same record to \`rung >= 2\` and this reader holds it to nothing:\n${block}`,
      );

      const d = planOutput(repo, ["--discharge"]);
      assert.notEqual(
        d.status,
        0,
        `\`proof-plan --discharge\` wrote a discharge from a rung-${rung ?? "none"} record. A discharge is READ from the run's record (GATE-RULES Rule 4) — reading its verdict and not its rung reads half of it:\n${d.out}`,
      );
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(repo.dir, "qa-artifacts", "proof-plan.json"), "utf8")).discharged,
        null,
        `and nothing may be written down for a run at rung ${rung ?? "none"}`,
      );
    }
  } finally {
    repo.dispose();
  }
});

test("a fleet record AT the declared rung still discharges — the control the fix must not break", () => {
  const repo = repoCopy();
  try {
    fs.appendFileSync(path.join(repo.dir, "template/composeApp/src/commonMain/kotlin/com/example/app/App.kt"), "\n// a line that ships\n");
    recordAt(repo, stampedOutput(repo.dir), REQUIRED);

    const block = deviceBlock(planOutput(repo).out);
    assert.match(
      block,
      /^DISCHARGED/,
      `a PASS run at ${REQUIRED} over these exact stamped bytes did NOT discharge the tier. Refusing everything is not the fix — the 3.5-minute run the stamped-app schedule exists to buy once would be bought again:\n${block}`,
    );
    assert.equal(planOutput(repo, ["--discharge"]).status, 0, "and it can still be written down");
  } finally {
    repo.dispose();
  }
});
