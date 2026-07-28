# The console's build handshake — a running process that knows whether it is stale

**Status:** proposed · 2026-07-28
**Scope:** `inspector/mcp` — the studio console and the MCP tools that talk to it.
**Lane:** brief (carries decisions a later contributor could plausibly simplify away).

## The problem, from three incidents in two days

| When | Symptom | Root |
|---|---|---|
| 07-27 | The console served a page with no `gov-strip` while the bundle on disk had it | a long-lived process pinned an old module graph |
| 07-28 am | Same again, after a rebuild — I diagnosed it only by `grep`ping the fetched HTML | nothing in the system says which build is running |
| 07-28 pm | "the studio keeps getting disconected and broken" | the console was a child of an agent process the app respawns |

The third has a fix already landed (`inspector/mcp/bin/console.mjs` — the console
as a standalone process). **That fix makes the first two worse**: a console that
survives every agent restart is a console that can serve stale code
indefinitely. Detaching without a staleness check is a regression, not a fix.

The deeper issue is that "is the served page my code?" has been a question only
a human with `grep` could answer. Twice it cost an hour. The harness's own
philosophy answers this: doneness is *derived*, never claimed — and so is
freshness. A process should know, and say, whether it is running the code that
is on disk.

## Decisions

**1. A build id is the hash of the sources the running code was built from.**
Not a version string — versions lie when someone edits without bumping. The
repo already computes exactly this: `scripts/build-bundle.mjs`'s `inputsHash()`
(first-party `.mjs` sources + declared dependency versions), stamped into the
bundle as a `cmp:bundle-inputs` marker and gated by
`test/bundle-freshness.test.mjs`. **Why:** reusing it means one definition of
"which code is this", already trusted by an existing gate, rather than a second
parallel notion that can disagree with the first.

**2. The definition moves to `src/lib/build-id.mjs`; the bundler imports it.**
`scripts/build-bundle.mjs` depends on esbuild, so the service cannot import it
without dragging esbuild into the bundle. The hash logic moves down to a
dependency-free lib module that both consume. **Why:** the same
single-source-of-truth discipline `qa/lib/inputs-hash.mjs` already has for
receipts — the alternative (copy the function) is how two definitions drift.

**3. Staleness is `loaded ≠ on-disk`, computed by the process about itself.**
At startup the service records the build id of the code it actually loaded; on
request it recomputes from disk. Different ⇒ stale. **Why:** this is the only
formulation that works in both modes without a special case — bundled (the
loaded artifact is `dist/server.mjs`) and source (the loaded artifact is the
`src` tree, which is how `bin/console.mjs` runs). It also needs no external
actor: no CI, no agent, no human has to remember to check.

**4. A stale console says so on its own page, unmissably.** Not a log line, not
a field only an agent reads: a banner in the human's window, next to the
governance strip. **Why:** the failure mode is a human trusting what they see.
The fix has to reach the same surface the lie reached.

**5. Adopting an external console compares build ids and refuses to pretend.**
`preview` already adopts a console another process is serving
(`reusedExternal: true`). It will now fetch that console's build id and, when it
differs from the code the adopting process would run, say so in its result
rather than reporting a clean reuse. **Why:** silent adoption of a stale console
is precisely how yesterday's hour was lost.

**6. Lifecycle verbs, because a detached process needs them.** `--status` and
`--stop` on `bin/console.mjs`. **Why:** Gradle's daemon is the precedent for
tool-spawned background processes, and it ships `--status`/`--stop`/a registry
together. I left an orphaned console running for a day (pid 86134) because there
was no way to see or stop one. A detached process without lifecycle verbs is
litter by construction.

**7. The page's connection state recovers.** Today `es.onerror` writes
"disconnected" and nothing ever writes "live" back — a one-second blip looks
permanent even after `EventSource` silently reconnects. **Why:** this is a
direct cause of "keeps getting disconnected"; the console was sometimes fine and
saying otherwise.

## Rejected

- **A version string in `package.json`.** Bumped by hand ⇒ forgotten by hand.
  The whole point is a value nobody can forget to change.
- **Byte-comparing the bundle against a fresh build.** Already rejected once, in
  the bundler's own comment: esbuild output need only be deterministic per
  version, so this reports drift on someone else's machine. Hash the inputs.
- **An idle timeout.** Correct for *tool-spawned* daemons (Gradle: 3h). Our
  console is human-owned — started deliberately, visible, killable — so a
  timeout would close a window the human is still using. `--stop` is the honest
  verb for a process you started on purpose. (If ownership later moves to
  tool-spawn, a timeout becomes mandatory, not optional.)
- **Auto-restarting a stale console.** It is the human's window; killing it
  under them to fix a freshness problem trades one surprise for another. Say it
  is stale, give the command, let them choose.

## Edge cases (audited before signing)

1. **Source edited while the console runs, in src mode.** The disk hash moves;
   loaded stays. Reads stale — correctly, because the running process cannot
   pick up the edit. The preview *renderer* watches app sources and does live
   work; this is about the console's own code, a different thing, and conflating
   them would make every app edit look like console staleness.
2. **Bundle rebuilt while a bundled console runs.** `dist/server.mjs` changes on
   disk; the process holds the old graph. Reads stale. This is the 07-27/07-28
   incident, now mechanical.
3. **A src-mode console vs. a bundled agent.** `bin/console.mjs` loads `src`;
   the MCP server loads `dist`. Both hash the same *sources* (the bundle's
   marker records the sources it was built from), so a freshly-built bundle and
   a src console agree — they only differ when the bundle genuinely lags, which
   is true and worth saying.
4. **The hash cannot be computed** (files unreadable, marker missing from a
   hand-edited bundle). Report `build.id: null` and `stale: null` — unknown, not
   `false`. Refusal over fabrication: an unknown freshness must never render as
   a clean bill of health.
5. **A stale record from a crashed console.** Already handled (`processAlive` +
   an HTTP probe); the build handshake rides on the same record and inherits it.

## Out of scope

Moving `preview_status` / `preview_diff` / the snapshot tools onto HTTP so they
work against an adopted console. Real, and the larger half of the daemon
inversion — but independent of the handshake and better judged on its own.

## Shape of the change

| Piece | File |
|---|---|
| build-id definition (sources + deps hash, mode detection, staleness) | `inspector/mcp/src/lib/build-id.mjs` (new) |
| bundler consumes the shared definition | `inspector/mcp/scripts/build-bundle.mjs` |
| `/status` reports `build: {id, mode, stale, diskId}` | `inspector/mcp/src/lib/preview-service.mjs` |
| stale banner + build id in the provenance footer | `inspector/mcp/src/lib/console-shell.mjs` |
| SSE reconnect restores "live" | `inspector/mcp/src/lib/preview-service.mjs` (page script) |
| `--status` / `--stop` | `inspector/mcp/bin/console.mjs` |
| adoption compares build ids | `inspector/mcp/bin/server.mjs` |
