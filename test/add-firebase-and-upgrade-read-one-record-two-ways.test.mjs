// ONE RECORD, TWO READERS: WHAT `upgrade --harness` REPRODUCES FROM create-cmp.json IS WHAT
// `add firebase` READS BACK FROM IT.
//
// An app's Firebase choices are read from its record by two functions in two files:
//   firebaseFromSpecRecord (src/lib/harness-upgrade.mjs)  region = firebase.region ?? record.region
//   firebaseOptions via planAddFirebase (src/lib/add-firebase.mjs)  region = firebase.region only
// create-cmp 0.27 and earlier recorded the region at the TOP level. So for an app stamped with
// Firebase and a non-default region, the upgrade builds its tree with that region — and the add
// step, reading the same record, wants us-central1 and refuses its own FirebaseConfig.kt.
//
// Measured 2026-09-25 on 6bf4c53 against a REAL 0.27.2 stamp (origin/main's engine,
// `--region europe-west2`): `upgrade --harness --base-dir <0.27.2 template> --yes` exits 0 and
// leaves FIREBASE_FUNCTIONS_REGION = "europe-west2"; `add firebase` on that app then refuses —
// "FirebaseConfig.kt already exists, and its bytes are not the ones this step writes … delete it
// if it is left over from an earlier attempt" — and so does `add firebase --google-services`,
// which is the step cmp-firebase-connect §3b tells that adopter to run for their real config.
//
// THE INVARIANT, over every record shape an app can carry: build the tree the way upgrade builds
// NEW (the default stamp plus the add step, given firebaseFromSpecRecord's reading), keep the
// record as the app keeps it, and the add step must re-read the same choices — no refusal, and
// nothing to write but (at most) the record itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { scaffold } from "../src/scaffold.mjs";
import { planAddFirebase, applyAddFirebasePlan } from "../src/lib/add-firebase.mjs";
import { firebaseFromSpecRecord } from "../src/lib/harness-upgrade.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const SERVICES = { auth: "email", firestore: true, storage: false, functions: true, fcm: true };

/** The record shapes an app with Firebase can carry, keyed by where they come from. */
const SHAPES = {
  "0.27 stamp, region at the top level": { region: "europe-west2", firebase: { enabled: true, ...SERVICES } },
  "0.27 stamp, default region": { region: "us-central1", firebase: { enabled: true, ...SERVICES } },
  "add step, region under firebase": { firebase: { enabled: true, region: "asia-east1", ...SERVICES, config: "mock" } },
  "0.27 --no-firebase stamp that then ran add": {
    region: "us-central1",
    firebase: { enabled: true, region: "europe-west1", ...SERVICES, config: "mock" },
  },
};

test("the add step reads back from a record exactly what upgrade reproduced from it", async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-fb-two-readers-"));
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
    const stamped = JSON.parse(fs.readFileSync(path.join(base, "create-cmp.json"), "utf8"));
    const disagree = [];
    for (const [name, shape] of Object.entries(SHAPES)) {
      const app = path.join(scratch, name.replace(/\W+/g, "-"));
      fs.cpSync(base, app, { recursive: true });
      const record = { ...stamped, ...shape };
      const upgradeReads = firebaseFromSpecRecord(record);
      assert.ok(upgradeReads, `${name}: upgrade reads Firebase on (or this row proves nothing)`);
      // NEW, as runHarnessUpgrade builds it: the default stamp plus the add step, given upgrade's reading.
      applyAddFirebasePlan(app, planAddFirebase(app, upgradeReads));
      // …and the record as the app keeps it: upgrade --harness never rewrites it.
      fs.writeFileSync(path.join(app, "create-cmp.json"), `${JSON.stringify(record, null, 2)}\n`);

      let plan;
      try {
        plan = planAddFirebase(app, {});
      } catch (e) {
        disagree.push(`${name}: add firebase refused — ${e.message.split("\n")[0]}`);
        continue;
      }
      for (const [k, v] of Object.entries(upgradeReads)) {
        if (plan.options[k] !== v) disagree.push(`${name}: ${k} — upgrade read ${JSON.stringify(v)}, add read ${JSON.stringify(plan.options[k])}`);
      }
      const others = plan.writes.map((w) => w.rel).filter((rel) => rel !== "create-cmp.json");
      if (others.length) disagree.push(`${name}: add would write ${others.join(", ")}`);
    }
    assert.deepEqual(disagree, [], "the two readers of one record disagree:\n  " + disagree.join("\n  "));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
