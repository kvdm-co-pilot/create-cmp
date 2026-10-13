// INVARIANT: after `create-cmp add firebase` runs on an app, no Firebase config that the step
// recognises as ITS OWN mock (`isOwnMock`) still carries an API key the SDKs reject at launch.
//
// KD-292 fixed the mock the step WRITES. It did not reach the mock an app already CARRIES: every
// app that ran `add firebase` before 0.28.12 holds `MOCK-written-by-create-cmp-add-firebase-not-a-
// real-key`, which FirebaseInstallations rejects with I-FIS008000, uncaught — the iOS app dies before
// its first screen. The CHANGELOG tells that adopter to "replace it with `create-cmp add firebase
// --google-services <path>`", and that run replaces google-services.json only: the plist — the file
// that crashes — is reported "already there" and kept. A plain re-run keeps both. `upgrade` excludes
// both config files from its sweep. So no command reaches the crash the closure says is closed.
//
// Read per mock file the overlay ships (a new mock file is covered without editing this test), and
// per remedy an adopter would run: the plain re-run, and the one the CHANGELOG names.
// (KD-285 slice review round 2.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { LEGACY_MOCK_TELL, MOCK_API_KEY, isOwnMock } from "../src/lib/add-firebase.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const MOCK_DIR = path.join(ROOT, "overlays", "firebase", "mock");
const LEGACY_KEY = `${LEGACY_MOCK_TELL}-not-a-real-key`; // what every mock carried before 0.28.12
const SDK_KEY_SHAPE = /^AIza[0-9A-Za-z_-]{35}$/; // FIRInstallations validateAPIKey (the stricter of the two)

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const MOCK_RELS = walk(MOCK_DIR).map((f) => path.relative(MOCK_DIR, f));

function apiKeys(rel, text) {
  if (rel.endsWith(".json")) return JSON.parse(text).client.flatMap((c) => (c.api_key ?? []).map((k) => k.current_key));
  if (rel.endsWith(".plist")) return [...text.matchAll(/<key>API_KEY<\/key>\s*<string>([^<]*)<\/string>/g)].map((m) => m[1]);
  throw new Error(`${rel}: a mock config of a kind this test cannot read — teach apiKeys() its key`);
}

async function stampWithLegacyMock() {
  const app = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-legacy-mock-")), "app");
  await offTheRunnerChannel(() =>
    scaffold(
      {
        appName: "Acme",
        package: "com.acme.demo",
        iosBundleId: "com.acme.demo.ios",
        themePrefix: "Acme",
        platforms: { android: true, ios: true },
        room: true,
        e2e: true,
        inspector: true,
        devClient: true,
        tabs: [{ label: "Home", icon: "home" }],
        targetDir: app,
      },
      { verify: false },
    ),
  );
  const first = cli("add", "firebase", app, "--no-verify");
  assert.equal(first.status, 0, first.stderr + first.stdout);
  // Put the app back where a pre-0.28.12 `add firebase` left it: every mock carries the old key.
  for (const rel of MOCK_RELS) {
    const abs = path.join(app, rel);
    assert.ok(fs.existsSync(abs), `${rel}: add firebase wrote no such mock into an iOS-carrying app`);
    fs.writeFileSync(abs, fs.readFileSync(abs, "utf8").split(MOCK_API_KEY).join(LEGACY_KEY));
  }
  return app;
}

const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", timeout: 60000 });

const REMEDIES = [
  { name: "a plain re-run of `create-cmp add firebase`", args: () => [] },
  {
    name: "the CHANGELOG's remedy, `create-cmp add firebase --google-services <path>`",
    args: (scratch) => {
      const real = path.join(scratch, "google-services.json");
      fs.writeFileSync(
        real,
        JSON.stringify({
          project_info: { project_number: "123", project_id: "acme-prod" },
          client: [{ client_info: { mobilesdk_app_id: "1:123:android:abc", android_client_info: { package_name: "com.acme.demo" } }, api_key: [{ current_key: "AIzaSyREAL_looking_key_0000000000000000" }] }],
          configuration_version: "1",
        }),
      );
      return ["--google-services", real];
    },
  },
];

test("the overlay ships mock configs to check (not vacuous)", () => {
  assert.ok(MOCK_RELS.some((r) => r.endsWith(".json")) && MOCK_RELS.some((r) => r.endsWith(".plist")), MOCK_RELS.join("\n"));
});

for (const remedy of REMEDIES) {
  test(`after ${remedy.name} on an app carrying the pre-0.28.12 mock, no own mock carries a key the SDK rejects at launch`, async () => {
    const app = await stampWithLegacyMock();
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-legacy-mock-src-"));
    try {
      const r = cli("add", "firebase", app, "--no-verify", ...remedy.args(scratch));
      assert.equal(r.status, 0, r.stderr + r.stdout);
      for (const rel of MOCK_RELS) {
        const text = fs.readFileSync(path.join(app, rel), "utf8");
        if (!isOwnMock(text)) continue; // replaced by the adopter's config — not a mock any more
        for (const k of apiKeys(rel, text)) {
          assert.match(
            k,
            SDK_KEY_SHAPE,
            `${rel} is still create-cmp's own mock and still carries "${k}" — the key FirebaseInstallations rejects at launch (KD-292), left in place by ${remedy.name}`,
          );
        }
      }
    } finally {
      fs.rmSync(path.dirname(app), { recursive: true, force: true });
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });
}
