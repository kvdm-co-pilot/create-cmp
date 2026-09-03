// The governance journal (2026-07-28 flow audit — fixes 1–4).
//
// What the audit found, pinned here so it cannot regress:
//   1. qa/approvals.json is a mutable SNAPSHOT — every transition overwrote the
//      row, so "what happened while I was away, who did it, why" was
//      structurally unanswerable. Fix: qa/approvals.log.jsonl, append-only.
//   2. Reopen — the one agent-executable state change against a SIGNED
//      artifact — recorded neither actor nor reason. Fix: --reason REQUIRED,
//      via + reason on the row and in the journal.
//   3. `reopened` was ONE state covering two opposite situations (mid-redesign
//      vs redesign-proven-awaiting-signature); the next-step table said
//      "human", the queue said "nothing waits on you". Fix: the split is
//      DERIVED from provenDone — same derivation acceptance trusts.
//   4. One change = N reopen commands. Fix: reopenFeature walks the brief's
//      declared set under one reason, journal events grouped by feature.
//
// Harness style mirrors test/genesis-flow.test.mjs: scaffold the real template
// (verify:false, gradle-free), import the generated project's own libraries.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { scaffold } from "../src/scaffold.mjs";

function baseConfig(targetDir) {
  return {
    appName: "Acme",
    package: "com.acme.demo",
    iosBundleId: "com.acme.demo",
    region: "us-central1",
    themePrefix: "Acme",
    platforms: { android: true, ios: true },
    firebase: { enabled: true, auth: "both", firestore: true, storage: true, functions: true, fcm: true },
    room: true,
    e2e: true,
    inspector: true,
    devClient: true,
    tabs: [{ label: "Home", icon: "home" }],
    targetDir,
  };
}

function runApprove(root, args) {
  return execFileSync(process.execPath, [path.join(root, "qa/approve.mjs"), ...args, "--as", "Test Signer <test@example.com>"], { cwd: root, encoding: "utf8" });
}

