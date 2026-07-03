import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../src/lib/schema.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "options.schema.json"), "utf8")
);

function validConfig() {
  return {
    appName: "Acme",
    package: "com.acme.app",
    iosBundleId: "com.acme.app",
    region: "us-central1",
    themePrefix: "Acme",
    platforms: { android: true, ios: true },
    firebase: { enabled: true, auth: "both", firestore: true, storage: true, functions: true, fcm: true },
    room: true,
    appium: true,
    inspector: true,
    devClient: true,
    tabs: [{ label: "Home", icon: "home" }, { label: "Profile", icon: "person" }],
    targetDir: "./acme",
  };
}

test("valid config passes", () => {
  const { valid, errors } = validate(validConfig(), schema);
  assert.equal(valid, true, JSON.stringify(errors));
});

test("region africa-south1 passes", () => {
  const c = validConfig();
  c.region = "africa-south1";
  assert.equal(validate(c, schema).valid, true);
});

test("missing required field fails", () => {
  const c = validConfig();
  delete c.appName;
  const { valid, errors } = validate(c, schema);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.path === "appName" && /required/.test(e.message)));
});

test("bad package pattern fails", () => {
  const c = validConfig();
  c.package = "Com.Acme"; // uppercase + too few segments
  assert.equal(validate(c, schema).valid, false);
});

test("android must be true (const)", () => {
  const c = validConfig();
  c.platforms.android = false;
  assert.equal(validate(c, schema).valid, false);
});

test("auth enum rejects bogus value", () => {
  const c = validConfig();
  c.firebase.auth = "magic-link";
  assert.equal(validate(c, schema).valid, false);
});

test("additionalProperties rejected", () => {
  const c = validConfig();
  c.surpriseField = 1;
  const { valid, errors } = validate(c, schema);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /not an allowed property/.test(e.message)));
});

test("empty tabs array fails minItems", () => {
  const c = validConfig();
  c.tabs = [];
  assert.equal(validate(c, schema).valid, false);
});

test("themePrefix must be PascalCase", () => {
  const c = validConfig();
  c.themePrefix = "acme";
  assert.equal(validate(c, schema).valid, false);
});

test("wrong type for room fails", () => {
  const c = validConfig();
  c.room = "yes";
  assert.equal(validate(c, schema).valid, false);
});
