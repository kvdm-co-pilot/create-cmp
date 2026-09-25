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
    themePrefix: "Acme",
    platforms: { android: true, ios: true },
    room: true,
    e2e: true,
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

test("firebase and region are not config any more — they left with Firebase, for `create-cmp add firebase`", () => {
  // The engine refuses them BY NAME before the schema is consulted (validateConfig); the schema
  // itself no longer declares them, so nothing requires them and nothing can pass them through.
  assert.ok(!("firebase" in schema.properties) && !("region" in schema.properties));
  assert.ok(!schema.required.includes("firebase") && !schema.required.includes("region"));
  for (const [key, value] of [["firebase", { enabled: true }], ["region", "africa-south1"]]) {
    const c = validConfig();
    c[key] = value;
    const { valid, errors } = validate(c, schema);
    assert.equal(valid, false, `${key} must not validate`);
    assert.ok(errors.some((e) => e.path === key && /not an allowed property/.test(e.message)));
  }
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
