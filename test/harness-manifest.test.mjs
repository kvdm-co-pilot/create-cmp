// qa/lib/harness-manifest.mjs — the lane's own reader of qa/harness-manifest.json.
//
// Decision 3 (2026-09-04): there is no default profile. An absent manifest is a
// refusal that names the command which writes one — different for a stamped
// app and a foreign repo — and a malformed one is refused naming every problem.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  MANIFEST_REL_PATH,
  MANIFEST_SCHEMA,
  PROFILE_ID_RE,
  absentManifestReason,
  manifestFor,
  manifestProblems,
  resolveHarnessManifest,
  writeHarnessManifest,
} from "../packages/harness/src/lib/harness-manifest.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "cmp-manifest-"));
const put = (root, obj) => {
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  fs.writeFileSync(path.join(root, ...MANIFEST_REL_PATH.split("/")), typeof obj === "string" ? obj : JSON.stringify(obj));
};

// ── Absent: refused, and told how ────────────────────────────────────────────

test("an absent manifest is refused — and a foreign repo is sent to a command that can serve it", () => {
  const root = tmp();
  const r = resolveHarnessManifest(root);
  assert.equal(r.ok, false);
  assert.equal(r.absent, true);
  assert.match(r.reason, /is missing/);
  assert.match(r.reason, /there is no default/);
  assert.match(r.reason, /create-cmp harness init/);
  // NOT attach. This refusal used to name it, and attach refuses any repo
  // without a Compose or KMP plugin signal — so the one documented exit from
  // this refusal was closed to precisely the repos it was written for. A Ktor
  // backend hit that loop on 2026-09-04 and could only escape by reading the
  // engine's source. A refusal that names an unusable remedy is worse than one
  // that names none: it costs the reader the time to find out.
  assert.doesNotMatch(r.reason, /create-cmp attach/);
  assert.doesNotMatch(r.reason, /upgrade --harness/);
});

test("an absent manifest in a STAMPED app is sent to upgrade --harness, which derives it", () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, "create-cmp.json"), "{}");
  const reason = absentManifestReason(root);
  assert.match(reason, /create-cmp app/);
  assert.match(reason, /upgrade --harness/);
  assert.doesNotMatch(reason, /attach/);
});

// ── Present: the contract ────────────────────────────────────────────────────

test("the stamped template manifest is valid, and names cmp", () => {
  const shipped = JSON.parse(fs.readFileSync(new URL("../template/qa/harness-manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifestProblems(shipped), []);
  assert.equal(shipped.schema, MANIFEST_SCHEMA);
  assert.equal(shipped.profile.id, "cmp");
});

test("profile is the one REQUIRED field, and the refusal says how to add it", () => {
  const problems = manifestProblems({ schema: MANIFEST_SCHEMA, specs: "specs" });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /profile is required/);
  assert.match(problems[0], /"profile": \{ "id": "<profile>" \}/);
});

test("profile.id is one safe directory segment — it becomes a path", () => {
  for (const bad of ["", "Cmp", "../x", "a/b", "1cmp", "c m p", null, 7]) {
    const p = manifestProblems({ profile: { id: bad } });
    assert.ok(p.some((s) => /profile\.id must match/.test(s)), `${JSON.stringify(bad)} must be refused`);
  }
  for (const good of ["cmp", "ktor-backend", "a1"]) {
    assert.ok(PROFILE_ID_RE.test(good));
    assert.deepEqual(manifestProblems({ profile: { id: good } }), []);
  }
});

test("profile refuses unknown keys and a non-string version; schema must look like harness-manifest/<n>", () => {
  assert.ok(manifestProblems({ profile: { id: "cmp", extra: 1 } }).some((s) => /unknown field "extra"/.test(s)));
  assert.ok(manifestProblems({ profile: { id: "cmp", version: 2 } }).some((s) => /version must be a string/.test(s)));
  assert.ok(manifestProblems({ profile: { id: "cmp" }, schema: "nope/1" }).some((s) => /schema must be/.test(s)));
  assert.deepEqual(manifestProblems({ profile: { id: "cmp", version: "0.19.0" }, schema: "harness-manifest/2" }), []);
});

test("layout fields keep the console reader's contract — relative, posix, inside the root", () => {
  const p = manifestProblems({ profile: { id: "cmp" }, receipt: "/abs", specs: "a\\b", approvals: "../out", citationRoots: [] });
  assert.ok(p.some((s) => /receipt must be relative/.test(s)));
  assert.ok(p.some((s) => /specs must use/.test(s)));
  assert.ok(p.some((s) => /approvals may not escape/.test(s)));
  assert.ok(p.some((s) => /citationRoots must be a non-empty array/.test(s)));
});

test("an unknown top-level field is refused by name — a typo must not silently do nothing", () => {
  const p = manifestProblems({ profile: { id: "cmp" }, citationRoot: ["x"] });
  assert.ok(p.some((s) => /unknown field "citationRoot"/.test(s)));
});

test("a present-but-malformed manifest is refused with EVERY problem, never defaulted", () => {
  const root = tmp();
  put(root, { schema: 3, profile: { id: "Bad" }, receipt: "/abs" });
  const r = resolveHarnessManifest(root);
  assert.equal(r.ok, false);
  assert.equal(r.absent, false);
  assert.match(r.reason, /schema must be/);
  assert.match(r.reason, /profile\.id must match/);
  assert.match(r.reason, /receipt must be relative/);
  assert.match(r.reason, /no layout is assumed while a manifest is present/);
});

test("invalid JSON is its own refusal", () => {
  const root = tmp();
  put(root, "{ not json");
  const r = resolveHarnessManifest(root);
  assert.equal(r.ok, false);
  assert.equal(r.absent, false);
  assert.match(r.reason, /not valid JSON/);
});

test("a valid manifest resolves with its parsed content", () => {
  const root = tmp();
  put(root, manifestFor("ktor-backend", { specs: "docs/specs", citationRoots: ["backend"] }));
  const r = resolveHarnessManifest(root);
  assert.equal(r.ok, true);
  assert.equal(r.manifest.profile.id, "ktor-backend");
  assert.equal(r.manifest.specs, "docs/specs");
  assert.equal(r.manifest.schema, MANIFEST_SCHEMA);
});

// ── Writing ──────────────────────────────────────────────────────────────────

test("writeHarnessManifest refuses an invalid manifest rather than handing the next lane a refusal it made", () => {
  const root = tmp();
  const r = writeHarnessManifest(root, { profile: { id: "../x" } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /refusing to write an invalid manifest/);
  assert.ok(!fs.existsSync(path.join(root, ...MANIFEST_REL_PATH.split("/"))));
});

test("writeHarnessManifest round-trips through resolveHarnessManifest", () => {
  const root = tmp();
  const w = writeHarnessManifest(root, manifestFor("cmp"));
  assert.equal(w.ok, true);
  assert.equal(w.relPath, MANIFEST_REL_PATH);
  const r = resolveHarnessManifest(root);
  assert.equal(r.ok, true);
  assert.deepEqual(r.manifest, { schema: MANIFEST_SCHEMA, profile: { id: "cmp" } });
});
