// qa/lib/profile-loader.mjs — load the profile the manifest names, never by name.
//
// Every failure is a refusal by name and none of them fall back to anything:
// the runner would rather not start than start as the wrong kind of project.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  PROFILE_PROTOCOL,
  PROFILES_DIR_REL,
  REQUIRED_EXPORTS,
  loadProfile,
  profileEntryRel,
  validateProfileModule,
} from "../packages/harness/src/lib/profile-loader.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "cmp-profile-"));
function install(root, id, source) {
  const dir = path.join(root, ...PROFILES_DIR_REL.split("/"), id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.mjs"), source);
}
const GOOD = (id) => `export const id = ${JSON.stringify(id)};\nexport const protocol = ${PROFILE_PROTOCOL};\nexport function steps(ctx) { return { ctx, stepsForProfile: {} }; }\n`;

// ── The pure judge ───────────────────────────────────────────────────────────

test("a module with id, protocol and steps(ctx) passes", () => {
  assert.deepEqual(validateProfileModule({ id: "cmp", protocol: PROFILE_PROTOCOL, steps: () => ({}) }, "cmp"), { ok: true });
});

test("missing exports are named, all at once", () => {
  const v = validateProfileModule({ id: "cmp" }, "cmp");
  assert.equal(v.ok, false);
  assert.match(v.reason, /missing required export\(s\): protocol, steps/);
  assert.match(v.reason, new RegExp(REQUIRED_EXPORTS.join(", ")));
});

test("the manifest and the profile must agree about what this project is", () => {
  const v = validateProfileModule({ id: "ktor-backend", protocol: PROFILE_PROTOCOL, steps: () => ({}) }, "cmp");
  assert.equal(v.ok, false);
  assert.match(v.reason, /exports id "ktor-backend"/);
  assert.match(v.reason, /disagree/);
});

test("a protocol the lane does not speak is refused with the upgrade command", () => {
  const v = validateProfileModule({ id: "cmp", protocol: PROFILE_PROTOCOL + 1, steps: () => ({}) }, "cmp");
  assert.equal(v.ok, false);
  assert.match(v.reason, new RegExp(`speaks ${PROFILE_PROTOCOL}`));
  assert.match(v.reason, /upgrade --harness/);
});

test("steps must be a function", () => {
  const v = validateProfileModule({ id: "cmp", protocol: PROFILE_PROTOCOL, steps: {} }, "cmp");
  assert.equal(v.ok, false);
  assert.match(v.reason, /steps\(ctx\) as a function/);
});

// ── Loading from disk ────────────────────────────────────────────────────────

test("loads the profile the manifest names and hands back its module", async () => {
  const root = tmp();
  install(root, "ktor-backend", GOOD("ktor-backend"));
  const r = await loadProfile(root, { id: "ktor-backend" });
  assert.equal(r.ok, true);
  assert.equal(r.entryRel, profileEntryRel("ktor-backend"));
  assert.equal(r.profile.id, "ktor-backend");
  assert.equal(typeof r.profile.steps, "function");
  assert.deepEqual(r.profile.steps({ a: 1 }).ctx, { a: 1 });
});

test("a missing profile is refused naming the path, and lists what IS installed", async () => {
  const root = tmp();
  install(root, "cmp", GOOD("cmp"));
  const r = await loadProfile(root, { id: "ktor-backend" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /names profile "ktor-backend"/);
  assert.match(r.reason, /qa\/lib\/profiles\/ktor-backend\/index\.mjs does not exist/);
  assert.match(r.reason, /profiles present: cmp/);
});

test("no profiles directory at all says so", async () => {
  const r = await loadProfile(tmp(), { id: "cmp" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no profiles are installed/);
});

test("an unsafe id never reaches the filesystem", async () => {
  for (const id of ["../cmp", "Cmp", "", undefined, "a b"]) {
    const r = await loadProfile(tmp(), { id });
    assert.equal(r.ok, false, `${JSON.stringify(id)} must be refused`);
    assert.match(r.reason, /not a valid profile name/);
  }
});

test("a profile that throws on import is a named load failure, not a crash", async () => {
  const root = tmp();
  install(root, "broken", "throw new Error('boom at import');\n");
  const r = await loadProfile(root, { id: "broken" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /failed to load/);
  assert.match(r.reason, /boom at import/);
});

test("a loaded module still has to pass the judge — id mismatch on disk is refused", async () => {
  const root = tmp();
  install(root, "cmp", GOOD("not-cmp"));
  const r = await loadProfile(root, { id: "cmp" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /disagree/);
});
