// WHICH SECTIONS a console has is the project's to declare, not the console's
// to assume.
//
// Before this, one boolean decided it — `capabilities.screens`, meaning "is
// there a composeApp/". One bit, chosen once, for every stack there will ever
// be. It answered well for the two cases it knew and had no way to express a
// third, so a service with no UI was shown a Design language tab: the console
// being honest about its own defaults rather than about the project.
import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryHtml } from "../inspector/mcp/src/lib/preview-service.mjs";

const BASE = { appName: "P", viewport: { width: 411, height: 891 }, version: 1, cards: [] };
const ids = (extra = {}) =>
  galleryHtml({ ...BASE, ...extra })
    .split(/<section id="tab-/)
    .slice(1)
    .map((p) => p.slice(0, p.indexOf('"')));

test("a declared list is honoured exactly, in the order declared", () => {
  assert.deepEqual(ids({ sections: ["evidence", "overview", "specs"] }), ["evidence", "overview", "specs"]);
  assert.deepEqual(ids({ sections: ["overview"] }), ["overview"]);
});

test("an id this console does not know is dropped, never invented", () => {
  // A rail entry leading to an empty panel is the dishonesty this whole
  // mechanism exists to prevent, so an unknown declaration is a no-op rather
  // than a blank tab.
  assert.deepEqual(ids({ sections: ["overview", "telemetry", "evidence"] }), ["overview", "evidence"]);
});

test("declaring nothing changes nothing — a Compose app renders as it always did", () => {
  const undeclared = ids({ capabilities: { governance: true, screens: true } });
  assert.equal(undeclared.length, 13, "the shipped console is unchanged");
  for (const s of ["overview", "screens", "design-system", "live-device", "evidence"]) {
    assert.ok(undeclared.includes(s), `${s} still renders for a Compose app`);
  }
  assert.deepEqual(ids({ sections: [], capabilities: { governance: true, screens: true } }), undeclared, "an empty declaration is not a declaration");
});

test("a project with no Compose app is not shown Compose's furniture", () => {
  const backend = ids({ capabilities: { governance: true, screens: false } });
  for (const s of ["screens", "live-device", "design-system"]) {
    assert.ok(!backend.includes(s), `${s} needs a Compose app and must be absent, not empty`);
  }
  for (const s of ["overview", "specs", "evidence", "approvals", "comments"]) {
    assert.ok(backend.includes(s), `${s} is stack-free governance and must stay`);
  }
});

test("a declaration outranks the capability default, and capability still subtracts", () => {
  // Declaration says what the project HAS; capability says what can be SHOWN.
  // A project may declare Screens and still have no app to render — that stays
  // an absence with a stated reason rather than a contradiction.
  assert.deepEqual(ids({ sections: ["overview", "screens"], capabilities: { governance: true, screens: false } }), ["overview"]);
  assert.deepEqual(ids({ sections: ["overview", "screens"], capabilities: { governance: true, screens: true } }), ["overview", "screens"]);
});

test("every rendered panel says something — no section goes silently empty", () => {
  // The honesty floor Stage 0.5's gate enforces, pinned in the suite so it
  // cannot regress between gate runs.
  for (const caps of [{ governance: true, screens: true }, { governance: true, screens: false }]) {
    const html = galleryHtml({ ...BASE, capabilities: caps });
    for (const part of html.split(/<section id="tab-/).slice(1)) {
      const id = part.slice(0, part.indexOf('"'));
      const end = part.indexOf("</section>");
      const text = part.slice(part.indexOf(">") + 1, end < 0 ? part.length : end).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      assert.ok(text.length >= 40, `${id} rendered ${text.length} chars — a section with nothing to show must say WHY`);
    }
  }
});
