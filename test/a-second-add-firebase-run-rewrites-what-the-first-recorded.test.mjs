// A SECOND `add firebase` RUN WRITES NOTHING — WHATEVER THE FIRST RUN WAS GIVEN.
//
// The step's contract (src/lib/add-firebase.mjs header, docs/USAGE.md, cmp-firebase-connect): "a
// second run writes nothing". test/add-firebase.test.mjs pins it for ONE first run — the bare one,
// which writes the mock. The record the step writes is derived from what the TREE holds on the
// second run, not from what the first run recorded, so any first-run choice the tree cannot
// reproduce is rewritten by a plain re-run.
//
// Measured 2026-09-25 on 6bf4c53: `add firebase app --google-services real.json`, then
// `add firebase app` → "edit create-cmp.json", firebase.config "provided" → "existing". The same
// config, the same app, a byte changed — and the lane's view of the record moved with it.
//
// THE INVARIANT, over every first-run choice the door takes: first run with it, then a plain second
// run and a repeat of the same line — neither writes a byte.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { listFiles } from "../src/lib/fsutil.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");

const snapshot = (dir) =>
  new Map(listFiles(dir).map((abs) => [path.relative(dir, abs), fs.readFileSync(abs).toString("base64")]));
const changedFiles = (before, dir) => {
  const after = snapshot(dir);
  const rels = new Set([...before.keys(), ...after.keys()]);
  return [...rels].filter((rel) => before.get(rel) !== after.get(rel));
};
const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", timeout: 60000 });

test("after any first run, a plain re-run and a repeat of the same line write nothing", async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-add-twice-"));
  const base = path.join(scratch, "base");
  const gs = path.join(scratch, "real-google-services.json");
  fs.writeFileSync(
    gs,
    JSON.stringify({
      project_info: { project_number: "123", project_id: "acme-prod" },
      client: [{ client_info: { mobilesdk_app_id: "1:123:android:abc", android_client_info: { package_name: "com.acme.demo" } } }],
      configuration_version: "1",
    }),
  );
  const FIRST_RUNS = [
    [],
    ["--google-services", gs],
    ["--region", "europe-west1"],
    ["--auth", "email"],
    ["--no-firestore", "--no-fcm"],
  ];
  try {
    await offTheRunnerChannel(() =>
      scaffold(
        {
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
          targetDir: base,
        },
        { verify: false },
      ),
    );
    const moved = [];
    FIRST_RUNS.forEach((first, i) => {
      const app = path.join(scratch, `app${i}`);
      fs.cpSync(base, app, { recursive: true });
      const r1 = cli("add", "firebase", app, "--no-verify", ...first);
      assert.equal(r1.status, 0, `first run ${first.join(" ")}:\n${r1.stdout}${r1.stderr}`);
      for (const second of [[], first]) {
        const before = snapshot(app);
        const r2 = cli("add", "firebase", app, "--no-verify", ...second);
        const changed = changedFiles(before, app);
        if (r2.status !== 0 || changed.length) {
          moved.push(
            `first [${first.join(" ") || "no flags"}] then [${second.join(" ") || "no flags"}] → exit ${r2.status}, ` +
              `wrote ${changed.join(", ") || "nothing"}`,
          );
        }
      }
    });
    assert.deepEqual(moved, [], "a second run wrote a byte:\n  " + moved.join("\n  "));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
