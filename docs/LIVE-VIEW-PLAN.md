# Live View — plan of record (founder priority: ALL THREE are must-haves)

> **Status:** committed direction (2026-07-03), builds start the moment Inspector Phase 2 lands
> (shared files). Goal: Android-Studio-grade *seeing* inside the Claude Code workflow — preview,
> live device view with navigation, and an interactive hot-reload dev loop.
>
> **Architecture rule that makes this compatible with structured-only AI vision: pixels flow to
> the HUMAN, structure flows to the AI.** Screenshots/previews are piped straight from the app to
> the user's screen (data-URI / local page) and never enter model context; the agent keeps
> asserting on the semantics-tree JSON from the same render. Same source, two audiences.

## Track A — Screen preview (the @Preview equivalent) — ~1 day

- Harness: `ImageComposeScene.render()` → `--png <out>` flag (pixels were always available; we
  only used the tree until now).
- MCP: `render_screen` tool → renders headlessly, returns the PNG path + embeds for display; pairs
  with `render_tree` (the SVG wireframe, already committed direction) so every preview can carry
  its structural twin.
- Claude Code display: data-URI embed in a widget/page; the model never reads the pixels.
- Later (not day-one): per-composable preview registry (Studio-@Preview parity) — scan
  preview-annotated functions in the generated app.

## Track B — Live device view + navigation (the Running Devices equivalent) — ~3–4 days after Phase 2

Rides on Phase 2's in-app debug server (port 9500, adb forward):
- `GET /inspect/screenshot` — PixelCopy/drawToBitmap of the ComposeView → PNG (debug builds only,
  loopback only, same guardrails as the tree route).
- Tap bridge — MCP shells `adb shell input tap <x> <y>` (bounded, host-side; no new app surface).
- **Remote-control page** (~150 lines, served locally / opened via Claude Code preview tooling):
  polls the screenshot, click on the image → scaled coords → tap → app navigates → next poll shows
  the new screen. Human navigates the real app from the browser; agent watches the tree change.
- MCP `navigate_and_inspect` convenience: tap a testTag (coords resolved FROM the tree), wait,
  re-fetch tree — the agent-side navigation primitive (no pixels needed).

## Track C — Desktop dev-client + Compose Hot Reload (the daily-driver loop) — ~2–3 days, independent

- Pre-wired JVM run target for the generated app (`commonMain` UI in a desktop window, DI fakes for
  platform actuals) + Compose Hot Reload configured — edit code, watch the window update live.
- Research-validated: JetBrains' docs prescribe hand-assembling exactly this; nobody automates it;
  a paid Android-only plugin proves demand.
- Doubles as the host for Track A's renderer and the inspector's Tier 0 (one module, three jobs).
- Ships as a template module + `create-cmp add dev-client` for existing apps.

## The verified dev loop (the product's core workflow — not just the demo)

The demo sequence IS the daily development cycle. For any UI change in a create-cmp app:

1. **Snapshot** — `snapshot_save` the current tree (live source) before editing.
2. **Prompt → edit** — Claude changes the code.
3. **Watch it change** — hot reload (dev-client) or reinstall (device); the human sees it in the
   window / live view.
4. **Prove it** — `prove_change { before: snapshot, after: live }` → one call returns the
   structural diff (what actually changed), plus design-token drift and a11y regressions on the
   after-state, with a verdict: `proven-clean` / `changed-with-regressions` / `no-change`.
5. **Show it** — the structural diff is the proof-of-done; `render_tree` gives the human the
   after-state wireframe.

**A change without a `prove_change` verdict is not done.** This encodes the observe-don't-assume
discipline into the tooling itself: the agent never claims "I changed it" — it demonstrates the
change from the rendered tree, and demonstrates that nothing else regressed.

## Sequencing

1. Phase 2 lands (in flight) → commit.
2. Track A + Track C launch in parallel (disjoint files: harness/MCP vs template JVM module).
3. Track B immediately after (extends Phase 2's server).
4. Fold into `cmp-inspect` skill + demo assets: the flagship demo becomes
   *scaffold → window opens → talk to Claude → watch it change → Claude proves it from the tree.*