function runApproveExpectFail(root, args) {
  try {
    execFileSync(process.execPath, [path.join(root, "qa/approve.mjs"), ...args, "--as", "Test Signer <test@example.com>"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.fail("expected qa/approve.mjs to exit non-zero");
  } catch (err) {
    return { status: err.status, stdout: err.stdout, stderr: err.stderr };
  }
}

const JOURNAL = "qa/approvals.log.jsonl";

test("governance journal: attribution, memory, the derived split, one-change reopen", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-gov-journal-"));
  await scaffold(baseConfig(root), { verify: false });
  const lib = await import(pathToFileURL(path.join(root, "qa/lib/approvals.mjs")));
  const { computeInputsHash } = await import(pathToFileURL(path.join(root, "qa/lib/inputs-hash.mjs")));

  // A brief with a declared blast radius, for the reopenFeature walk later.
  fs.mkdirSync(path.join(root, "docs/features"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs/features/meal.md"),
    '# meal\n\n## Decisions\n\n- the day boundary is 04:00.\n\n```json cmp:feature\n{ "touches": ["components"] }\n```\n',
  );

  await t.test("reopen REFUSES without a reason — library and CLI, same refusal", () => {
    runApprove(root, ["design-system"]);
    const res = lib.reopenArtifact(root, "design-system");
    assert.equal(res.ok, false);
    assert.match(res.reason, /without a reason/);
    assert.match(res.reason, /--reason/);
    // Whitespace is not a reason.
    assert.equal(lib.reopenArtifact(root, "design-system", { reason: "   " }).ok, false);
    const cli = runApproveExpectFail(root, ["--reopen", "design-system"]);
    assert.match(cli.stderr, /without a reason/);
    // The refusal changed nothing: still approved.
    assert.equal(lib.getApprovalStatuses(root).find((s) => s.id === "design-system").status, "approved");
  });

  await t.test("reopen records WHO and WHY — on the row, surfaced by status, printed by --status", () => {
    const res = lib.reopenArtifact(root, "design-system", { reason: "palette reads too cold on device", via: "cli" });
    assert.equal(res.ok, true);
    const row = JSON.parse(fs.readFileSync(path.join(root, "qa/approvals.json"), "utf8")).artifacts.find(
      (a) => a.artifact === "design-system",
    );
    assert.equal(row.reason, "palette reads too cold on device");
    assert.equal(row.via, "cli");
    const live = lib.getApprovalStatuses(root).find((s) => s.id === "design-system");
    assert.equal(live.reason, "palette reads too cold on device");
    assert.equal(live.via, "cli");
    assert.match(runApprove(root, ["--status"]), /palette reads too cold on device/);
  });

  await t.test("the journal is memory the snapshot destroys: re-approval clears the row, the journal keeps the episode", () => {
    runApprove(root, ["design-system"]); // close the redesign
    const row = JSON.parse(fs.readFileSync(path.join(root, "qa/approvals.json"), "utf8")).artifacts.find(
      (a) => a.artifact === "design-system",
    );
    // The snapshot forgets — same wholesale-replace semantics as ever…
    assert.equal(row.reopenedAt, undefined);
    assert.equal(row.reason, undefined);
    // …and the journal remembers: approve → reopen(reason) → approve, in order.
    const events = lib.readJournal(root).filter((e) => e.artifact === "design-system");
    assert.deepEqual(
      events.map((e) => e.verb),
      ["approve", "reopen", "approve"],
    );
    assert.equal(events[1].reason, "palette reads too cold on device");
    assert.equal(events[1].via, "cli");
    assert.match(events[1].at, /^\d{4}-\d{2}-\d{2}T/);
    // --log prints the same history.
    const log = runApprove(root, ["--log"]);
    assert.match(log, /reopen design-system \(via cli\) — palette reads too cold on device/);
  });

  await t.test("readJournal tolerates a mangled line — one bad append never blinds the history", () => {
    const before = lib.readJournal(root).length;
    fs.appendFileSync(path.join(root, JOURNAL), "{not json\n");
    fs.appendFileSync(path.join(root, JOURNAL), `${JSON.stringify({ at: "2026-07-28T00:00:00.000Z", verb: "approve", artifact: "x" })}\n`);
    const events = lib.readJournal(root);
    assert.equal(events.length, before + 1, "the corrupt line is skipped, the good one read");
  });

  await t.test("appending history never invalidates evidence: the journal is outside the verified surface", () => {
    const before = computeInputsHash(root).hash;
    lib.appendJournal(root, { verb: "approve", artifact: "noise", via: "cli" });
    lib.appendJournal(root, { verb: "reopen", artifact: "noise", reason: "more noise" });
    assert.equal(computeInputsHash(root).hash, before, "journal appends must not move the inputs hash (same principle as qa/comments.json)");
  });

  await t.test("the split state, derived: reopened+unproven waits on the AGENT; reopened+provenDone waits on the HUMAN", () => {
    // Build meal to provenDone: signed brief, signed spec, cited clauses, PASS receipt attesting the tree.
    runApprove(root, ["feature-brief:meal"]);
    fs.writeFileSync(path.join(root, "specs/meal.spec.md"), "# meal\n\n- **MEAL-01** — Given…\n");
    runApprove(root, ["feature-spec:meal"]);
    const testDir = path.join(root, "composeApp/src/commonTest/kotlin/com/acme/demo");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(
      path.join(testDir, "MealTest.kt"),
      "class MealTest {\n  // SPEC: MEAL-01\n  @Test\n  fun `meal`() {}\n}\n",
    );
    const writeReceipt = () => {
      fs.mkdirSync(path.join(root, "qa/evidence"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "qa/evidence/latest.json"),
        JSON.stringify({ verdict: "PASS", inputs: { hash: computeInputsHash(root).hash } }, null, 2),
      );
    };
    writeReceipt();
    assert.equal(lib.getFeatureBoard(root).features.find((f) => f.name === "meal").provenDone, true);

    // Reopen the brief, then IMMEDIATELY break provenDone (edit the tree so the
    // receipt goes stale): mid-redesign — the agent owns the next step.
    assert.equal(lib.reopenArtifact(root, "feature-brief:meal", { reason: "add veg tracking", via: "cli" }).ok, true);
    fs.appendFileSync(path.join(testDir, "MealTest.kt"), "// redesign in flight\n");
    let card = lib.getFeatureBoard(root).features.find((f) => f.name === "meal");
    assert.equal(card.phase, "reopened");
    assert.equal(card.provenDone, false);
    assert.equal(card.nextStep.owner, "agent", "an unproven redesign waits on the WORK, not the human");
    assert.match(card.nextStep.label, /redesign in progress/);

    // Prove the redesign (fresh receipt over the tree as it stands): the SAME
    // stored state now derives the human's turn.
    writeReceipt();
    card = lib.getFeatureBoard(root).features.find((f) => f.name === "meal");
    assert.equal(card.phase, "reopened");
    assert.equal(card.provenDone, true);
    assert.equal(card.nextStep.owner, "human", "a PROVEN redesign waits on exactly the signature");
    assert.match(card.nextStep.label, /redesign proven — re-approve the brief/);
  });

  await t.test("reopenFeature: one recorded change — the brief + its spec are walked back; the declared touch stays SIGNED and the hash enforces it (S5)", () => {
    // Close the previous redesign so the whole set is approved again.
    runApprove(root, ["feature-brief:meal"]);
    runApprove(root, ["components"]);
    // feature-spec:meal is still approved from above; feature-design:meal does
    // not exist (no screens) — the walk must skip what it cannot reopen and
    // say so, never fail on it.
    const noReason = lib.reopenFeature(root, "meal", {});
    assert.equal(noReason.ok, false);
    assert.match(noReason.reason, /without a reason/);

    const res = lib.reopenFeature(root, "meal", { reason: "portion sizes join the meal card", via: "cli" });
    assert.equal(res.ok, true);
    // What the change AMENDS is reopened: the brief and its spec. The declared
    // touch is NOT — an `approved` artifact is by construction one whose bytes
    // still match its signature, so reopening it re-asks a question the hash
    // already answered (twelve identical re-signatures, 2026-09-02).
    assert.deepEqual(res.reopened.sort(), ["feature-brief:meal", "feature-spec:meal"].sort());
    assert.deepEqual(
      res.stillSigned.map((t) => ({ id: t.id, status: t.status })),
      [{ id: "components", status: "approved" }],
      "the declared blast radius is REPORTED, with its state, not walked back",
    );
    assert.match(res.stillSigned[0].hash, /^[0-9a-f]{8}$/, "and the signed hash it still matches");
    for (const id of res.reopened) {
      const s = lib.getApprovalStatuses(root).find((x) => x.id === id);
      assert.equal(s.status, "reopened");
      assert.equal(s.reason, "portion sizes join the meal card");
    }
    assert.equal(lib.getApprovalStatuses(root).find((x) => x.id === "components").status, "approved", "still signed on disk too");
    // The journal groups the walk under the feature's name — one change, readable as one —
    // and records no reopen for the artifact that was not reopened.
    const events = lib.readJournal(root).filter((e) => e.verb === "reopen" && e.feature === "meal");
    assert.deepEqual(events.map((e) => e.artifact).sort(), ["feature-brief:meal", "feature-spec:meal"].sort());
    assert.ok(events.every((e) => e.reason === "portion sizes join the meal card"));

    // PLANTED — the enforcement the doc always assigned to the hash. Move the
    // bytes the components signature covers, with no reopen verb anywhere, and
    // the signature is demanded again by the hash alone.
    const componentsDir = path.join(root, "composeApp/src/commonMain/kotlin", ...baseConfig(root).package.split("."), "presentation/components");
    const aComponent = fs.readdirSync(componentsDir).find((f) => f.endsWith(".kt"));
    assert.ok(aComponent, "the scaffold ships components");
    fs.appendFileSync(path.join(componentsDir, aComponent), "\n// S5: a real edit to a touched artifact\n");
    assert.equal(lib.getApprovalStatuses(root).find((x) => x.id === "components").status, "changed-since-approval", "hashes enforce — a fresh signature is demanded because the bytes moved, not because a verb ran");

    // Nothing approved left in the set → honest refusal, naming the states.
    const again = lib.reopenFeature(root, "meal", { reason: "again" });
    assert.equal(again.ok, false);
    assert.match(again.reason, /no signature to walk back/);

    // Unknown feature → refusal naming known briefs.
    const unknown = lib.reopenFeature(root, "nope", { reason: "x" });
    assert.equal(unknown.ok, false);
    assert.match(unknown.reason, /known briefs: meal/);
  });

  await t.test("the CLI walk: --reopen-feature prints the set; --reopen requires its reason inline", () => {
    // Re-approve the set so the CLI has something to walk.
    runApprove(root, ["feature-brief:meal"]);
    runApprove(root, ["feature-spec:meal"]);
    runApprove(root, ["components"]);
    const out = runApprove(root, ["--reopen-feature", "meal", "--reason", "week view lands"]);
    assert.match(out, /reopened feature "meal" as one change — reason: week view lands/);
    assert.match(out, /↺ feature-brief:meal/);
    assert.match(out, /↺ feature-spec:meal/);
    assert.match(out, /✓ components still signed \(approved @[0-9a-f]{8}\) — re-signature demanded only if it changes/);
    const cli = runApproveExpectFail(root, ["--reopen-feature", "meal"]);
    assert.match(cli.stderr, /without a reason/);
  });

  fs.rmSync(root, { recursive: true, force: true });
});
