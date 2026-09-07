// STAGE 0.5's EXIT, AS A COMMAND.
//
// §9 states it as: "the console renders a stamped Compose app exactly as today
// AND a manifest-only backend fixture with every section present and honest."
// Two words in that sentence had no evaluator, which is why the stage could not
// start (§7, termination is a first-class concern):
//
//   "exactly as today"  needs a recorded baseline to diff against, or it means
//                       whatever the reader hopes it means.
//   "honest"            needs a definition a section can FAIL. A section that
//                       renders empty because its source is missing looks
//                       identical to one that renders empty because it is
//                       broken, and both look fine to a human scrolling past.
//
// Both are defined here, and the definitions are deliberately strict enough to
// be red today: the section list is a literal array in preview-service.mjs, so
// a backend profile gets Compose's sections whether they mean anything or not.
// That is the stage's work, and this is the thing it turns green.
//
//   node scripts/stage05-gate.mjs            evaluate
//   node scripts/stage05-gate.mjs --record   re-record the baseline, deliberately
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { galleryHtml } from "../inspector/mcp/src/lib/preview-service.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(REPO_ROOT, "test", "fixtures", "console-baseline.json");

/**
 * A stamped Compose app, as the console sees one.
 *
 * Cards are empty deliberately: what this gate baselines is the SECTION
 * INVENTORY — which sections exist, in what order — not the pixels inside them.
 * Inventing a card shape to make the page look fuller would be fabricating a
 * fixture to satisfy a gate, and the first attempt at it crashed the renderer
 * on a field I had not checked.
 */
const COMPOSE_STATE = { appName: "Baseline", viewport: { width: 411, height: 891 }, version: 3, cards: [] };

/**
 * A manifest-only backend: a project the harness knows about and that has none
 * of Compose's furniture.
 *
 * `capabilities.screens: false` is the honest shape and the first draft of this
 * gate omitted it — which made the fixture CLAIM to be a Compose app and made
 * the gate demand work that was already done. The console has dropped Screens
 * and Live device for a project with no composeApp/ since before this stage
 * existed, and says "governance only · no Compose app" on the rail. A gate
 * whose fixture lies produces a work list of things that are already true.
 */
const BACKEND_STATE = {
  appName: "CartService",
  viewport: { width: 411, height: 891 },
  version: 1,
  cards: [],
  capabilities: { governance: true, screens: false },
};

