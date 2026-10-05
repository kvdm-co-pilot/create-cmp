// A LEGACY SIDECAR AN UPGRADE SAYS IT MOVED STILL HOLDS ITS CONTENT WHERE THE UPGRADE SAID IT
// MOVED IT (KD-284 review, round 1).
//
// KD-284's heal moves a legacy `*.cmp-new` out of `res/` "never deleted" — it may hold an
// unresolved conflict, or the owner's half-done resolution — to
// `upgradeArtifactPath(<file>, "sidecar", runDir)`, and reports the destination. That is the
// SAME path `applyHarnessPlan` writes this run's own sidecar to when the same file conflicts
// again. And it does conflict again in exactly the case a legacy sidecar exists: the owner
// never resolved the last conflict, so their file still differs from the engine. The heal runs
// first, the apply second, and the second write replaces the first: the report says the legacy
// sidecar is at P, and P holds something else.
//
// The invariant: two artifacts of one run never share a path — what the run reports as moved
// is still there, byte for byte, when the run ends.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { copyDir } from "../src/lib/fsutil.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const RES_XML = "composeApp/src/androidDebug/res/xml/debug_network_security_config.xml";
const LEGACY = "<!-- the owner's half-done resolution of the LAST upgrade's conflict -->\n";

const CONFIG = {
  appName: "Acme",
  package: "com.acme.demo",
  iosBundleId: "com.acme.demo",
  themePrefix: "Acme",
  platforms: { android: true, ios: false },
  room: true,
  e2e: true,
  inspector: true,
  devClient: true,
  tabs: [{ label: "Home", icon: "home" }],
};

const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", timeout: 180000 });
const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });

let scratch;
let app;
let run;

before(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-kd284-review-moved-"));
  // Base: the res/ file without the engine's new `localhost` line.
  const legacy = path.join(scratch, "legacy-template");
  copyDir(path.join(ROOT, "template"), legacy);
  const xml = path.join(legacy, RES_XML);
  fs.writeFileSync(xml, fs.readFileSync(xml, "utf8").replace(/\s*<domain includeSubdomains="true">localhost<\/domain>/, ""));
  app = path.join(scratch, "app");
  await offTheRunnerChannel(() => scaffold({ ...CONFIG, targetDir: app }, { templateDir: legacy, verify: false }));
  // The owner edited the very line the engine's change sits beside, so this upgrade conflicts
  // on the res/ file — as the earlier one did, which is why its sidecar is still there.
  const appXml = path.join(app, RES_XML);
  fs.writeFileSync(appXml, fs.readFileSync(appXml, "utf8").replace("10.0.2.2", "10.0.3.2"));
  for (const args of [["init", "-q"], ["add", "-A"], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "stamp"]]) {
    assert.equal(git(app, ...args).status, 0, `git ${args.join(" ")}`);
  }
  fs.writeFileSync(`${appXml}.cmp-new`, LEGACY);
  run = cli("upgrade", "--harness", "--target-dir", app, "--base-dir", legacy, "--yes");
});

after(() => {
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

test("the legacy res/ sidecar's content is where the upgrade reports it moved it", () => {
  const out = `${run.stdout}\n${run.stderr}`;
  // Fixture check: the run must conflict on the res/ file, or this test proves nothing.
  assert.match(out, new RegExp(`conflict on ${RES_XML.replace(/[.]/g, "\\.")}`), `fixture: the upgrade did not conflict on ${RES_XML}:\n${out}`);
  const moved = out.match(new RegExp(`${RES_XML.replace(/[.]/g, "\\.")}\\.cmp-new → (\\S+)`));
  assert.ok(moved, `the upgrade never reported moving the legacy sidecar:\n${out}`);
  const dest = path.join(app, moved[1]);
  assert.ok(fs.existsSync(dest), `the reported destination ${moved[1]} does not exist`);
  assert.equal(
    fs.readFileSync(dest, "utf8"),
    LEGACY,
    `the upgrade reported moving the legacy sidecar to ${moved[1]}, then wrote this run's own sidecar over it — the owner's content is gone`,
  );
});
