// A VALUE FLAG `add firebase` READS, GIVEN NO VALUE, IS REFUSED — NEVER READ AS ITS DEFAULT.
//
// A value flag with nothing after it arrives as `true` (src/lib/args.mjs), and every read in
// src/commands/add.mjs is spelled `typeof flags.x === "string" ? flags.x : undefined` — so a BARE
// flag is the same as no flag, and the step goes on to write with the default. The bin refuses
// that shape only for `--target-dir` (DESTINATION_FLAGS).
//
// Measured 2026-09-25 on 6bf4c53, each on a fresh default stamp, `--no-verify`:
//   add firebase app --google-services   exit 0, writes a MOCK google-services.json — the line said
//                                        "use my real config" and got the one that names no project
//   add firebase app --region            exit 0, us-central1 written into FirebaseConfig.kt
//   add firebase app --auth              exit 0, auth "both" recorded
// The script shape that produces it is `--google-services $GS` with GS unset.
//
// THE SET IS DERIVED from add.mjs: every flag it reads with `typeof … === "string"`.
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

function valueFlagsAddReads() {
  const src = fs.readFileSync(path.join(ROOT, "src", "commands", "add.mjs"), "utf8");
  const names = new Set();
  for (const m of src.matchAll(/typeof flags(?:\.([a-zA-Z]+)|\["([a-z-]+)"\]) === "string"/g)) names.add(m[1] ?? m[2]);
  // `--target-dir` bare is refused at the bin already (DESTINATION_FLAGS), with its own sentence.
  names.delete("target-dir");
  return [...names].sort();
}

const snapshot = (dir) =>
  new Map(listFiles(dir).map((abs) => [path.relative(dir, abs), fs.readFileSync(abs).toString("base64")]));

test("the derivation finds the add door's value flags (or this proves nothing)", () => {
  const found = valueFlagsAddReads();
  for (const n of ["auth", "google-services", "region"]) assert.ok(found.includes(n), `${n} not derived: ${found}`);
});

test("every value flag `add firebase` reads, given bare, is refused and writes nothing", async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-add-bare-"));
  const base = path.join(scratch, "base");
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
    const wrote = [];
    for (const flag of valueFlagsAddReads()) {
      const app = path.join(scratch, flag);
      fs.cpSync(base, app, { recursive: true });
      const before = snapshot(app);
      // Last on the line, so it arrives bare — the `--google-services $GS` with GS unset shape.
      const r = spawnSync(process.execPath, [BIN, "add", "firebase", app, "--no-verify", `--${flag}`], {
        encoding: "utf8",
        timeout: 60000,
      });
      const changed = [...snapshot(app)].filter(([rel, b]) => before.get(rel) !== b).map(([rel]) => rel);
      if (r.status === 0 || changed.length) {
        wrote.push(`--${flag} (bare) → exit ${r.status}, wrote ${changed.length} file(s): ${changed.slice(0, 3).join(", ")}…`);
      }
    }
    assert.deepEqual(wrote, [], "a value flag given no value was read as its default:\n  " + wrote.join("\n  "));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
