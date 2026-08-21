# Agent instructions

This repository is agent-first. The full working contract — the definition of done
(`node qa/verify.mjs` must PASS), the architecture gates, the testing pyramid, and the
device-free **UI feedback loop** (render every real screen headlessly and see exactly
what your edit changed) — lives in [CLAUDE.md](./CLAUDE.md).

Read CLAUDE.md before making changes. It applies to every coding agent, not only Claude.

## When you hit a wall — symptom → command

Every command below runs from the repo root with **nothing to install** — the `qa/`
scripts ship inside this project, and `npx` needs no setup. None of them require the
create-cmp Claude Code plugin (if you have it, its skills and the `cmp-inspector` MCP
tools are better ergonomics for the same capabilities — never a prerequisite).

| Symptom | Run |
|---|---|
| Build broken, toolchain suspect (JDK/SDK/versions) | `npx create-cmp-cli doctor --fix` — diagnoses machine AND project (kotlin↔ksp lockstep, catalog drift); asks before any repair |
| "Did my edit break anything?" (inner loop) | `node qa/verify.mjs --fast` — JVM-time signal; never the done-gate |
| Want that signal on every save | `node qa/watch.mjs` — re-runs the fast lane on save, debounced |
| Can't see the UI (no device needed) | `./gradlew :composeApp:renderScreens` then `node qa/preview-gallery.mjs` — every screen as pixels + wireframe in one HTML file |
| Need the RUNNING app's real state | `adb forward tcp:9500 tcp:9500` then read `http://127.0.0.1:9500/inspect/remote` — debug builds serve the live semantics tree on loopback |
| Add a feature / screen / repository | `.claude/skills/add-feature` (also `add-screen`, `add-repository`) — or directly: `node qa/scaffold-feature.mjs <Name>` — clones the tested exemplar; never freehand the pattern |
| Dependency versions look stale or broken | `npx create-cmp-cli upgrade --dry-run` — diff against the next proven-green set before touching anything |
| A gate failed and you want to see why it exists | `node qa/refusal-demo.mjs` — stages canonical violations and shows each gate naming its clause |
| Ready to claim done | `node qa/verify.mjs` — the full lane, once, deliberately; commit the receipt it writes |

Hit a famous build failure (kotlin↔KSP mismatch, the KSP2/iOS catch-22,
`SDK location not found`, `No space left on device`)? `doctor` above diagnoses all of
them offline; the worked write-ups live upstream at
<https://github.com/kvdm-co-pilot/create-cmp/tree/main/docs/errors>.

One rule worth knowing before you touch anything: the `.mjs` files directly under `qa/`
and `qa/lib/` are **machine-owned harness code**, byte-identical in every create-cmp app
and hash-locked by `qa/harness.lock.json`. Editing them fails the lane's first step. Fix
the engine upstream instead — see "The lane is not yours to edit" in CLAUDE.md.
