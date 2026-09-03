# Cross-stack console — proposal of record

**Status:** items 1–2 landed (2026-09-03, `feat/console-project-manifest`); items 3–4 are
roadmap, not scheduled. Source: the payment-blueprint session's findings after adopting the
spine (c00fa67), relayed with Karel's ask — "make the plugin work the same way across the
stack".

## The finding

The 0.19.0 spine/pack split reached `verify.mjs` but not the console. The console knew one
layout — a create-cmp Compose app's — as constants: `qa/evidence/latest.json`,
`docs/ARCHITECTURE.md`, `specs/`, citations under `composeApp/src` and `qa/e2e`, and a Compose
clause grammar. Against payment-blueprint (receipt at `qa/evidence/receipt.json`,
`ARCHITECTURE.md` at the root, `### ID — title` clauses, Kotlin under `services/`) the Evidence
pane, verdict history, audit trail, digest, Architecture page and Specs page each reported an
honest-looking absence about a file that existed. Same class as the verified-surface bug
(evidence-economics S8): spine code hardcoding one project's layout and degrading quietly.

## What landed

1. **Project manifest** — `qa/harness-manifest.json` (`inspector/mcp/src/lib/project-layout.mjs`):
   receipt, architectureDoc, specs, citationRoots, approvals, packs. Compose default; manifest
   overrides field by field; a malformed manifest is refused with every problem named, never
   defaulted. Every console reader (receipt bridge, history, digest, specs, architecture, the
   governance watchers, `/status`, the rail) resolves through it.
2. **Layer-tagged receipt rows** — `fn.layer` on a step function is stamped onto the row by
   `lane-runner.mjs`; the Evidence page groups per layer with a tally. Untagged receipts are
   unchanged. The Compose pack tags `spine` / `compose` / `device`.

Plus, found on the way: the Specs page bridges to the project's own `qa/lib/spec-coverage.mjs`
(its grammar, its binding rule) instead of forking a second grammar into the console; the
receipt bridge reads the flat `inputsHash`/`gitSha`/`timestamp` spelling; approvals-bridge
refusals name "a pack that does not govern this" beside "an older scaffold".

## Roadmap (not built — needs a decision and a trigger)

3. **`describe()` on the pack contract**, beside `createXSteps(ctx)`: step → spec files → layer
   → report artifacts. The console would render any pack from that with zero pack-specific code
   — the structural fix for "a fourth stack breaks the console the way the second did". Today
   the manifest + layer tags cover the same ground declaratively; `describe()` earns its keep
   when a pack has per-step report artifacts the console should link (JUnit XML, SBOMs).
4. **Per-layer inspectors as MCP servers** on the Compose inspector's principle (structured
   JSON, never screenshots): api-inspector (OpenAPI + live routes + DI graph), db-inspector
   (`information_schema` + policies), infra-inspector (`terraform show -json`). Each layer pack
   needs a Rule-1 planted proof (docs/GATE-RULES.md): drop one RLS policy → red; one
   unbalanced ledger leg → red; rename an OpenAPI field → red; open a port in a plan → red;
   SBOM/vuln ratchet.

   The showcase-specific pane worth designing here: a **PCI control matrix rendered from
   evidence** — each CODE control cites the gate enforcing it and the console renders
   "B7: archTests ARCH-11 PASS, receipt d79ab32f". Compliance as a receipt.

## Notes the adopter left for the spine's contract

- `sh()` with `shell:true` is RCE in a lane whose Gradle args derive from repository paths; the
  pack `ctx` seam lets an adopter keep its own `sh` — **the seam is load-bearing, keep it.**
- `evidence-level.mjs`'s ladder is Compose step names; vendored into a backend it grades the
  strongest run L0. Not adopted there. A layer-aware ladder is open.
- The flight recorder must be excluded from the harness lock region and from working-tree
  change detection (`affected-tests`), or every run fails integrity / `--fast` falls open.
- A surface allowlist silently leaves a new top-level directory unattested; the blueprint
  added a test that every top-level entry `git ls-files` sees is declared. Worth a spine test.

## Seams — the one new kind of proof (recorded 2026-09-03, not built)

Everything above scales a per-part lane. A multi-part repo has a proof no part owns: the
**seam** — the contract between two units (BFF ↔ service, app ↔ API, service ↔ schema). It is
where agents break things silently: a response field renamed on the producer compiles on the
consumer. The rule, when a second unit exists in the same lane, is Principle 3 applied across
parts: **a seam's proof runs when either side changes and belongs to neither side's pack.**
Industry forms of that proof exist and need no invention — consumer-driven contract tests,
an OpenAPI/protobuf additive-only diff, a schema-migration golden. One worked seam in the
blueprint (its HTTP surface, additive-only golden, planted rename → red) is the trigger to
make seams a declared object; until then this paragraph is the record.

## The three defects the adoption found in the spine — closed 2026-09-03

- `qa/flight-recorder.jsonl` counted as a working-tree change (the qa/** hatch), so `--fast`
  fell open to the full suite after the first run — in every Compose app. Now a lane output
  (`affected-tests.mjs`), pinned by a planted test.
- The evidence ladder was Compose step names inside the spine. Now the pack's
  (`createCmpSteps` returns `evidenceLadder`); a pack that declares none earns no rung.
- A new top-level directory was silently unattested by the surface allowlist. The receipt now
  carries `inputs.undeclared` and the lane prints it — a report, never a gate, because the
  Compose default deliberately omits docs/, the README and the wrapper.
- Found while deriving the first: a smoke run rewrote the README's evidence badge from a true
  L1 to "rung unrecorded". Smoke and nightly receipts now leave the badge alone, like `--fast`.
