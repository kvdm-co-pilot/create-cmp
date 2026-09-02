# studio-self-renewal — the console keeps itself current, so the human never has to

**Follows:** docs/features/studio-drive-mode.md (the studio is a standing check, L6) and
docs/features/drive-narration.md (declared vs observed, the three provenance tiers).

**The failure, stated plainly.** The console detects its own staleness in three places — the
page banner (console-shell.mjs `staleConsoleBannerHtml`), `console.mjs --status`, and the
`preview` tool's adoption warning (bin/server.mjs) — and every one of them ends in the same
sentence: *restart it.* Nobody holds the verb. The console was made detached precisely so it
would be the human's window and outlive the agent; without a verb, the only actor who can heal
it is the human, and the only way they can is by interrupting the work they were trying to
watch. The window supervises its operator. That is the inversion this brief removes.

It bites hardest in create-cmp's own repo, where the console's sources ARE the code under
edit: every save makes it stale, and its live watcher watches `composeApp/src` (the app's
sources), so the same save moves nothing on the page. Deadest exactly where the work happens.

## Decisions

**R1 — the verb belongs to the process that owns the fact.** Not the agent (that is the agent
killing the human's window, which is the failure `preview_stop`'s spawn-rights rule already
refuses) and not the human (the inversion above). The console renews ITSELF.

**R2 — bin/console.mjs becomes a supervisor.** It spawns `console.mjs <dir> [port] --worker`
and respawns it on exit code 75 (`EX_RENEW`) and on no other code — a crash must never loop.
The supervisor imports nothing from `src/` at top level (the `--status`/`--stop` branch uses a
dynamic import), so the supervisor's own module graph is trivial and effectively never stale.
Respawn is budgeted (5 renewals / 60s); beyond that it stops renewing and says so, so a save
storm or a boot-crash loop cannot spin. The worker's boot JSON is captured for its port and
re-emitted, so the launcher's stdout contract is unchanged and the human's URL is stable.

**R3 — the worker watches its own sources, in source mode only.** `sourceRoots()` (build-id.mjs,
the same set the build hash is computed over) is watched; on a debounced change the hash is
recomputed and compared to the id loaded at startup. Bundle mode skips entirely: a scaffolded
app runs the committed bundle and its sources cannot change under it, so this fires only where
the problem exists.

**R4 — renewal waits for quiescence, and says it is waiting.** Deferred while a render is in
flight or scheduled, while a verify lane holds `.cmp-lane-in-progress`, or while the Gradle
daemon is booting. Renewal must never interrupt a render or a lane. While deferred the fact
stays visible rather than silent — a deferred renewal is exactly when the human needs to know.

**R5 — the registry record carries the fact, so consumers stay dumb.** `writeConsoleRegistry`
gains `build` (the loaded id) and `buildStale`, rewritten when the worker observes staleness.
`walk.mjs` then reads a boolean — no hashing of the inspector's sources from the app's harness
(impossible in a scaffolded app, where the inspector is an npm package elsewhere) and no HTTP
in a per-prompt hook. `studioLine()` and the statusline stop reporting a clean bill of health
for a console drawing from old code. The console owns the fact; the record carries it.

**R6 — the page picks up new code by itself.** The `/events` hello already carries `version`;
it gains `build`. The shell bakes the same id into the page as `CMP_CONSOLE_BUILD`, and the
client reloads once when the two differ. EventSource already reconnects on its own (the pill's
"reconnecting…" path), so a renewal costs the human one automatic reload and nothing else.
This also covers every restart, not just an automatic one.

## Non-goals

No gate — the studio stays a standing check, per studio-drive-mode; a stale console never
blocks work, it heals or it is loud. No partial in-process module reload (a render layer
swapped under a live process would claim a freshness the rest of the graph does not have —
worse than the banner). No change to `preview_stop`'s spawn-rights rule: an adopted console
still refuses a stop it did not start.

**R7 — a renewal stands down when its reason goes away.** `renewalDecision()` is the policy
as one pure function — `none` / `stand-down` / `defer` / `renew` — so it reads as a rule rather
than as the order of callbacks. An undone edit, a revert, or a branch switched away and back
brings the disk hash back to the running one; an armed renewal disarms and clears `buildStale`
instead of restarting for nothing. An unknown hash on either side is never evidence of change,
the same stance `buildStatus` takes with `stale: null`.

## Known cost, stated

A renewal tears down the resident Gradle daemon with the service, so the next render pays a
cold boot. Accepted: a page drawn by the wrong code is worse than a slow render, and R4 keeps
the renewal out of any moment where a render or lane is actually in progress.

`bin/console.mjs` itself is NOT in the build hash (`sourceFiles()` covers `src/` plus
`bin/server.mjs`), so editing the supervisor changes no id and triggers no renewal — the
watcher fires and `renewalDecision` correctly answers `none`. Editing the supervisor still
needs a manual restart. That is the right trade: a file whose only job is to outlive module
graphs should not be swapping itself out underneath one.

## Named next (not in this change)

The observed tier still covers only the lane and the render. Between the prompt and the lane —
most of the working time — the Drive strip moves only if the agent volunteers
`qa/plan.mjs --step`, so a chain that is never declared reads as a still photo until the lane
lands. Extending corroboration to the build stage (writes observed in the working tree since
the current request began) is the next change, and needs one product decision first: what
counts as progress worth showing.
