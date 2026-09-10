// THE PROFILE'S CONSOLE COPY NEVER REACHES THE CONSOLE.
//
// e4c60d7 moved STEP_GOVERNS — the map of step name → console section, which
// the Evidence tab renders as the per-step link — out of console-tabs.mjs (a
// literal that rendered unconditionally, for every project) and into the
// profile's `console` copy, with an empty `{}` as the shell's neutral default.
//
// The copy channel it moved into is dead. `COPY` is only ever populated by
// `setConsoleCopy`, and the single production caller is `applyConsoleCopy` in
// inspector/mcp/src/lib/preview-service.mjs, which resolves the profile as
// `loadProfileSync(projectDir)` — with no `{ id }`. profile-loader.mjs's
// locateProfile refuses an id that is not a string, so that call returns
// `{ok:false}` for EVERY project, the host falls back to `setConsoleCopy(null)`
// and the console renders NEUTRAL_COPY forever.
//
// So the map that used to be a literal is now always `{}`: a cmp console — the
// one stack this repo actually ships — stopped linking `e2eSmoke` to Screens,
// `tokenDrift` to Design language and the other seven, and nothing said so. The
// wiring bug predates the commit (cmp's `componentsEmpty` and the rest were
// already neutral in the served page); moving a working literal into the broken
// channel is what turned it into a regression a reader can see.
//
// THIS TEST DRIVES THE REAL HOST, not a re-typed copy of its two lines:
// createPreviewService() applies the console copy in its constructor (it does
// not start a server), and the page the inspector serves renders through the
// same evidenceBodyHtml this asserts on. The property is satisfiable today —
// deliver the profile's copy and the link renders — so this fails for the
// delivery, not for the assertion.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPreviewService } from "../inspector/mcp/src/lib/preview-service.mjs";
import { consoleCopy, evidenceBodyHtml } from "../packages/harness/src/console/console-tabs.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// A real cmp project root: qa/harness-manifest.json naming `cmp`, and the
// profile installed under qa/lib/profiles/cmp/ where the loader looks.
const CMP_PROJECT = path.join(REPO_ROOT, "template");

test("the console host delivers no profile console copy, so the Evidence tab links no step to the section it governs", () => {
  // The host, exactly as the inspector runs it. Constructing the service is
  // what applies the copy; nothing is started and no port is bound.
  createPreviewService({ projectDir: CMP_PROJECT, log: () => {} });

  const receipt = {
    available: true,
    relPath: "qa/evidence/latest.json",
    verdict: "PASS",
    generatedAt: "2026-09-10T10:00:00Z",
    steps: [{ name: "e2eSmoke", verdict: "PASS", durationMs: 1200 }],
  };
  const html = evidenceBodyHtml(receipt, { available: false });

  assert.match(
    html,
    /<a class="step-link" href="#screens">Screens<\/a>/,
    "the cmp profile declares that e2eSmoke governs Screens (lib/profiles/cmp/console-copy.mjs stepGoverns), " +
      "and the Evidence tab rendered that link until stepGoverns moved into console copy — " +
      `the host delivered stepGoverns=${JSON.stringify(consoleCopy().stepGoverns)}`,
  );
});
