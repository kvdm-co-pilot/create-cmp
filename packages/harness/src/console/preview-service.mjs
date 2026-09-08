// preview-service.mjs — the console page: (state) -> html, and nothing else.
//
// MOVED from inspector/mcp/src/lib/preview-service.mjs — NORTH-STAR §9, stage
// 0.5, "the console into the harness". The trigger for stage 1 reads "before
// Stage 1 so the package boundary is drawn with the console inside":
// distribution has to ship the console, and it could not while the console
// lived in a sibling package.
//
// WHAT CAME AND WHAT DID NOT, because a reader will ask. The file this was cut
// from had two halves that shared a name and little else:
//
//   galleryHtml          pure. (state) -> html. Imports the three section
//                        modules and one manifest constant. Zero file reads,
//                        zero processes, zero paths. THIS HALF MOVED.
//   createPreviewService the resident loop: an HTTP server, an fs watcher, a
//                        Gradle invoker (`./gradlew :composeApp:renderScreens`),
//                        a KSP cache self-heal, a hot-run desktop launcher, and
//                        twenty data readers that parse Kotlin. THAT HALF
//                        STAYED, and imports galleryHtml from here.
//
// The cut is not a convenience. docs/proposals/PACKAGE-SPLIT.md §3 puts "the
// console" in `prooflane-harness` with the words "Knows no stack. THIS IS THE
// PRODUCT", and puts "the eyes: preview registry, headless render, live
// inspector, drift, runtime, data" in a SEPARATE package,
// `prooflane-studio-cmp`, as "providers behind the console's interfaces".
// Moving the resident loop here would have put the eyes inside the package that
// knows no stack, and would have needed `composeApp`, `gradlew` and `kspCaches`
// excused in test/agnostic-lint.test.mjs — whose own contract is that the
// exception list shrinks and never grows. Nothing here needs excusing. The
// arrow now points down (studio -> harness), which is the direction §3 requires.
//
// The directory is `src/console/`, not `src/lib/`: scripts/sync-harness.mjs
// mirrors `src/lib` into `template/qa/lib`, so a console under lib/ would be
// vendored into every stamped app. REGION_DIRS is one level deep and
// REGION_TREES covers only `src/lib/profiles`, so `src/console/` ships in the
// package (package.json `files: ["src", ...]`) and is not vendored.

import { MANIFEST_REL_PATH } from "../lib/harness-manifest.mjs";
import {
  renderShellPage,
  statusGlyph,
  artifactStatusHtml,
  railReceiptHtml,
  receiptGlyph,
  formatAgeCoarse,
  deriveHumanQueue,
  governanceStripHtml,
} from "./console-shell.mjs";
import { overviewBodyHtml, overviewStatusHtml, overviewGlyph } from "./console-overview.mjs";
// The Evidence section's own status line shows a rung, so it shows the pack —
// one spelling for the whole console lives in console-evidence.mjs (§6.5).
import { rungWithPack, rungPackNote } from "./console-evidence.mjs";
import {
  designLanguageBodyHtml,
  componentsBodyHtml,
  approvalsTabHtml,
  specsTabHtml,
  architectureTabHtml,
  evidenceBodyHtml,
  commentsTabHtml,
  screensBodyHtml,
  intentBodyHtml,
  walkthroughTabHtml,
  liveDeviceTabHtml,
  digestTabHtml,
  featuresTabHtml,
  driftPanelHtml,
  signatureBarHtml,
  consoleCopy,
} from "./console-tabs.mjs";

// Component-story registry entries (§3.3): `component.<kebab-name>` ids from
// ComponentStories.kt. Rendered by the same pipeline as every other entry,
// but they are component documentation, not screens — the gallery keeps them
// out of the Screens grid/counts and the Components section shows each at the
// top of its entry.
const COMPONENT_STORY_ID_RE = /^component\.(.+)$/;

/** True when a registry id is a component story, not a screen. */
export function isComponentStoryId(id) {
  return COMPONENT_STORY_ID_RE.test(String(id));
}

/**
 * Every CURRENTLY RENDERED component-story entry, keyed by its kebab name
 * (`component.app-header` → `"app-header"`), for componentsBodyHtml. A
 * project whose registry predates component stories yields `{}` — the
 * Components section then states the absence per entry, never an error.
 * @param {Array<{screen: {id: string, title: string, png: string}}>} cards
 * @returns {Record<string, {id: string, title: string, png: string}>}
 */
