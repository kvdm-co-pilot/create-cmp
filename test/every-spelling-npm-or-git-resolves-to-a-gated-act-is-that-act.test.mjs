// The argv reader in scripts/hooks/proof-gate.mjs (slice 5, B-3) claims — in its
// own comment on `act` and in docs/GATE-RULES.md — that a push of ANY ref to
// `main` is judged as the merge it is, and that the publish refusal holds
// "however the command is spelled". The EVADING fixtures in
// test/proof-gate-hook.test.mjs pin fourteen instances; this file pins the
// CLASS, generated from what the programs themselves accept, so the next
// spelling one flag over is not the next review's finding.
//
//   1. npm resolves a unique command prefix (`npm pu`, `npm publ`) to `publish`
//      — executed with `npm <prefix> --dry-run` on npm 11, 2026-09-29.
//   2. npm reads a value-taking config flag anywhere, so `npm --tag next publish`
//      publishes. The gate ALREADY declares which npm flags take a value —
//      NPM_TAKES_VALUE, read by commandCwd — and the argv reader keeps a second
//      list (NPM_VALUE) that omits --tag, --otp and --access: two readers of one
//      declaration, answering differently. Every flag in the first list is read
//      from the source, so the two cannot drift apart again unnoticed.
//   3. A refspec with no colon names its own destination: `git push origin main`
//      is `main:main`, and lands on trunk exactly like `HEAD:main`.
//   4. `--repo=<remote>` names the remote, so the first operand is a refspec.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "../scripts/hooks/proof-gate.mjs";

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/hooks/proof-gate.mjs");

test("every spelling npm resolves to publish — a unique prefix, or a value-taking flag the gate itself declares in front of it — is classified publish", () => {
  const src = fs.readFileSync(GATE, "utf8");
  const declared = /const NPM_TAKES_VALUE = new Set\((\[[^\]]*\])\)/.exec(src);
  assert.ok(declared, "NPM_TAKES_VALUE is where the gate declares which npm flags take a value");
  const valueFlags = JSON.parse(declared[1]);
  const spellings = [
    ...["pu", "pub", "publ", "publi"].map((p) => `npm ${p}`),
    ...valueFlags.map((f) => `npm ${f} x publish`),
  ];
  const missed = spellings.filter((c) => classify(c) !== "publish");
  assert.deepEqual(missed, [], `${missed.length} spelling(s) npm runs as publish walk past the gate as no gated act at all`);
});

test("every push whose destination is main is classified merge — including a refspec with no colon, and a remote named by --repo=", () => {
  const spellings = [
    "git push origin main",
    "git push origin +main",
    "git push origin refs/heads/main",
    "git push -f origin main",
    "git push --repo=origin HEAD:main",
  ];
  const missed = spellings.filter((c) => classify(c) !== "merge");
  assert.deepEqual(missed, [], `${missed.length} push(es) onto trunk walk past the merge refusal`);
});
