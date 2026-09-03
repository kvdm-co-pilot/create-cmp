// digest.mjs — the "what happened since you last looked" narrative reads the
// receipt and approvals ledgers WHERE THE PROJECT KEEPS THEM. Hardcoded
// qa/evidence/latest.json meant an adopter's lane runs came back as an empty
// list — which reads exactly like "no lane ran".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDigestData } from "../src/lib/digest.mjs";

function fakeGit(responses) {
  const calls = [];
  const execFileAsync = async (cmd, args) => {
    calls.push(args);
    const key = args.join(" ");
    for (const [needle, out] of responses) if (key.includes(needle)) return { stdout: out };
    return { stdout: "" };
  };
  return { calls, execFileAsync };
}

test("getDigestData: lane runs and approval events are read from the manifest's receipt and approvals paths", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-digest-"));
  try {
    fs.mkdirSync(path.join(root, "qa"), { recursive: true });
    fs.writeFileSync(path.join(root, "qa", "harness-manifest.json"), JSON.stringify({ receipt: "qa/evidence/receipt.json", approvals: "qa/ledger.json" }));
    const receipt = JSON.stringify({ schema: "pb-evidence/1", verdict: "PASS", steps: [] });
    const { calls, execFileAsync } = fakeGit([
      ["--name-status", "\x01aaaaaaa1\x002026-09-03 10:00:00 +0200\x00feat: x\nM\tservices/a.kt\n"],
      ["-- qa/evidence/receipt.json", "bbbbbbb2\x002026-09-03 09:00:00 +0200\n"],
      ["show bbbbbbb2:qa/evidence/receipt.json", receipt],
      ["-- qa/ledger.json", "ccccccc3\x002026-09-03 08:00:00 +0200\x00approve money\n"],
    ]);
    const d = await getDigestData(root, { execFileAsync });
    assert.equal(d.available, true, d.reason);
    assert.deepEqual(d.laneRuns.map((r) => [r.sha, r.verdict]), [["bbbbbbb", "PASS"]]);
    assert.deepEqual(d.approvalEvents.map((e) => e.subject), ["approve money"]);
    assert.ok(calls.some((a) => a.includes("qa/evidence/receipt.json")), "git log was asked about the declared receipt path");
    assert.ok(!calls.some((a) => a.includes("qa/evidence/latest.json")), "and never about the default");

    fs.writeFileSync(path.join(root, "qa", "harness-manifest.json"), JSON.stringify({ receipt: "/abs.json" }));
    const refused = await getDigestData(root, { execFileAsync });
    assert.equal(refused.available, false);
    assert.match(refused.reason, /malformed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
