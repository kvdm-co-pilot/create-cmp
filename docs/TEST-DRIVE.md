# create-cmp — founder test drive

> The hands-on pass before publishing. Everything below is already machine-verified (204 engine +
> 94 MCP tests, stamp-gate matrix, live emulator E2E, a real verified-dev-loop run) — this
> checklist is about how it *feels*. Note friction, wording, and wow-moments; those are the
> publish blockers now, not correctness. Budget: ~90 minutes for the full pass.

## 0. Setup (2 min)

```bash
cd ~/dev/create-cmp && git pull
```

Everything runs from the repo (npm publish is intentionally parked until after this pass).
For the Claude Code plugin experience: `/plugin marketplace add kvdm-co-pilot/create-cmp` →
`/plugin install create-cmp` (8 skills + the cmp-inspector MCP).

## 1. Scaffold → green (the north star) (~10 min)

```bash
node bin/create-cmp.mjs ~/dev/testdrive-app \
  --name TestDrive --package com.testdrive.app --no-ios --yes --verify
```

- [ ] Interview/flags feel right; `--verify` ends in a **GREEN** verdict, not a claim.
- [ ] Stamped app has: `.gitignore`, `.github/workflows/verify.yml`, `docs/dev-client.md`,
      inspector under `androidDebug/`, desktop target, Maestro E2E harness.
- [ ] Time-to-green felt: note the wall-clock.

## 2. The dev-client (Track C) (~10 min)

```bash
cd ~/dev/testdrive-app
./gradlew :composeApp:run                      # plain window
./gradlew :composeApp:hotRunDesktop --auto     # hot reload (auto-recompile on save)
```

- [ ] Phone-sized window opens with the shared UI (Firebase never initializes on desktop).
- [ ] With `hotRunDesktop --auto` running: edit `HomeScreen.kt` (change the title), save —
      the window updates without restart.

## 3. Live inspection + live view (Tracks 1/B) (~15 min)

Boot an emulator, then `./gradlew :composeApp:installDebug`, launch the app, and:

```bash
adb forward tcp:9500 tcp:9500
curl -s http://127.0.0.1:9500/inspect/health
open http://127.0.0.1:9500/inspect/remote     # the live device view
```

- [ ] **Remote page**: you see the real device; clicking the image taps the device; navigate
      into a card and back by clicking.
- [ ] In Claude Code (plugin installed): ask *"inspect the running app"* → `connect_live` →
      `inspect_tree` shows the structured tree; ask *"render the wireframe"* → SVG.
- [ ] Ask *"is this screen a11y-clean?"* → `audit_a11y` on the live tree.

## 4. The verified dev loop (the product's core workflow) (~15 min)

In Claude Code, with the debug app running and connected, prompt something like:

> "Change the Home title to 'Welcome' and prove it."

- [ ] The agent snapshots first, edits, rebuilds/reinstalls, then runs **`prove_change`** and
      reports the verdict (`proven-clean`) with the exact structural diff — not just "done".
- [ ] The claim matches what you see on the device / remote page.

## 5. Maintain commands (any KMP project) (~10 min)

```bash
node <repo>/bin/create-cmp.mjs doctor            # inside testdrive-app: toolchain + project diagnosis
node <repo>/bin/create-cmp.mjs upgrade --dry-run # lockstep diff vs the proven-green set
node <repo>/bin/create-cmp.mjs clean --dry-run   # konan/build hygiene report
node <repo>/bin/create-cmp.mjs verify            # the green-build gate, standalone
```

- [ ] Try `doctor` on UPLYFT too — it should diagnose a project it didn't scaffold.
- [ ] `upgrade --dry-run` output reads as trustworthy (diff table + set notes + nothing written).

## 6. cmp-firebase-connect (the one cloud step — YOUR consent) (~10 min)

In Claude Code: *"connect this app to firebase"*. The skill will show every command before
running it; project creation is the one real cloud write (Spark plan, no billing).

- [ ] Consent gating feels right (nothing runs un-shown).
- [ ] Real `google-services.json` lands; `assembleDebug` goes green with it.
- [ ] The console-only steps (Auth providers, Storage bucket) are clearly called out.

## 7. cmp-test — the suite writes itself (~10 min)

With the app running + connected: *"generate a regression suite for this app"*.

- [ ] Generated tests use testTag/id selectors (they work out of the box — the shim exposes
      tags as resource-ids), match the shipped harness style, and run via the Maestro harness.

## 8. Meta-quality (~5 min)

- [ ] README reads like a product you'd adopt; the 8 skills are discoverable in `/plugin`.
- [ ] CI on GitHub is green (engine + Android per push; iOS parked by design).
- [ ] Anything that made you hesitate → write it down; that list = the pre-publish punch list.

## When you're satisfied

Say the word and the release flow runs: `npm publish` (your OTP) → registry verify → tag +
GitHub release → the announcement wave per `docs/GROWTH-STRATEGY.md`.
