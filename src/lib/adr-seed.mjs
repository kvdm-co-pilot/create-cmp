// adr-seed.mjs — deterministic ADR auto-seeding from configuration decisions
// (Wave D, docs/proposals/architecture-document-standard.md §5 step 6 +
// GENESIS-FLOW-DESIGN.md §5: "Every configuration made ... that changed the
// shape gets an auto-seeded ADR ... decisions recorded at the moment they're
// made, in Nygard form, by the agent.").
//
// WHERE THE MECHANICS BELONG — an engine hook, not a SKILL.md instruction:
// by the time `scaffold()` runs, every decision this module records (room,
// platforms.ios, firebase.auth) is already FIXED in the validated config —
// the cmp-new interview (skills/cmp-new/SKILL.md §1) collects them BEFORE
// the engine is shelled out to (§2/§3), exactly like `config.tabs` is fixed
// before `rewriteTabSurfaces` (src/lib/tabs.mjs) runs. That precedent is the
// reason this lives here: a config-driven decision that's fully knowable at
// stamp time is regenerated deterministically by the pipeline (no LLM in the
// hot path — see scaffold.mjs's header comment), not left for a post-scaffold
// agent conversation to author freehand (which risks the wording, numbering,
// or presence of the record varying run to run for the identical config).
// The genesis architecture conversation (SKILL.md §7.2) then WALKS these
// already-seeded records — "the real decisions already baked into the
// scaffold" — instead of drafting them from scratch.
//
// ORDERING REQUIREMENT: this must run BEFORE scaffold.mjs's regenerateArchDoc
// step so the stamped project's OWN arch-doc.mjs adr-index walker (which
// scans docs/adr/*.md at stamp time) picks the seeded ADRs up in the same
// pass that freshens the rest of the doc — see scaffold.mjs call site.

import fs from "node:fs";
import path from "node:path";

const ADR_DIR_REL = "docs/adr";

/**
 * Render one ADR file's full markdown body, mirroring the shape of
 * template/docs/adr/template.md and the four shipped ADRs (heading, Status/
 * Date, Context/Decision/Consequences).
 * @param {number} number
 * @param {string} title
 * @param {{context:string, decision:string, consequences:string}} body
 * @param {string} dateIso YYYY-MM-DD
 */
function renderAdr(number, title, body, dateIso) {
  const id = String(number).padStart(4, "0");
  return (
    `# ADR-${id}: ${title}\n\n` +
    `- **Status:** accepted\n` +
    `- **Date:** ${dateIso}\n\n` +
    `## Context\n\n${body.context}\n\n` +
    `## Decision\n\n${body.decision}\n\n` +
    `## Consequences\n\n${body.consequences}\n`
  );
}

