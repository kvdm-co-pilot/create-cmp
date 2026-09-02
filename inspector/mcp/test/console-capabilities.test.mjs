// evidence-economics S2 — the console opens on qa/ alone.
//
// The console used to refuse any project without composeApp/. But Drive, walks,
// approvals, evidence, comments, the chain and the retrospective derive from
// qa/ alone; only Screens, preview and the live device need a Compose app.
// payment-blueprint ran a fifteen-phase programme under the full governance
// stack with no window at all — its window was welded to the pixels.
//
// Capability, not gate: REAL fixtures, a REAL service, real HTTP.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createPreviewService, detectCapabilities } from "../src/lib/preview-service.mjs";

function fixture(name, { qa, composeApp }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cmp-cap-${name}-`));
  if (qa) {
    fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
    fs.writeFileSync(path.join(root, "qa", "approvals.json"), JSON.stringify({ schema: "cmp-approvals/1", artifacts: [] }));
  }
  if (composeApp) {
    fs.mkdirSync(path.join(root, "composeApp", "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "composeApp", "build.gradle.kts"), 'android {\n  namespace = "com.acme.demo"\n}\n');
  }
  return root;
}

test("detectCapabilities: qa/ is the window, composeApp/ is the pixels, each independent of the other", () => {
  assert.deepEqual(detectCapabilities(fixture("both", { qa: true, composeApp: true })), { governance: true, screens: true });
  assert.deepEqual(detectCapabilities(fixture("gov", { qa: true, composeApp: false })), { governance: true, screens: false });
  assert.deepEqual(detectCapabilities(fixture("none", { qa: false, composeApp: false })), { governance: false, screens: false });
});

test("a governance-only project (qa/, no composeApp/) gets its window: Drive and Approvals serve; Screens and Live device are absent, and the rail says why", async () => {
  const projectDir = fixture("blueprint", { qa: true, composeApp: false });
  const service = createPreviewService({ projectDir, port: 19931, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    assert.deepEqual(st.capabilities, { governance: true, screens: false }, "start() reports what it can show");
    const status = await (await fetch(`${st.url}status`)).json();
    assert.equal(status.capabilities.screens, false, "/status carries it for every consumer");
    const page = await (await fetch(st.url)).text();
    assert.match(page, /id="tab-overview"/, "Drive is served");
    assert.match(page, /id="tab-approvals"/, "Approvals is served");
    assert.match(page, /id="tab-evidence"/, "Evidence is served");
    assert.match(page, /id="tab-comments"/, "Comments is served");
    assert.doesNotMatch(page, /id="tab-screens"/, "Screens is absent — not empty, absent");
    assert.doesNotMatch(page, /id="tab-live-device"/, "Live device is absent");
    assert.match(page, /governance only &middot; no Compose app/, "and the rail says so, once, quietly");
  } finally {
    service.stop();
  }
});

test("a Compose app is unchanged: every section, screens included, and no capability note", async () => {
  const projectDir = fixture("cmp", { qa: true, composeApp: true });
  const service = createPreviewService({ projectDir, port: 19932, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    assert.deepEqual(st.capabilities, { governance: true, screens: true });
    const page = await (await fetch(st.url)).text();
    assert.match(page, /id="tab-screens"/);
    assert.match(page, /id="tab-live-device"/);
    assert.doesNotMatch(page, /governance only/);
  } finally {
    service.stop();
  }
});

test("PLANTED: a directory with neither qa/ nor composeApp/ is still refused — the gate moved, it did not vanish", async () => {
  const projectDir = fixture("nothing", { qa: false, composeApp: false });
  const service = createPreviewService({ projectDir, port: 19933, hot: false, runRender: async () => {} });
  await assert.rejects(() => service.start(), /neither qa\/ .* nor composeApp\//);
});