/** The sections the console rendered, in order, with their visible text. */
export function renderedSections(state, opts = {}) {
  const html = galleryHtml({ ...state, ...opts });
  return html
    .split(/<section id="tab-/)
    .slice(1)
    .map((part) => {
      const id = part.slice(0, part.indexOf('"'));
      const end = part.indexOf("</section>");
      const text = part
        .slice(part.indexOf(">") + 1, end < 0 ? part.length : end)
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { id, text };
    });
}

/**
 * HONEST, defined so a section can fail it.
 *
 * A section is honest when it says what it knows OR says why it does not know.
 * The failure this catches is the silent one: a panel that renders its title
 * and nothing else, which reads as "there is nothing here" whether the truth is
 * "this project has no specs" or "the scanner threw". The first is information;
 * the second is a bug wearing the first's clothes.
 */
const HONESTY_FLOOR = 40;
export function honestyProblems(sections) {
  const bad = [];
  for (const s of sections) {
    if (s.text.length < HONESTY_FLOOR) {
      bad.push(`${s.id}: renders ${s.text.length} chars — a section with nothing to show must say WHY, not go quiet`);
    }
  }
  return bad;
}

function readBaseline() {
  try {
    return JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  } catch {
    return null;
  }
}

function criteria() {
  const compose = renderedSections(COMPOSE_STATE);
  const backend = renderedSections(BACKEND_STATE);
  const baseline = readBaseline();
  const out = [];

  // A — exactly as today, as a diff rather than a hope.
  if (!baseline) {
    out.push({ what: "Compose console matches its recorded baseline", ok: false, detail: "no baseline recorded — run with --record" });
  } else {
    const now = compose.map((s) => s.id);
    const then = baseline.composeSections;
    out.push({
      what: "Compose console matches its recorded baseline",
      ok: JSON.stringify(now) === JSON.stringify(then),
      detail: JSON.stringify(now) === JSON.stringify(then) ? `${now.length} sections, order unchanged` : `was [${then.join(", ")}]\n        now [${now.join(", ")}]`,
    });
  }

  // C — honest: nothing renders silently empty.
  const problems = [...honestyProblems(compose), ...honestyProblems(backend)];
  out.push({
    what: "no section renders empty without saying why",
    ok: problems.length === 0,
    detail: problems.length ? problems.join("\n        ") : `all ${compose.length + backend.length} panels state their situation`,
  });

  // D — THE STAGE'S ACTUAL WORK. The section list must come from the profile.
  // Today it is a literal array, so a backend gets Compose's Screens, Design
  // language and Live device whether or not those mean anything to it. A
  // console that shows a backend a "Live device" tab is not honest about the
  // project; it is honest about its own hardcoding.
  const declared = ["overview", "specs", "evidence"];
  const driven = renderedSections(BACKEND_STATE, { sections: declared }).map((s) => s.id);
  out.push({
    what: "the section list is the PROFILE's, not a literal array",
    ok: JSON.stringify(driven) === JSON.stringify(declared),
    detail:
      JSON.stringify(driven) === JSON.stringify(declared)
        ? "a profile declaring three sections gets three"
        : `a profile declaring [${declared.join(", ")}] still rendered ${driven.length}: [${driven.join(", ")}]`,
  });

  // E — the consequence a reader can see. Screens and Live device are already
  // absent for a project with no composeApp/ (a real mechanism, predating this
  // stage). What remains is a design language shown to a service that has no
  // visual vocabulary — kept as a criterion because ONE capability flag is not
  // a declaration: it can only say "Compose or not", never "these sections".
  const COMPOSE_ONLY = ["screens", "design-system", "live-device"];
  const shown = renderedSections(BACKEND_STATE).map((x) => x.id);
  const furniture = COMPOSE_ONLY.filter((id) => shown.includes(id));
  out.push({
    what: "a backend is not shown Compose's furniture",
    ok: furniture.length === 0,
    detail: furniture.length ? `rendered for a backend: ${furniture.join(", ")}` : "none",
  });

  // F — THE PACKAGE BOUNDARY, which is why this stage exists before Stage 1.
  // §9's trigger for Stage 1 reads "before Stage 1 so the package boundary is
  // drawn with the console inside": distribution must ship the console, and it
  // cannot if the console lives in a sibling package. This criterion was NOT in
  // the first draft of this gate, and adding it turned a passing stage back to
  // failing — which is the point of a fence you are allowed to tighten but not
  // to ignore. A gate written to match the work already done is not a gate.
  const consoleHome = path.join(REPO_ROOT, "packages", "harness", "src", "console");
  const sibling = path.join(REPO_ROOT, "inspector", "mcp", "src", "lib", "preview-service.mjs");
  const inHarness = fs.existsSync(consoleHome);
  out.push({
    what: "the console lives inside the harness package, so distribution can ship it",
    ok: inHarness,
    detail: inHarness
      ? `packages/harness/src/console`
      : `still at ${path.relative(REPO_ROOT, sibling)} — a sibling package Stage 1 would not ship`,
  });

  return out;
}

function main() {
  if (process.argv.includes("--record")) {
    const composeSections = renderedSections(COMPOSE_STATE).map((s) => s.id);
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, `${JSON.stringify({ recordedAt: new Date().toISOString(), composeSections }, null, 2)}\n`);
    process.stdout.write(`recorded ${composeSections.length} sections to ${path.relative(REPO_ROOT, BASELINE)}\n`);
    process.exit(0);
  }
  process.stdout.write("stage 0.5 — the console into the harness (NORTH-STAR §9)\n\n");
  const results = criteria();
  for (const c of results) process.stdout.write(`  ${c.ok ? "✓" : "✗"} ${c.what}\n        ${c.detail}\n`);
  const failed = results.filter((c) => !c.ok);
  process.stdout.write(failed.length ? `\nstage 0.5: NOT EXITED — ${failed.length}/${results.length} criteria unmet\n` : "\nstage 0.5: EXITED\n");
  process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
export { COMPOSE_STATE, BACKEND_STATE, criteria };