// Decisions considered, IN THIS ORDER — fixes the numbering deterministically
// for a given config (persistence, then platform scope, then auth, matching
// the order named in the Wave D brief). Each rule fires only when the config
// DEVIATES from the interview's documented default (SKILL.md §1: platforms.ios
// true, room true, firebase.auth "both") — matching every default seeds
// nothing beyond the shipped four; only a genuine choice gets a record.
const DECISION_RULES = [
  {
    id: "persistence",
    applies: (config) => config.room === false,
    title: () => "No local Room persistence",
    render: () => ({
      context:
        "The interview default ships a Room on-device cache as the local single source of " +
        "truth (`data/local/AppDatabase.kt`, `ItemDao.kt`) so screens keep rendering the last " +
        "known data offline (`docs/ARCHITECTURE.md` §1's offline reliability goal, §3, §7 " +
        "Persistence policy). This app's scaffold config explicitly turned that off " +
        "(`room: false`) during the cmp-new interview — a deliberate choice that the local-" +
        "persistence layer, its expect/actual wiring, and its DI registration are not part of " +
        "this app's shape.",
      decision:
        "We will not ship Room local persistence. `data/local/` and its platform actuals are " +
        "excluded from the stamped tree; repositories talk to their remote/in-memory source " +
        "directly, with no on-device cache.",
      consequences:
        "- No offline read path: a network failure surfaces as a typed `DomainError`, not " +
          "cached data — the offline reliability goal in `docs/ARCHITECTURE.md` §1 does not " +
          "apply to this app.\n" +
        "- One less moving part: no schema/migration to own, no Room KSP compilation step.\n" +
        "- Reversing this later is a real re-scope, not a flag flip: adding Room back means " +
          "writing `AppDatabase`/DAO/`DatabaseBuilder` expect/actuals and a cache-first " +
          "repository branch — the harness's own `data/local/` is the reference shape to " +
          "restore from.",
    }),
  },
  {
    id: "platform-scope",
    applies: (config) => config.platforms?.ios === false,
    title: () => "Android-only launch scope (iOS deferred)",
    render: () => ({
      context:
        "create-cmp scaffolds Android and iOS from one Kotlin Multiplatform codebase by " +
        "default (`platforms.ios: true`). This app's scaffold config turned iOS off " +
        "(`platforms.ios: false`) during the cmp-new interview — a deliberate scope decision " +
        "for launch, not a technical limitation of the template.",
      decision:
        "We will launch Android-only. The `iosApp` shell, the `iosMain` source set, and every " +
        "iOS-only `actual` are excluded from the stamped tree; `composeApp` builds and ships " +
        "for Android only.",
      consequences:
        "- Nothing in `commonMain` is exercised against an iOS target today — a future iOS " +
          "add-back may surface platform gaps the Android-only period never caught.\n" +
        "- Adding iOS later is additive, not a rewrite: the shared `commonMain` tree (domain, " +
          "most of presentation) carries over unchanged; only the platform shell and its " +
          "actuals need scaffolding — the harness's own `iosApp/` + `iosMain/` is the " +
          "reference shape.\n" +
        "- The verify lane's iOS build step never runs for this app until this ADR is " +
          "superseded.",
    }),
  },
  {
    id: "auth-scope",
    applies: (config) => config.firebase?.enabled === true && !!config.firebase?.auth && config.firebase.auth !== "both",
    title: (config) => `Auth scope: ${config.firebase.auth}`,
    render: (config) => {
      const auth = config.firebase.auth;
      const chosen = auth === "none" ? "no Firebase Auth wiring at all" : `Firebase Auth's **${auth}** sign-in method only`;
      return {
        context:
          "The interview default wires both Firebase Auth sign-in methods (email + phone) " +
          `behind the GitLive KMP SDK (\`firebase.auth: "both"\`). This app's scaffold config ` +
          `chose \`firebase.auth: "${auth}"\` during the cmp-new interview — a deliberate scope ` +
          "decision for this app's actual auth needs, not the interview's default.",
        decision: `We will wire ${chosen}. Auth call sites and DI registration reflect this scope; the other sign-in method's wiring is not stamped.`,
        consequences:
          "- Auth-related code stays scoped to what this app actually needs — no dead sign-in " +
            "path to maintain or test.\n" +
          "- Adding another sign-in method later needs its own genesis-equivalent work " +
            "(Firebase console configuration + the GitLive SDK call sites for that method) — " +
            "this ADR is the record of why it wasn't there from day one.",
      };
    },
  },
];

/**
 * Seed one project ADR per configuration decision that deviates from the
 * interview default, numbered after whatever ADRs the template already
 * ships (the four shipped ones on a stock template — computed from the
 * tree, never hardcoded, so a template that ships a different count still
 * numbers correctly).
 * @param {string} projectDir
 * @param {object} config the validated, resolved engine config
 * @param {(msg: string) => void} [log]
 * @returns {{seeded: Array<{id:string, file:string, title:string}>}}
 */
export function seedConfigAdrs(projectDir, config, log = () => {}) {
  const adrDir = path.join(projectDir, ADR_DIR_REL);
  if (!fs.existsSync(adrDir)) return { seeded: [] }; // no docs/adr/ shipped (e.g. a synthetic test template) — nothing to seed into

  const existing = fs
    .readdirSync(adrDir, { withFileTypes: true })
    .filter((e) => e.isFile() && /^\d{4}-/.test(e.name))
    .map((e) => Number.parseInt(e.name.slice(0, 4), 10));
  let nextNumber = (existing.length > 0 ? Math.max(...existing) : 0) + 1;

  const dateIso = new Date().toISOString().slice(0, 10);
  const seeded = [];

  for (const rule of DECISION_RULES) {
    if (!rule.applies(config)) continue;
    const number = nextNumber++;
    const title = rule.title(config);
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const fileName = `${String(number).padStart(4, "0")}-${slug}.md`;
    const body = rule.render(config);
    fs.writeFileSync(path.join(adrDir, fileName), renderAdr(number, title, body, dateIso));
    log(`  seeded docs/adr/${fileName} — ${title}`);
    seeded.push({ id: rule.id, file: fileName, title });
  }

  return { seeded };
}