export function componentStoryCards(cards) {
  const out = {};
  for (const { screen } of cards) {
    const m = COMPONENT_STORY_ID_RE.exec(screen.id);
    if (!m) continue;
    out[m[1]] = { id: screen.id, title: screen.title, png: screen.png };
  }
  return out;
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

/**
 * The studio console page (docs/STUDIO-REDESIGN.md §2): ONE shell — the
 * sidebar ordering/coverage rail, the per-page header grammar, and the
 * provenance footers — with every section contributing only a document body
 * (console-shell.mjs owns all chrome; sections may not invent their own).
 * Pure: (state) -> html. PNGs are referenced via /previews/… with a version
 * cache-buster; wireframe SVGs are inlined (SVG is structured text). Cards
 * changed in THIS render get the CHANGED flag plus a hover before/after
 * compare (screen.prev.png is the pre-render copy); every card keeps a
 * persistent "changed #N" badge from `changedVersions` so attribution
 * outlives the next render.
 * @param {object} state { appName, viewport, cards, version, changed, changedVersions, error,
 *   approvals, specs, designSystem, architecture, components, comments, variants, componentsMeta,
 *   architectureMeta, lastReceipt, receiptHistory, treeHash, tokenUsage, intent }
 */
export function galleryHtml(state) {
  const {
    appName,
    viewport,
    cards,
    version,
    changed = [],
    changedVersions = {},
    error = null,
    errorSource = null,
    renderer = { lastOutcome: "never", lastSuccessAt: null, lastAttemptAt: null, consecutiveFailures: 0 },
    rendererLastErrorText = null,
    // Derived provenance of the pixels below (see the service's freshness()). Defaulting
    // to null keeps older callers rendering exactly as before rather than asserting a
    // freshness this page has no basis for.
    freshness = null,
    approvals = { available: false },
    specs = { available: false },
    designSystem = { available: false },
    architecture = { layerMap: { available: false }, governedContract: { available: false }, featureShape: { available: false } },
    components = { available: false },
    comments = { available: false },
    variants = { available: false },
    componentsMeta = {},
    architectureMeta = {},
    lastReceipt = null,
    receiptHistory = { available: false },
    treeHash = null,
    tokenUsage = null,
    intent = { available: false },
    features = { available: false },
    // PW-5: the productization surfaces — each degrades to an honest empty
    // state when its data provider wasn't wired by the caller.
    walkthrough = { available: false, runs: [] },
    // The project's own walk derivation (qa/lib/walk.mjs via the bridge) —
    // the In-flight block's rich rendering; null degrades to the board mirror.
    walks = null,
    liveDevice = null,
    liveSession = null,
    digest = null,
    anchoredDiffs = null,
    governedArtifacts = { available: false },
    // The governance journal (qa/approvals.log.jsonl via the project's own
    // library) — feeds the strip's History; degrades to no history.
    journal = { available: false },
    // The console's own build handshake (buildStatus). Absent = render no
    // stale banner and no build id: unknown freshness is never dressed up as
    // fresh, nor as a warning.
    build = null,
    // What this project can show (detectCapabilities). Older callers get the
    // full console; a governance-only project drops the sections that need
    // pixels and says so on the rail.
    capabilities = { governance: true, screens: true },
    // WHICH SECTIONS this project's console has, declared rather than assumed.
    // `capabilities` can only say "Compose or not" — one bit, chosen here, for
    // every stack there will ever be. A declaration says "these sections, in
    // this order", which is what lets a backend have a console that is about a
    // backend. Absent, every section renders exactly as before.
    sections: declaredSectionIds = null,
    // Where this project keeps its receipt/specs/doc (project-layout.mjs's
    // resolveProjectLayout result). null = older caller; nothing is shown.
    layout = null,
  } = state;
  const width = viewport?.width ?? 411;
  // §3.3: component stories render through the same pipeline but are not
  // screens — the Screens grid, screen count, and changed-count all exclude
  // them; the Components section picks them up via componentsMeta below.
  const screenCards = cards.filter(({ screen }) => !isComponentStoryId(screen.id));
  const changedScreens = changed.filter((id) => !isComponentStoryId(id));
  // Rail badge (§7.3): count of OPEN comments next to the Comments item.
  // Always rendered (hidden at 0) so the SSE "comment" handler can always
  // find #comments-badge to update in place.
  const openCommentCount = comments.available ? comments.comments.filter((c) => c.status === "open").length : 0;
  // §2 mode presentation: the Design-language candidates strip is genesis-
  // mode only — derived from the design-system ARTIFACT's own live status
  // (undefined when approvals data isn't available at all, which reads as
  // steward — the safe default: no strip rather than a fabricated one).
  const designSystemStatus = approvals.available
    ? (approvals.statuses.find((s) => s.id === "design-system") || {}).status
    : undefined;

  // Governed-artifact records: rail glyphs + page status lines (§2 header
  // grammar). Sections without an exact one-artifact mapping get NO glyph —
  // never a borrowed status.
  const artifactRecord = (id) =>
    approvals.available ? approvals.statuses.find((s) => s.id === id) || null : null;
  const dsRecord = artifactRecord("design-system");
  const archRecord = architectureMeta.approval ?? artifactRecord("architecture");
  const componentsRecord = componentsMeta.approval ?? artifactRecord("components");
  const intentRecord = artifactRecord("intent");

  // Evidence (§3.6): the receipt the whole console leans on. Some callers wire
  // it via architectureMeta.lastReceipt (the older Wave C path) — one receipt
  // serves the rail glyph, the rail foot, the status lines, the Screens rows'
  // clause badges, and the Evidence section.
  const effectiveReceipt = lastReceipt || architectureMeta.lastReceipt || null;

  // Open comments, attributed to the section their target lives in — the §2
  // header's open-comment count. Component comments ride the design-system
  // target type with a "component:<Name>" token (the §7.3 contract), so they
  // attribute to the Components section. Unknown/general targets count under
  // Comments.
  const sectionOfTarget = (t) => {
    if (!t || typeof t !== "object") return "comments";
    if (t.type === "design-system") {
      return String(t.token || "").startsWith("component:") ? "components" : "design-system";
    }
    if (t.type === "architecture") return "architecture";
    if (t.type === "screen" || t.type === "element") return "screens";
    // §3.0: the Intent brief's comment affordances ride the spec-line type
    // (file specs/intent.md, clauseId = the section heading) — they attribute
    // to the Intent section, not Specs.
    if (t.type === "spec-line") return t.file === "specs/intent.md" ? "intent" : "specs";
    return "comments";
  };
  const openBySection = {};
  if (comments.available) {
    for (const c of comments.comments) {
      if (c.status !== "open") continue;
      const s = sectionOfTarget(c.target);
      openBySection[s] = (openBySection[s] || 0) + 1;
    }
  }
  const openNote = (id) => {
    const n = openBySection[id] || 0;
    return n ? ` &middot; &#9998; ${n} open comment${n === 1 ? "" : "s"}` : "";
  };

  // --- section bodies (§3 professional forms, console-tabs.mjs) -------------

  // §3.4: the screen × state matrix. The expanded rows read the same specs
  // data as the RTM and the same receipt as Evidence — one derivation each.
  const screensBody = screensBodyHtml({
    cards: screenCards,
    changed: changedScreens,
    changedVersions,
    version,
    specs,
    lastReceipt: effectiveReceipt,
  });

  // --- §2 header status lines: one glance answers "what is this, is it
  // signed, has it moved". Artifact-governed pages use the artifact grammar;
  // the rest state only what their own data shows (evidence-or-silence). ----

  // The matrix's rows are BASE screens; @state variants render as columns
  // inside their row — the header count must match the rows the reader sees,
  // not the raw card count (caught by the wave-final browser walk: "7
  // screens" over a 4-row matrix).
  const baseScreenCount = screenCards.filter(({ screen }) => !String(screen.id).includes("@")).length;
  const screensStatus = `render #${version} &middot; ${baseScreenCount} screen${baseScreenCount === 1 ? "" : "s"}${
    changedScreens.length ? ` &middot; <span class="chg">${changedScreens.length} changed this render</span>` : ""
  }${openNote("screens")}`;

  // Intent (§3.0): the artifact status when there is one, plus the brief's
  // own fill state — both derived, neither borrowed. No intent.md at all
  // states the §3.0 pending line here too.
  const intentStatusParts = [];
  {
    const rec = artifactStatusHtml(intentRecord);
    if (rec) intentStatusParts.push(rec);
    if (intent.available && intent.sections) {
      const filled = intent.sections.filter((s) => s.filled).length;
      intentStatusParts.push(`${filled} of ${intent.sections.length} sections captured`);
    }
  }
  const intentStatus =
    (intentStatusParts.join(" &middot; ") || "not yet captured &mdash; conversation 0 pending") + openNote("intent");

  const dsStatus = (artifactStatusHtml(dsRecord) || "the visual vocabulary — tokens, contrast, candidates") + openNote("design-system");
  const archStatus = (artifactStatusHtml(archRecord) || "the layer contract and its live conformance") + openNote("architecture");

  // Components: the artifact status when there is one, plus the registry's
  // live size when the scan resolved — both are facts, neither is borrowed.
  const componentsStatusParts = [];
  {
    const rec = artifactStatusHtml(componentsRecord);
    if (rec) componentsStatusParts.push(rec);
    if (components.available && components.components) {
      const n = components.components.length;
      componentsStatusParts.push(`${n} component${n === 1 ? "" : "s"} in the registry`);
    }
  }
  const componentsStatus =
    (componentsStatusParts.join(" &middot; ") || "no components scan available") + openNote("components");

  // specs/<file> -> its governing artifact's live status, built from the
  // project's OWN registry (id + files) — so app-base maps to `architecture`
  // and the CONFIGURED exemplar's spec to `exemplar-spec`, never guessed from
  // a filename. Absent registry (older lib) simply yields no signature bars.
  // A spec file can appear in MORE than one artifact's file set: the exemplar's
  // spec is governed by `exemplar-spec` (1 file) AND listed inside
  // `exemplar-feature` (the 11-file clone source). The signature control must
  // bind to the MOST SPECIFIC artifact — fewest files — or a click under
  // "foods.spec.md" would sign the entire exemplar feature instead of its
  // contract, the exact silent wrong-transition this console refuses elsewhere.
  const specArtifactByFile = {};
  if (governedArtifacts.available && approvals.available && approvals.statuses) {
    const byId = new Map(approvals.statuses.map((s) => [s.id, s]));
    const winnerSize = {};
    for (const a of governedArtifacts.artifacts) {
      if (!byId.has(a.id)) continue;
      for (const f of a.files) {
        if (!f.endsWith(".spec.md")) continue;
        if (winnerSize[f] === undefined || a.files.length < winnerSize[f]) {
          winnerSize[f] = a.files.length;
          specArtifactByFile[f] = byId.get(a.id);
        }
      }
    }
  }

  const specsStatus = specs.available
    ? `${specs.files.length} spec file${specs.files.length === 1 ? "" : "s"} &middot; ${specs.files.reduce((n, f) => n + f.clauses.length, 0)} clauses${openNote("specs")}`
    : "no specs/ directory found";

  let evidenceStatus = "no verify receipt yet";
  if (effectiveReceipt && effectiveReceipt.available) {
    const age = typeof effectiveReceipt.ageMs === "number" ? formatAgeCoarse(effectiveReceipt.ageMs) : "age unknown";
    // The rung (receipt's own derived evidenceLevel) rides the status line —
    // "verify PASS · L2 device · pack cmp · 3m ago" — absent on FAIL/pre-ladder
    // receipts. The pack is part of the rung and not an extra field: §6.5 says
    // every surface showing a rung shows it, and this is the Evidence section's
    // own header line, so a bare grade here would be the console asserting a
    // claim §8.9 says cannot be compared with anyone else's.
    const rungLabel = rungWithPack(effectiveReceipt.evidenceLevel, effectiveReceipt.packId ?? effectiveReceipt.pack);
    const rung = rungLabel
      ? ` &middot; <span title="${escAttr(rungPackNote(effectiveReceipt.evidenceLevel, effectiveReceipt.packId ?? effectiveReceipt.pack))}">${esc(rungLabel)}</span>`
      : "";
    evidenceStatus = `verify ${esc(effectiveReceipt.verdict || "?")}${rung} &middot; ${esc(age)}${
      effectiveReceipt.stale ? ` &middot; <span class="status-drift">stale &mdash; tree changed since</span>` : ""
    }`;
  }

  let approvalsStatus = "approvals not available in this project";
  if (approvals.available && approvals.statuses) {
    const count = (st) => approvals.statuses.filter((s) => s.status === st).length;
    const parts = [`${approvals.statuses.length} governed artifact${approvals.statuses.length === 1 ? "" : "s"}`];
    if (count("approved")) parts.push(`${count("approved")} signed`);
    if (count("changed-since-approval")) parts.push(`<span class="status-drift">${count("changed-since-approval")} drifted</span>`);
    if (count("reopened")) parts.push(`<span class="status-reopen">${count("reopened")} reopened</span>`);
    if (count("unreviewed")) parts.push(`${count("unreviewed")} unsigned`);
    approvalsStatus = parts.join(" &middot; ");
  }

  const commentsStatus = comments.available
    ? `${openCommentCount} open &middot; ${comments.comments.length - openCommentCount} resolved`
    : "comments ledger not available in this project";

  // Features (the per-feature view): phase tallies from the project's own
  // getFeatureBoard — facts only, no fabricated zeros. `proven` is DERIVED
  // doneness (clauses cited + receipt PASS + attests tree), never a claim.
  let featuresStatus = "no feature briefs yet";
  let featuresGlyph = null;
  if (features.available && features.board && features.board.features.length > 0) {
    const briefs = features.board.features;
    const n = (ph) => briefs.filter((f) => f.phase === ph).length;
    const parts = [`${briefs.length} brief${briefs.length === 1 ? "" : "s"}`];
    if (n("proposed")) parts.push(`${n("proposed")} awaiting sign-off`);
    if (n("approved")) parts.push(`${n("approved")} building`);
    if (n("proven")) parts.push(`${n("proven")} proven — acceptance pending`);
    if (n("accepted")) parts.push(`${n("accepted")} accepted`);
    if (n("changed-since-approval")) parts.push(`<span class="status-drift">${n("changed-since-approval")} drifted</span>`);
    if (features.board.undeclared.length > 0) parts.push(`<span class="status-drift">undeclared blast</span>`);
    // The design gate's pending states (brief → design → spec → build): each
    // feature's feature-design:<name> artifact, folded into the same rollup.
    const dn = (pred) => briefs.filter((f) => f.design && pred(f.design)).length;
    const designDrift = dn((d) => d.status === "changed-since-approval");
    const designReopen = dn((d) => d.status === "reopened");
    const designAwait = dn((d) => d.status === "unreviewed" && d.resolvable !== false);
    if (designAwait) parts.push(`${designAwait} design${designAwait === 1 ? "" : "s"} awaiting signature`);
    if (designDrift) parts.push(`<span class="status-drift">${designDrift} design${designDrift === 1 ? "" : "s"} drifted</span>`);
    featuresStatus = parts.join(" &middot; ");
    // The rail-truth rule: a neutral glyph means TRULY nothing pending here.
    // Every phase waiting on a human is colour, the moment it exists — worst
    // state wins: drift (an accident, red) > reopened (a sanctioned redesign,
    // amber — NEVER collapsed into drift; the asymmetry is the product) >
    // unsigned brief (accent — waiting on your signature) > proven-awaiting-
    // accept (accent, filled — waiting on your acceptance). All-green reads
    // signed.
    // Design states fold into the same worst-state ladder: a drifted design
    // is red like any drift, a reopened one amber, one awaiting signature
    // accent — an UNDRAFTED design (unresolvable) is the agent's work, not
    // the human's, so it alone stays out of the colour ladder.
    featuresGlyph =
      n("changed-since-approval") > 0 || designDrift > 0
        ? {
            ch: "⚠",
            cls: "glyph-drift",
            label:
              n("changed-since-approval") > 0
                ? `${n("changed-since-approval")} brief(s) changed since signature`
                : `${designDrift} design(s) changed since signature`,
          }
        : n("reopened") > 0 || designReopen > 0
          ? {
              ch: "◐",
              cls: "glyph-reopen",
              label: n("reopened") > 0 ? `${n("reopened")} brief(s) reopened for redesign` : `${designReopen} design(s) reopened for redesign`,
            }
          : n("proposed") > 0 || designAwait > 0
            ? {
                ch: "○",
                cls: "glyph-unsigned",
                label: n("proposed") > 0 ? `${n("proposed")} brief(s) awaiting signature` : `${designAwait} design(s) awaiting signature`,
              }
            : n("proven") > 0
              ? { ch: "●", cls: "glyph-attn", label: `${n("proven")} proven — acceptance pending` }
              : { ch: "●", cls: "glyph-signed", label: "all briefs signed" };
  }
  // Acceptances the human owes — counted into the Approvals work queue below,
  // so Features and Approvals can never tell different stories about whether
  // anything waits on you.
  const provenAwaiting =
    features.available && features.board ? features.board.features.filter((f) => f.phase === "proven").length : 0;

  // Specs roll-up (rail-truth): the Specs tab aggregates every spec-family
  // artifact (exemplar-spec + feature-spec:*) so an unreviewed or drifted
  // contract is COLOUR on the rail, not a neutral dot the human must dig for.
  let specsGlyph = null;
  if (approvals.available && approvals.statuses) {
    const specRecords = approvals.statuses.filter((s) => s.id === "exemplar-spec" || s.id.startsWith("feature-spec:"));
    const c = (st) => specRecords.filter((s) => s.status === st).length;
    if (specRecords.length > 0) {
      specsGlyph =
        c("changed-since-approval") > 0
          ? { ch: "⚠", cls: "glyph-drift", label: `${c("changed-since-approval")} spec(s) drifted` }
          : c("reopened") > 0
            ? { ch: "◐", cls: "glyph-reopen", label: `${c("reopened")} spec(s) reopened for redesign` }
            : c("unreviewed") > 0
              ? { ch: "○", cls: "glyph-unsigned", label: `${c("unreviewed")} spec(s) unsigned` }
              : { ch: "●", cls: "glyph-signed", label: "all specs signed" };
    }
  }

  // Approvals roll-up (rail-truth): this tab IS the work queue — its glyph is
  // the count of decisions currently waiting on the human, colour when > 0.
  // Pending ACCEPTANCES count too (a ledger field, not an artifact status —
  // without this the queue said "nothing waiting on you" while a proven
  // feature sat awaiting the human's accept).
  let approvalsGlyph = null;
  if (approvals.available && approvals.statuses) {
    // An unreviewed artifact that is UNRESOLVABLE (e.g. a declared-but-
    // undrafted feature design) is the agent's work, not a decision the
    // human can make — same exclusion pendingOnHuman applies, so the glyph
    // and the queue never tell different stories. Drift stays counted
    // regardless of resolvability: deleted signed files must surface.
    const c = (st) => approvals.statuses.filter((s) => s.status === st && (st !== "unreviewed" || s.resolvable !== false)).length;
    const pending = c("unreviewed") + c("changed-since-approval") + c("reopened") + provenAwaiting;
    const detail = provenAwaiting > 0 ? ` (${provenAwaiting} acceptance${provenAwaiting === 1 ? "" : "s"})` : "";
    approvalsGlyph =
      c("changed-since-approval") > 0
        ? { ch: "⚠", cls: "glyph-drift", label: `${pending} decision(s) waiting — ${c("changed-since-approval")} drifted${detail}` }
        : pending > 0
          ? { ch: "○", cls: "glyph-unsigned", label: `${pending} decision(s) waiting${detail}` }
          : { ch: "●", cls: "glyph-signed", label: "nothing waiting on you" };
  }

  // The human queue, derived ONCE for this render and shared by the front door
  // and the governance strip — the same deriveHumanQueue the guided prompt
  // uses. Three surfaces, one derivation: they cannot disagree.
  const overviewStatuses = approvals.available && approvals.statuses ? approvals.statuses : [];
  const overviewFeatures = features.available && features.board ? features.board.features : [];
  const humanQueue = deriveHumanQueue({ statuses: overviewStatuses, features: overviewFeatures });

  // Rail + sections share one order: the genesis definition order (§2), with
  // the cross-cutting ledgers (Approvals, Comments) after the artifact pages.
  // Overview is the DEFAULT page — the front door (§3.7). Screens keeps the
  // hot-reload loop: the tab is sticky (hash + sessionStorage), so an SSE
  // reload during UI work never bounces the reader off the gallery; only a
  // genuinely fresh session lands on the front door.
  const railItems = [
    // §3.7 (front door): the returning owner's entry point — what needs you,
    // what changed, is it still proven. It owns no facts; it arranges the
    // sections below it. See console-overview.mjs for why this supersedes the
    // "dashboard is ambient — never a separate tab" rule of §2.
    {
      id: "overview",
      label: "Drive",
      glyph: overviewGlyph(humanQueue, overviewStatuses),
      active: true,
    },
    // Intent is genesis order 0 — the root artifact everything else is
    // expressed in — so it leads the rail. The rest follows the REVISED
    // definition order (spec-first behavior, UI-first visuals): architecture,
    // then the exemplar's surfaces (Specs, Screens), then the design system
    // and components — which lock on / are distilled from those screens.
    { id: "intent", label: "Intent", glyph: statusGlyph(intentRecord) },
    // Features sits DIRECTLY after Intent (CHANGE-FLOW-DESIGN.md §6): a
    // feature's walk — brief → contract → build → prove → accept — is the
    // decide layer, and a brief speaks intent's vocabulary; it needs nothing
    // from architecture. The glyph is the rail-truth roll-up: colour for any
    // state waiting on the human, from the moment a brief file exists.
    { id: "features", label: "Features", glyph: featuresGlyph },
    { id: "architecture", label: "Architecture", glyph: statusGlyph(archRecord) },
    { id: "specs", label: "Specs", glyph: specsGlyph },
    // Screens is UNGOVERNED — no signature exists, so it can never be green.
    // Its one honest colour is red: the last render or compile FAILED, so the
    // gallery may be showing stale pixels. Otherwise neutral.
    {
      id: "screens",
      label: "Screens",
      glyph: error
        ? { ch: "✗", cls: "glyph-drift", label: `last ${errorSource || "render"} failed — the gallery may be stale` }
        : null,
    },
    { id: "design-system", label: "Design language", glyph: statusGlyph(dsRecord) },
    { id: "components", label: "Components", glyph: statusGlyph(componentsRecord) },
    // §3.6: the Evidence item's glyph derives from the latest receipt itself
    // (✓ fresh PASS · ✗ FAIL · ⚠ stale · ○ none) — receiptGlyph, the same
    // derivation the rail foot uses.
    { id: "evidence", label: "Evidence", glyph: receiptGlyph(effectiveReceipt) },
    // A2: the walkthrough report is evidence-adjacent — derived from committed
    // manifests, so it sits right after Evidence in the arc.
    { id: "walkthrough", label: "Walkthrough", glyph: null },
    // The work queue itself: colour whenever any decision waits on the human.
    { id: "approvals", label: "Approvals", glyph: approvalsGlyph },
    {
      id: "comments",
      label: "Comments",
      glyph: null,
      badgeHtml: `<span class="tab-badge" id="comments-badge"${openCommentCount === 0 ? " hidden" : ""}>${openCommentCount}</span>`,
    },
    // A1: the console arc ends DRIVE — Live device is deliberately the final
    // section: define → preview → approve → verify → report → drive. The glyph
    // follows statusGlyph's {ch, cls, label} shape (a bare string renders as
    // "undefined" — the rail template reads g.ch/g.cls).
    {
      id: "live-device",
      label: "Live device",
      glyph: liveDevice && liveDevice.reachable ? { ch: "●", cls: "glyph-signed", label: "device connected" } : null,
    },
  ];

  const sections = [
    // §3.7 — the front door. Composition only: it arranges the queue, the
    // anchored-diff file splits and the digest that other modules derived. It
    // grows NO signature control of its own — sign where you read stands.
    {
      id: "overview",
      // Retitled by studio-drive-mode: the front door is the DRIVING surface
      // (chain + walks + queue); the id stays "overview" — it is pinned by
      // GOVERNED_PANELS, sessionStorage, and the strip's gov-next jump.
      title: "Drive",
      statusHtml: overviewStatusHtml({
        receipt: effectiveReceipt,
        statuses: overviewStatuses,
        receiptGlyph,
        formatAge: formatAgeCoarse,
      }),
      bodyHtml: overviewBodyHtml({
        queue: humanQueue,
        statuses: overviewStatuses,
        features: overviewFeatures,
        walks,
        anchoredDiffs,
        digestHtml: digestTabHtml(digest),
        digestSince: digest && digest.available ? digest.since : null,
        statusGlyph,
        journal: journal.available ? journal.events : [],
        formatAge: formatAgeCoarse,
      }),
      active: true,
    },
    {
      id: "intent",
      title: "Intent",
      statusHtml: intentStatus,
      bodyHtml: intentBodyHtml(intent),
    },
    // Features directly after Intent — same order as the rail (decide layer
    // before the contract layer; CHANGE-FLOW-DESIGN.md §6).
    { id: "features", title: "Features", statusHtml: featuresStatus, bodyHtml: featuresTabHtml(features) },
    {
      id: "architecture",
      title: "Architecture",
      statusHtml: archStatus,
      bodyHtml: architectureTabHtml(architecture, architectureMeta),
    },
    // §3.5: the RTM's last-receipt column reads the same receipt as Evidence.
    {
      id: "specs",
      title: "Specs",
      statusHtml: specsStatus,
      bodyHtml: specsTabHtml(specs, { lastReceipt: effectiveReceipt, artifactByFile: specArtifactByFile }),
    },
    {
      id: "screens",
      title: "Screens",
      statusHtml: screensStatus,
      headExtraHtml: `<div class="screens-toolbar"><input id="filter" type="search" placeholder="filter screens&hellip;"></div>`,
      bodyHtml: screensBody,
      fullBleed: true,
    },
    {
      id: "design-system",
      title: "Design language",
      statusHtml: dsStatus,
      bodyHtml: designLanguageBodyHtml(designSystem, {
        usage: tokenUsage,
        variants,
        artifactStatus: designSystemStatus,
      }),
    },
    {
      id: "components",
      title: "Components",
      statusHtml: componentsStatus,
      // §3.3 story pickup: the section gets the current render's story cards
      // plus the changed-attribution vocabulary the Screens grid uses
      // (version cache-buster, persistent changed-#N chips). componentStories
      // is derived here when the caller didn't pass one, so a bare
      // galleryHtml({cards}) still shows story renders.
      bodyHtml: componentsBodyHtml(components, {
        componentStories: componentStoryCards(cards),
        ...componentsMeta,
        version,
        changedVersions,
      }),
    },
    { id: "evidence", title: "Evidence", statusHtml: evidenceStatus, bodyHtml: evidenceBodyHtml(effectiveReceipt, receiptHistory) },
    {
      id: "walkthrough",
      title: "Walkthrough",
      statusHtml: walkthrough.available
        ? `<span class="status-line">latest run ${walkthrough.runs[0].generatedAt}</span>`
        : `<span class="status-line">no runs yet</span>`,
      bodyHtml: walkthroughTabHtml(walkthrough),
    },
    { id: "approvals", title: "Approvals", statusHtml: approvalsStatus, bodyHtml: approvalsTabHtml(approvals, { anchoredDiffs }) },
    { id: "comments", title: "Comments", statusHtml: commentsStatus, bodyHtml: commentsTabHtml(comments) },
    {
      id: "live-device",
      title: "Live device",
      statusHtml:
        liveDevice && liveDevice.reachable
          ? `<span class="status-line">connected — ${liveDevice.appId}</span>`
          : `<span class="status-line">not connected</span>`,
      bodyHtml: liveDeviceTabHtml(liveDevice, liveSession),
      fullBleed: true,
    },
  ];

  // Page anatomy (studio-drive-mode): every MIRROR section — a complete
  // signed-doc rendering — collapses to its verdict line by default, with the
  // corpus one disclosure away. A section the human queue currently points at
  // renders open: its exception IS the reason the human is coming. Tool
  // sections (Drive, Screens, Live device) keep their full body — they are
  // instruments, not documents.
  const MIRROR_SECTIONS = new Set([
    "intent", "features", "architecture", "specs", "design-system",
    "components", "evidence", "walkthrough", "approvals", "comments",
  ]);
  const queueTabs = new Set(humanQueue.map((q) => q.tab));
  for (const section of sections) {
    if (!MIRROR_SECTIONS.has(section.id)) continue;
    section.mirror = true;
    section.mirrorOpen = queueTabs.has(section.id);
  }
  // Open feedback is an exception too: a Comments page with open threads
  // greeting the reader with a closed fold would hide the very thing waiting.
  if (openCommentCount > 0) {
    const c = sections.find((x) => x.id === "comments");
    if (c) c.mirrorOpen = true;
  }

  // Sign where you read: every governed section carries its OWN signature
  // control, so the human reading an artifact is the human who can sign it.
  // The Approvals tab stays the ledger and the queue — it is no longer the
  // only place a decision can be made.
  if (approvals.available && approvals.statuses) {
    const byId = new Map(approvals.statuses.map((s) => [s.id, s]));
    const bar = (id, what) => (byId.has(id) ? signatureBarHtml(byId.get(id), { what }) : "");
    const barBySection = {
      intent: bar("intent", "the intent brief"),
      architecture: bar("architecture", "this architecture"),
      "design-system": bar("design-system", "the design system"),
      components: bar("components", "the component registry"),
    };
    for (const section of sections) {
      const b = barBySection[section.id];
      if (b) section.bodyHtml = `${b}\n${section.bodyHtml}`;
    }
  }

  // The change surface (spec-mirror-drift): every drifted artifact's panel —
  // what changed vs. the signed bytes, what is still exactly as signed, and
  // the Re-approve button — renders AT THE TOP OF THE SECTION IT BELONGS TO,
  // not only in the Approvals table. The human reads the drift where they
  // read the artifact.
  if (approvals.available && approvals.statuses) {
    const sectionOfArtifact = (id) =>
      id === "intent" || id === "architecture" || id === "design-system" || id === "components"
        ? id
        : id.startsWith("feature-brief:") || id.startsWith("feature-design:")
          ? "features" // a design's card row lives here; its pixels in Screens
          : id === "exemplar-spec" || id.startsWith("feature-spec:")
            ? "specs"
            : id === "exemplar-feature"
              ? "screens" // the exemplar's file set IS the built surface
              : null;
    const panelsBySection = {};
    for (const s of approvals.statuses) {
      if (s.status !== "changed-since-approval") continue;
      const sec = sectionOfArtifact(s.id);
      if (!sec) continue;
      (panelsBySection[sec] ??= []).push(driftPanelHtml(s, anchoredDiffs ? anchoredDiffs[s.id] : null));
    }
    for (const section of sections) {
      if (panelsBySection[section.id]) {
        section.bodyHtml = `${panelsBySection[section.id].join("\n")}\n${section.bodyHtml}`;
      }
    }
  }

  const bodyScript = `
  const pill = document.getElementById("pill");
  // §2: the rail glyphs and page-status lines are drift surfaces — they must
  // track approval/comment changes without a full reload (the same no-flash
  // rule the panel swaps follow). Buttons and inputs are never replaced, so
  // their listeners survive: only glyph spans and status-line innerHTML move.
  function syncShellFromDoc(doc) {
    doc.querySelectorAll(".rail-nav .tab-btn").forEach((freshBtn) => {
      const curGlyph = document.querySelector('.rail-nav .tab-btn[data-tab="' + freshBtn.dataset.tab + '"] .glyph');
      const freshGlyph = freshBtn.querySelector(".glyph");
      if (curGlyph && freshGlyph) {
        curGlyph.className = freshGlyph.className;
        curGlyph.textContent = freshGlyph.textContent;
        curGlyph.title = freshGlyph.title || "";
      }
    });
    doc.querySelectorAll(".tab-panel").forEach((freshPanel) => {
      const curStatus = document.querySelector('.tab-panel[data-tab="' + freshPanel.dataset.tab + '"] .page-status');
      const freshStatus = freshPanel.querySelector(".page-status");
      if (curStatus && freshStatus) curStatus.innerHTML = freshStatus.innerHTML;
    });
    // The governance strip lives in the rail — visible on every tab, so it
    // must track every ledger transition the panels do.
    const curStrip = document.getElementById("gov-strip");
    const freshStrip = doc.getElementById("gov-strip");
    if (curStrip && freshStrip) curStrip.innerHTML = freshStrip.innerHTML;
  }
  // Every governed panel refreshes IN PLACE (no location.reload()): a full
  // reload flashes the page, drops scroll, and blanks assistive/agent views of
  // the document mid-navigation. ONE routine for every governed-state event —
  // an approval, a comment, or a change to the governed FILES themselves —
  // because they all mean the same thing: the truth this page renders moved.
  // Panels are re-wired individually (never document-wide), so an unswapped
  // panel can never pick up a second listener and double-POST.
  const GOVERNED_PANELS = [
    // The front door leads the list, and it is the one panel that MUST be
    // here: its whole body is the queue of what still waits on you, so an
    // approval that refreshed every other panel while leaving this one stale
    // would leave the console's entry point advertising an act the human just
    // completed — the worst possible place for a stale read.
    "tab-overview",
    "tab-intent", "tab-features", "tab-architecture", "tab-specs",
    "tab-design-system", "tab-components", "tab-approvals", "tab-evidence", "tab-comments",
  ];
  function refreshGovernedPanels() {
    fetch("/").then((r) => r.text()).then((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const swapped = [];
      for (const id of GOVERNED_PANELS) {
        const fresh = doc.querySelector("#" + id);
        const cur = document.querySelector("#" + id);
        if (!fresh || !cur) continue;
        const wasActive = cur.classList.contains("active");
        cur.innerHTML = fresh.innerHTML;
        if (wasActive) cur.classList.add("active");
        swapped.push(cur);
      }
      if (swapped.length === 0) { location.reload(); return; } // unexpected markup — old behavior
      for (const el of swapped) {
        wireApproveButtons(el);
        wireReopenButtons(el);
        wireFeatureAcceptButtons(el);
        wireCommentButtons(el);
        wirePickButtons(el);
        wireArrivalButtons(el);
      }
      const freshBadge = doc.querySelector("#comments-badge");
      const curBadge = document.querySelector("#comments-badge");
      if (freshBadge && curBadge) {
        curBadge.textContent = freshBadge.textContent;
        curBadge.hidden = freshBadge.hidden;
      }
      syncShellFromDoc(doc);
    }).catch(() => location.reload());
  }
  // The next-act jump: land on the artifact's own signature bar
  // (sign-where-you-read — the same jump the guided prompt's "Take me there"
  // performs). Delegated at DOCUMENT level, because the same contract now
  // serves the rail strip AND the front door's queue, and it must survive
  // every SSE swap (both the strip's innerHTML and the Overview panel are
  // replaced wholesale). One handler, one behavior — a second copy on the
  // front door would be a second mechanism.
  document.addEventListener("click", (e) => {
    // .gov-next is the single next act; .gov-jump is a count or a queue row
    // that names its artifact. Both carry data-go-* and both must land the
    // reader on the row that explains itself.
    const btn = e.target.closest(".gov-next, .gov-jump");
    if (!btn) return;
    const railBtn = document.querySelector('.rail-nav .tab-btn[data-tab="' + btn.dataset.goTab + '"]');
    if (railBtn) railBtn.click();
    const target = document.querySelector('#tab-' + btn.dataset.goTab + ' [data-artifact="' + btn.dataset.goArtifact + '"]');
    if (target) {
      // Page anatomy: the row may live inside a collapsed mirror disclosure —
      // "take me there" opens every ancestor fold so the jump lands ON the row.
      let fold = target.closest("details");
      while (fold) {
        fold.open = true;
        fold = fold.parentElement ? fold.parentElement.closest("details") : null;
      }
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
  const es = new EventSource("/events");
  // EventSource reconnects on its own, but nothing ever wrote the pill back to
  // "live" — so a one-second blip read as permanently disconnected, which is a
  // direct cause of "the studio keeps getting disconnected". The open event
  // fires on the initial connect AND on every automatic reconnect — the honest
  // signal. (No backticks in this comment: it lives inside the page's template
  // literal, and a stray one closes the string.)
  es.onopen = () => { pill.textContent = "live"; pill.className = ""; };
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    // studio-self-renewal R6: this page was drawn by CMP_CONSOLE_BUILD; the hello
    // says which build is serving it NOW. A difference means the console renewed
    // itself under this tab (or was restarted by hand) — reload once and the
    // human sees current code without having touched anything. Guarded on the
    // constant existing so an older shell simply keeps the old behavior.
    if (msg.type === "hello" && msg.build && typeof CMP_CONSOLE_BUILD === "string" && msg.build !== CMP_CONSOLE_BUILD) {
      location.reload();
      return;
    }
    if (msg.type === "renewing") { pill.textContent = "renewing…"; pill.className = "rendering"; }
    if (msg.type === "rendering") { pill.textContent = "rendering…"; pill.className = "rendering"; }
    // A concurrent Gradle build (an ad-hoc ./gradlew) holds the classes dir. Not a
    // failure — the render is queued and will run. Say exactly that; never the error pill.
    if (msg.type === "deferred") { pill.textContent = "waiting for another build…"; pill.className = "rendering"; }
    if (msg.type === "render") location.reload();
    // approval (a decision, from the console OR the CLI), comment (added or
    // resolved), governance (a governed FILE changed — an agent wrote a spec
    // or a brief, or the lane wrote a receipt): all one refresh.
    if (msg.type === "approval" || msg.type === "comment" || msg.type === "governance") {
      refreshGovernedPanels();
    }
    if (msg.type === "error") {
      pill.textContent = msg.source === "compile" ? "compile failed" : "render failed";
      pill.className = "error";
    }
  };
  // readyState distinguishes "retrying" (the server blinked; EventSource is
  // already backing off toward a reconnect) from "gone" (CLOSED — it will not
  // retry). Reporting both as "disconnected" told the human a recoverable blip
  // was fatal.
  es.onerror = () => {
    const gone = es.readyState === 2; // CLOSED
    pill.textContent = gone ? "server gone" : "reconnecting…";
    pill.className = gone ? "error" : "rendering";
  };
  // Screen filter — survives the SSE-triggered reloads via sessionStorage.
  // §3.4: it filters matrix ROWS (one row per screen, states stay together).
  const filter = document.getElementById("filter");
  filter.value = sessionStorage.getItem("previewFilter") || "";
  const applyFilter = () => {
    const q = filter.value.trim().toLowerCase();
    sessionStorage.setItem("previewFilter", q);
    document.querySelectorAll(".matrix-row").forEach((c) => {
      c.style.display = !q || c.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  };
  filter.addEventListener("input", applyFilter);
  applyFilter();
  // Tabs — deep-linkable via location.hash (#approvals bookmarks/shares the tab,
  // and automation can land on any tab by URL), with sessionStorage as the
  // fallback so SSE-triggered reloads keep the tab even without a hash.
  const tabBtns = [...document.querySelectorAll(".tab-btn")];
  const panels = [...document.querySelectorAll(".tab-panel")];
  const validTab = (t) => tabBtns.some((b) => b.dataset.tab === t);
  function showTab(tab) {
    sessionStorage.setItem("previewTab", tab);
    if (("#" + tab) !== location.hash) history.replaceState(null, "", "#" + tab);
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    panels.forEach((p) => p.classList.toggle("active", p.dataset.tab === tab));
  }
  tabBtns.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  window.addEventListener("hashchange", () => {
    const t = location.hash.slice(1);
    if (validTab(t)) showTab(t);
  });
  const fromHash = location.hash.slice(1);
  // The front door is the fallback ONLY — hash wins, then the sticky tab. A
  // hot-reload session parked on Screens stays on Screens across every SSE
  // reload; only a genuinely fresh session lands on Overview.
  showTab(validTab(fromHash) ? fromHash : (sessionStorage.getItem("previewTab") || "overview"));
  // Approvals — POST /api/approve; a successful approve is confirmed by the
  // server's SSE "approval" broadcast above (which swaps the Approvals panel
  // in place), not by this handler mutating state itself — the two never race.
  // Wiring lives in a function because the SSE swap replaces the panel's DOM
  // and must re-attach these listeners to the fresh buttons.
  // The guided-flow prompt: every decision ends with "do you want to …?" —
  // the walk's next step offered as an action, never left to inference.
  // A hand-off to the agent is recorded as a COMMENT (the human→agent channel
  // of record — auditable, resolvable), never a hidden side-channel; a next
  // act that is the human's own jumps them to that artifact's signature bar.
  function showNextPrompt(whatNext) {
    if (!whatNext) return;
    document.querySelectorAll(".next-prompt").forEach((el) => el.remove());
    const bar = document.createElement("div");
    bar.className = "next-prompt";
    const head = document.createElement("span");
    head.className = "next-prompt-did";
    head.textContent = whatNext.did + ".";
    bar.appendChild(head);
    const dismiss = () => bar.remove();

    const mkBtn = (label, onClick, primary) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = primary ? "next-prompt-primary" : "next-prompt-dismiss";
      b.textContent = label;
      b.addEventListener("click", onClick);
      return b;
    };

    const next = whatNext.next;
    const pending = Array.isArray(whatNext.pending) ? whatNext.pending : [];
    if (next && next.owner && next.owner.indexOf("agent") === 0) {
      const q = document.createElement("span");
      q.textContent = " Next — " + next.label + ". Do you want to ask the agent to proceed?";
      bar.appendChild(q);
      bar.appendChild(
        mkBtn("Ask the agent to proceed", async () => {
          try {
            const res = await fetch("/api/comment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                target: { type: "general" },
                text: "Proceed" + (whatNext.feature ? " with " + whatNext.feature : "") + ": " + next.label,
              }),
            });
            const body = await res.json();
            head.textContent = body.ok
              ? "Requested — recorded in the comments ledger; a listening agent picks it up."
              : "Could not record the request: " + (body.reason || "refused");
            bar.querySelectorAll(".next-prompt-primary").forEach((el) => el.remove());
          } catch (err) {
            head.textContent = "Could not record the request: " + String(err);
          }
        }, true),
      );
    } else if (pending.length > 0) {
      const q = document.createElement("span");
      q.textContent = " Still waiting on you: " + pending[0].label + (pending.length > 1 ? " (+" + (pending.length - 1) + " more)" : "") + ".";
      bar.appendChild(q);
      bar.appendChild(
        mkBtn("Take me there", () => {
          const railBtn = document.querySelector('.rail-nav .tab-btn[data-tab="' + pending[0].tab + '"]');
          if (railBtn) railBtn.click();
          const target = document.querySelector('#tab-' + pending[0].tab + ' [data-artifact="' + pending[0].artifact + '"]');
          if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
          dismiss();
        }, true),
      );
    } else {
      const q = document.createElement("span");
      q.textContent = " Nothing else waits on you — everything is green.";
      bar.appendChild(q);
    }
    bar.appendChild(mkBtn("Not now", dismiss, false));
    document.body.appendChild(bar);
  }

  // A refusal must surface where the click happened. The approve/accept
  // controls now live on more than one panel (the front door's queue as well
  // as their owning sections), and the panel-scoped .sig-error box is found
  // first; the original single ids stay as the fallback so nothing regresses.
  function errBoxFor(btn, fallbackId) {
    const panel = btn.closest(".tab-panel");
    return (panel && panel.querySelector(".sig-error")) || document.getElementById(fallbackId);
  }
  function wireApproveButtons(scope) {
  scope.querySelectorAll(".approve-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const artifact = btn.dataset.artifact;
      const errBox = errBoxFor(btn, "approve-error");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Approving…";
      try {
        // WHO is signing. Asked once per session and kept in sessionStorage —
        // not localStorage, because a signature should be a deliberate act by
        // whoever is at the keyboard now, not a name a browser remembers
        // forever. Cancelling declines to sign, which is a valid answer.
        let approvedBy = sessionStorage.getItem("approvalSigner") || "";
        if (!approvedBy) {
          approvedBy = (window.prompt("Sign this approval as (name and email) — recorded on the approval:", "") || "").trim();
          if (!approvedBy) {
            if (errBox) { errBox.hidden = false; errBox.textContent = "not signed — an approval records who signed it"; }
            btn.disabled = false;
            btn.textContent = original;
            return;
          }
          sessionStorage.setItem("approvalSigner", approvedBy);
        }
        const res = await fetch("/api/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artifact, approvedBy }),
        });
        const body = await res.json();
        if (!body.ok) {
          if (errBox) { errBox.hidden = false; errBox.textContent = body.reason || "approval refused"; }
          btn.disabled = false;
          btn.textContent = original;
        } else {
          showNextPrompt(body.whatNext);
        }
      } catch (err) {
        if (errBox) { errBox.hidden = false; errBox.textContent = String(err); }
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
  }
  wireApproveButtons(document);
  // Feature acceptance — POST /api/feature/accept; confirmed by the server's
  // SSE "approval" broadcast (the Features panel swaps in place), same
  // no-self-mutation contract as approve/reopen. Refusals (checks failing,
  // not delivered, older project lib) surface in #feature-error verbatim.
  function wireFeatureAcceptButtons(scope) {
  scope.querySelectorAll(".feature-accept-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.dataset.name;
      const errBox = errBoxFor(btn, "feature-error");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Accepting…";
      try {
        const res = await fetch("/api/feature/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const body = await res.json();
        if (!body.ok) {
          if (errBox) { errBox.hidden = false; errBox.textContent = body.reason || "acceptance refused"; }
          btn.disabled = false;
          btn.textContent = original;
        } else {
          showNextPrompt(body.whatNext);
        }
      } catch (err) {
        if (errBox) { errBox.hidden = false; errBox.textContent = String(err); }
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
  }
  wireFeatureAcceptButtons(document);
  // Reopen (§2/§3) — POST /api/reopen; confirmed the same way approve is: the
  // server's SSE "approval" broadcast (reopen reuses that event type — it's
  // still just "an artifact's status changed", the same in-place refresh
  // covers both) swaps the Approvals panel, not this handler. An older
  // project lib without reopenArtifact surfaces its refusal in #approve-error
  // — never a crash (GENESIS-FLOW-DESIGN.md §3 "honest degrade").
  function wireReopenButtons(scope) {
  scope.querySelectorAll(".reopen-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const artifact = btn.dataset.artifact;
      // A reopen walks back a signature, so it carries a reason the signer can
      // read from the ledger later (07-28 audit). Cancel = no transition.
      const reason = window.prompt("Reopen " + artifact + " — why, in one sentence?\\n(Recorded on the ledger and in the journal.)");
      if (reason === null || reason.trim() === "") return;
      const errBox = errBoxFor(btn, "approve-error");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Reopening…";
      try {
        const res = await fetch("/api/reopen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artifact, reason: reason.trim() }),
        });
        const body = await res.json();
        if (!body.ok) {
          if (errBox) { errBox.hidden = false; errBox.textContent = body.reason || "reopen refused"; }
          btn.disabled = false;
          btn.textContent = original;
        } else {
          showNextPrompt(body.whatNext);
        }
      } catch (err) {
        if (errBox) { errBox.hidden = false; errBox.textContent = String(err); }
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
  }
  wireReopenButtons(document);
  // Pick (§2 candidates strip) — POSTs the EXISTING /api/comment endpoint with
  // target {type:"design-system", token:"variant:<name>"}, text "pick:<name>"
  // — no new decision machinery; the agent observes it via
  // review_comments{waitForComment}. The token field is REQUIRED by the §7.3
  // comments contract for design-system targets (the gate proved the library
  // refuses a token-less pick with 409); "variant:<name>" is the synthetic
  // token id for a candidate, mirroring the "component:<Name>" convention. A
  // successful pick is confirmed by the same "comment" SSE broadcast every
  // other comment produces (refreshes the Comments tab + badge); this handler
  // just gives immediate button feedback so the human isn't left guessing.
  function wirePickButtons(scope) {
  scope.querySelectorAll(".pick-btn").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", async () => {
      const name = btn.dataset.variant;
      const errBox = document.getElementById("pick-error");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Picking…";
      try {
        const res = await fetch("/api/comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: { type: "design-system", token: "variant:" + name }, text: "pick:" + name }),
        });
        const body = await res.json();
        if (!body.ok) {
          if (errBox) { errBox.hidden = false; errBox.textContent = body.reason || "pick refused"; }
          btn.disabled = false;
          btn.textContent = original;
        } else {
          btn.textContent = "Picked";
        }
      } catch (err) {
        if (errBox) { errBox.hidden = false; errBox.textContent = String(err); }
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
  }
  wirePickButtons(document);
  // Arrivals (walk-legibility L5) — the In-flight block's now-or-after choice.
  // Same contract as wirePickButtons: POST the EXISTING /api/comment endpoint
  // with a general-target comment the agent observes via
  // review_comments{waitForComment}. No new decision machinery, no new state —
  // the button records the human's answer where agent instructions already
  // flow, and the walk itself stays a pure projection.
  function wireArrivalButtons(scope) {
  scope.querySelectorAll(".wk-arrival-btn").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", async () => {
      const id = btn.dataset.arrival;
      const choice = btn.dataset.choice === "now" ? "handle it now" : "handle it after the current walk lands";
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Sending…";
      try {
        const res = await fetch("/api/comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: { type: "general" }, text: "arrival " + id + ": " + choice }),
        });
        const body = await res.json();
        if (!body.ok) {
          btn.disabled = false;
          btn.textContent = original;
        } else {
          btn.textContent = "Sent to the agent";
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
  }
  wireArrivalButtons(document);
  // Comments (§7.3) — every 💬 control (screens, spec clauses, tokens,
  // components, architecture nodes) opens the same inline popover and POSTs
  // to /api/comment; a successful post is confirmed by the server's SSE
  // "comment" broadcast (which refreshes the Comments tab + badge in place),
  // not by this handler — same non-racing split as wireApproveButtons.
  // dataset.wired guards against double-binding across repeated calls
  // (initial load + no-op re-scans of the same, never-swapped card markup).
  function wireCommentButtons(scope) {
    scope.querySelectorAll(".comment-ctl").forEach((ctl) => {
      const btn = ctl.querySelector(".comment-btn");
      const pop = ctl.querySelector(".comment-popover");
      if (!btn || !pop || btn.dataset.wired) return;
      btn.dataset.wired = "1";
      btn.addEventListener("click", () => { pop.hidden = !pop.hidden; });
      const cancelBtn = pop.querySelector(".comment-cancel");
      if (cancelBtn) cancelBtn.addEventListener("click", () => { pop.hidden = true; });
      const submitBtn = pop.querySelector(".comment-submit");
      if (submitBtn) submitBtn.addEventListener("click", async () => {
        const textEl = pop.querySelector(".comment-text");
        const ttEl = pop.querySelector(".comment-testtag");
        const errEl = pop.querySelector(".comment-error");
        if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
        let target;
        try { target = JSON.parse(ctl.dataset.target); } catch { target = { type: "general" }; }
        if (ttEl && ttEl.value.trim()) target = { type: "element", screen: target.screen, testTag: ttEl.value.trim() };
        submitBtn.disabled = true;
        try {
          const res = await fetch("/api/comment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target, text: textEl ? textEl.value : "" }),
          });
          const body = await res.json();
          if (!body.ok) {
            if (errEl) { errEl.hidden = false; errEl.textContent = body.reason || "comment refused"; }
          } else {
            pop.hidden = true;
            if (textEl) textEl.value = "";
            if (ttEl) ttEl.value = "";
          }
        } catch (err) {
          if (errEl) { errEl.hidden = false; errEl.textContent = String(err); }
        } finally {
          submitBtn.disabled = false;
        }
      });
    });
  }
  wireCommentButtons(document);
  // A1 — the Start-live-session chain: POST kicks it off server-side; the page
  // then polls /live/status and reloads when the chain finishes (success or
  // fail — either way the section re-renders the honest per-step outcomes).
  const liveBtn = document.getElementById("live-start-btn");
  if (liveBtn) {
    liveBtn.addEventListener("click", async () => {
      const errBox = document.getElementById("live-error");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
      liveBtn.disabled = true;
      liveBtn.textContent = "Starting…";
      try {
        const res = await fetch("/live/start", { method: "POST" });
        const body = await res.json();
        if (!body.started) throw new Error(body.reason || "did not start");
        const poll = setInterval(async () => {
          try {
            const st = await (await fetch("/live/status")).json();
            if (!st.running) { clearInterval(poll); location.reload(); }
          } catch { /* transient poll failure — keep polling */ }
        }, 2000);
      } catch (err) {
        liveBtn.disabled = false;
        liveBtn.textContent = "Start live session";
        if (errBox) { errBox.hidden = false; errBox.textContent = String(err); }
      }
    });
  }
`;

  // Sections that need the render pipeline are absent — not empty, not
  // greyed — when there is no Compose app to render. Everything else derives
  // from qa/ and stays. One quiet rail line says what is absent and why, so the
  // reader never wonders whether Screens failed to load.
  const railFootPlain = `<button type="button" class="tab-btn" data-tab="evidence" title="open Evidence">${railReceiptHtml(effectiveReceipt)}</button>`;
  // Sections that need a Compose app to mean anything. `design-system` joined
  // screens and live-device on 2026-09-07: a design LANGUAGE is Theme.kt and
  // Tokens.kt, and a service with no UI was being shown a visual vocabulary it
  // does not have — the console being honest about its own defaults rather than
  // about the project. This is the fallback for a project that declares no
  // sections; a profile that declares them gets exactly what it declared.
  const NEEDS_SCREENS = new Set(["screens", "live-device", "design-system"]);
  // The declaration comes first: it says which sections this project HAS.
  // Capability filtering then removes what it cannot show — a project may
  // declare Screens and still not have a Compose app to render, and that stays
  // an absence with a stated reason rather than a contradiction. An id declared
  // but unknown to this console is dropped rather than invented, because a rail
  // entry leading to an empty panel is the dishonesty this whole section fights.
  const declared = Array.isArray(declaredSectionIds) && declaredSectionIds.length ? declaredSectionIds : null;
  const pick = (items) => (declared ? declared.map((id) => items.find((x) => x.id === id)).filter(Boolean) : items);
  const declaredRail = pick(railItems);
  const declaredSections = pick(sections);
  const visibleRail = capabilities.screens ? declaredRail : declaredRail.filter((r) => !NEEDS_SCREENS.has(r.id));
  const visibleSections = capabilities.screens ? declaredSections : declaredSections.filter((s) => !NEEDS_SCREENS.has(s.id));
  const capabilityNote = capabilities.screens
    ? ""
    : `<p class="rail-sub rail-capability" title="This project declares no screen-rendering capability. The governance window is complete; screens, preview and the live device all need one.">governance only &middot; ${consoleCopy().noRenderableApp}</p>`;
  // The layout line: which manifest (if any) the console is reading this
  // project through. A refused manifest is said out loud on the rail — every
  // section it feeds already carries the reason, but the rail is where a
  // reader looks first when a pane is unexpectedly empty.
  const layoutNote = !layout
    ? ""
    : !layout.ok
      ? `<p class="rail-sub rail-capability rail-layout-refused" title="${escAttr(layout.reason || "")}">${esc(layout.relPath || MANIFEST_REL_PATH)} refused &mdash; see Evidence</p>`
      : layout.source === "manifest"
        ? `<p class="rail-sub rail-capability" title="${escAttr(`layout from ${layout.relPath}: receipt ${layout.layout.receipt}; specs ${layout.layout.specs}/; doc ${layout.layout.architectureDoc}`)}">layout: ${esc(layout.relPath)} &middot; packs ${esc((layout.layout.packs || []).join(", "))}</p>`
        : "";

  return renderShellPage({
    appName,
    railItems: visibleRail,
    railFootHtml: `${capabilityNote}${layoutNote}${railFootPlain}`,
    // The governance strip (07-28 audit, fix 5): counts + the one next human
    // act + recent history, rail-resident so it is visible on EVERY tab. Its
    // queue is the SAME deriveHumanQueue the guided prompt uses — one
    // derivation, so the strip and the prompt can never disagree.
    govStripHtml: governanceStripHtml({
      statuses: approvals.available ? approvals.statuses : [],
      features: features.available ? features.board.features : [],
    }),
    // §3.6: the rail-foot verify line doubles as the deep link to Evidence —
    // the same .tab-btn/data-tab wiring the nav items use (showTab picks it
    // up with no new JS mechanism), styled back to a quiet meta line by the
    // shell's .rail-foot .tab-btn rules.
    sections: visibleSections,
    error,
    // FI-9 Change B: the renderer's OWN health banner, additive to `error`
    // above (which already covers "last render/compile/reload FAILED" as a
    // point-in-time message) — this one survives a LATER unrelated
    // compile-check message overwriting `error`/`errorSource`, and states
    // since-when the (possibly stale) screens below stopped refreshing.
    rendererDown: renderer && renderer.lastOutcome === "failed" ? { ...renderer, lastError: rendererLastErrorText } : null,
    // The freshness banner sits ABOVE the renderer/error banners: "are these pixels
    // current" is the first thing a reader needs, before why they might not be.
    freshness,
    // §3.4 geometry from the render viewport: uniform cell width keeps the
    // matrix's columns aligned without a shared grid; the expanded wireframe
    // gets the roomier single-pane width.
    extraCss: `  .matrix-cell img, .matrix-cell.matrix-none { width: ${Math.round(width * 0.38)}px; }
  .matrix-col { width: ${Math.round(width * 0.38)}px; }
  .row-detail .wire svg { width: ${Math.round(width * 0.7)}px; }
  /* PW-5 surfaces: walkthrough grid, live-device embed, digest lists, B5 diff */
  .wt-grid { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 10px; }
  .wt-card { width: 210px; }
  .wt-card img { width: 100%; border-radius: 8px; border: 1px solid var(--line); }
  .wt-meta { font-size: var(--fs-meta); color: var(--muted); margin-top: 4px; }
  .wt-notwalked li, .wt-history li, .digest-list li { font-size: var(--fs-meta); color: var(--muted); margin: 3px 0; }
  .ok-inline { color: var(--ok, #7dc87d); }
  .bad-inline { color: var(--err, #d07d7d); }
  .live-remote { width: 100%; height: 72vh; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
  .live-steps li { font-size: var(--fs-meta); margin: 3px 0; }
  .live-step-ok { color: var(--ok, #7dc87d); }
  .live-step-fail { color: var(--err, #d07d7d); }
  .live-step-running { color: var(--muted); }
  #live-start-btn { font: inherit; font-size: var(--fs-meta); font-weight: 600; padding: 8px 16px; cursor: pointer; }
  .approval-diff { max-height: 420px; overflow: auto; font-size: 12px; background: var(--surface); border-radius: 8px; padding: 10px; }
  .approval-diff-row td { border-top: none; }`,
    bodyScript,
    provenance: { treeHash, version, build },
    // The console's own build handshake — drives the stale banner above every
    // page. galleryHtml's caller passes the live value; absent (older callers,
    // tests that render a bare page) renders no banner rather than a fake one.
    build,
  });
}
