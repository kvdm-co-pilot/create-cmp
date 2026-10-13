// INVARIANT: every Firebase config create-cmp writes as a mock carries an API
// key the Firebase SDKs accept the SHAPE of — while still saying it is a mock.
//
// The SDKs check the key's format at launch. iOS FirebaseInstallations requires
// `AIza` + 35 of [A-Za-z0-9_-]; on `MOCK-written-by-create-cmp-add-firebase-
// not-a-real-key` it throws `I-FIS008000 … FirebaseOptions.APIKey doesn't match
// the expected format`, uncaught, so every iOS app carrying the mock crashed
// before its first screen (KD-292, measured on the showcase's simulator build
// 2026-10-13; the well-formed key below ran to the onboarding screen). Android's
// FirebaseInstallations checks `A[\w-]{38}`.
//
// The test walks every file in the mock overlay, so a mock config added later
// (another platform, another SDK file) is held to the same rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MOCK_API_KEY, isOwnMock } from "../src/lib/add-firebase.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOCK_DIR = path.join(ROOT, "overlays", "firebase", "mock");

const IOS_FIS = /^AIza[0-9A-Za-z_-]{35}$/; // FIRInstallations validateAPIKey
const ANDROID_FIS = /^A[\w-]{38}$/; // com.google.firebase.installations Utils.API_KEY_FORMAT

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

/** Every API key a config file carries: google-services.json's current_key, the plist's API_KEY. */
function apiKeys(file, text) {
  if (file.endsWith(".json")) return JSON.parse(text).client.flatMap((c) => (c.api_key ?? []).map((k) => k.current_key));
  if (file.endsWith(".plist")) return [...text.matchAll(/<key>API_KEY<\/key>\s*<string>([^<]*)<\/string>/g)].map((m) => m[1]);
  return null;
}

test("the mock key matches both SDKs' formats and still says mock", () => {
  assert.match(MOCK_API_KEY, IOS_FIS);
  assert.match(MOCK_API_KEY, ANDROID_FIS);
  assert.match(MOCK_API_KEY, /MOCK/);
  assert.match(MOCK_API_KEY, /not_a_real_key/);
});

const files = walk(MOCK_DIR);
test("the mock overlay has config files to check (not vacuous)", () => {
  assert.ok(files.some((f) => f.endsWith(".json")) && files.some((f) => f.endsWith(".plist")), files.join("\n"));
});

for (const file of files) {
  const rel = path.relative(ROOT, file);
  test(`${rel}: every API key is the well-formed mock key, and the file reads as create-cmp's own mock`, () => {
    const text = fs.readFileSync(file, "utf8");
    const keys = apiKeys(file, text);
    assert.ok(keys !== null, `${rel}: a mock config of a kind this test cannot read — teach apiKeys() its key`);
    assert.ok(keys.length > 0, `${rel} carries no API key`);
    for (const k of keys) assert.equal(k, MOCK_API_KEY, `${rel}: ${k} — the SDK rejects a key of the wrong shape at launch`);
    assert.ok(isOwnMock(text), `${rel} would be read as the adopter's own config`);
  });
}
