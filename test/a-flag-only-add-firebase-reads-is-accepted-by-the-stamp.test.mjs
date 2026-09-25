// EVERY FLAG THAT ONLY `add firebase` READS IS REFUSED BY THE STAMP.
//
// Firebase left stamp-time (docs/proposals/LIBRARIES-IN-SERVICES-OUT.md, Decision 2), and the
// stamp refuses a flag that asks for it, by name, exit 2, nothing written. The list it refuses is
// hand-written in `firebaseStampFlags` (src/commands/create.mjs), while the flags `add firebase`
// reads are whatever src/commands/add.mjs reads — two spellings of one set. KNOWN_FLAGS is one set
// for every command, so a flag added to the add door is ACCEPTED by `create` and ignored there.
//
// Measured 2026-09-25 on 6bf4c53: `create-cmp app --google-services ./gs.json --yes --no-verify`
// exits 0 and stamps an app with no Firebase and no config — the line named a real Firebase config
// and the stamp threw it away without a word.
//
// THE SET IS DERIVED from add.mjs's own reads, minus the lane flags every command shares, so the
// next flag the add door grows is held here without anyone remembering this file.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { takesNoValue } from "../src/lib/args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");

/** Flags every command shares: where to work, and the verify lane's switches. Not Firebase's. */
const SHARED = new Set(["target-dir", "dry-run", "dry-run-verify", "verify", "ios"]);

function flagsAddReads() {
  const src = fs.readFileSync(path.join(ROOT, "src", "commands", "add.mjs"), "utf8");
  const names = new Set();
  for (const m of src.matchAll(/flags\["([a-z-]+)"\]/g)) names.add(m[1]);
  for (const m of src.matchAll(/flags\.([a-zA-Z]+)\b/g)) names.add(m[1]);
  for (const m of src.matchAll(/flagBool\(flags,\s*"([a-z-]+)"/g)) names.add(m[1]);
  return [...names].filter((n) => !SHARED.has(n)).sort();
}

test("the derivation finds the add door's Firebase flags (or this proves nothing)", () => {
  const found = flagsAddReads();
  for (const n of ["region", "auth", "firestore", "google-services"]) assert.ok(found.includes(n), `${n} not derived: ${found}`);
});

test("every flag only `add firebase` reads is refused by the stamp, exit 2, nothing written", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-stamp-addflag-"));
  const gs = path.join(scratch, "google-services.json");
  fs.writeFileSync(gs, JSON.stringify({ client: [{ client_info: { android_client_info: { package_name: "com.acme.demo" } } }] }));
  const valueFor = { region: "europe-west1", auth: "email", "google-services": gs };
  const accepted = [];
  try {
    for (const flag of flagsAddReads()) {
      const ask = takesNoValue(flag) ? [`--${flag}`] : [`--${flag}`, valueFor[flag] ?? "x"];
      const dir = path.join(scratch, flag);
      const r = spawnSync(
        process.execPath,
        [BIN, dir, ...ask, "--yes", "--no-verify", "--name", "Acme", "--package", "com.acme.demo"],
        { encoding: "utf8", timeout: 60000 },
      );
      if (r.status !== 2 || fs.existsSync(dir)) {
        accepted.push(`${ask.join(" ")} → exit ${r.status}, ${fs.existsSync(dir) ? "app written" : "nothing written"}`);
      }
    }
    assert.deepEqual(
      accepted,
      [],
      "a flag that asks for Firebase reached the stamp and was not refused — add it to firebaseStampFlags, " +
        "or derive that list from what `add firebase` reads:\n  " + accepted.join("\n  "),
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
