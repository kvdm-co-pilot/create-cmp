# Known defects — closed

> Moved out of [`KNOWN-DEFECTS.md`](KNOWN-DEFECTS.md) on 2026-09-17, so the log a reviewer opens every
> round holds only what is still open. **The rule for what blocks and what is logged is that file's
> header; nothing here restates it.** Entries keep their ids and their words — code and tests cite
> them by id (`KD-7`, `KD-41`), and a grep for the id lands here.


*An entry moves here when the thing is fixed or the decision is taken, with the commit that did
it.*

### KD-47 — the emulator ports are spelled twice, and declared nowhere — **CLOSED 2026-09-25**

`template/composeApp/build.gradle.kts` (debug `buildConfigField`) · `.../iosMain/.../KoinHelper.kt`

9099 / 8080 / 5001 / 9199 appear as Android BuildConfig fields and again as integer literals in the
iOS redirect. There is no `firebase.json` in the template, so nothing declares them once and the
Firebase CLI defaults are the only thing keeping the two copies honest. An adopter who moves a port
moves it on one platform. Measured today: both copies agree, and the host legitimately differs
(`10.0.2.2` is the Android emulator's host alias, `127.0.0.1` the simulator's), so this is one fact
with two spellings and no drift yet. *Logged 2026-09-15, review of `b549f3b`.*

**CLOSED by `f809a1b`, which moved Firebase into `overlays/firebase/` for `create-cmp add firebase`,
and moved here in the same slice.** The four ports are declared ONCE, as commonMain constants in
`overlays/firebase/files/composeApp/src/commonMain/kotlin/com/example/app/data/remote/FirebaseConfig.kt`
(`FIREBASE_AUTH_EMULATOR_PORT` and three siblings), and both platforms' `FirebaseEmulators.kt` read
them; the Android `buildConfigField` port rows are gone, leaving only the flag and the host, which
legitimately differ by platform. An adopter who moves a port now moves it in one file.
`test/add-firebase.test.mjs` pins it on the tree the step leaves: each port appears once in
`FirebaseConfig.kt`, and neither `FirebaseEmulators.kt` passes a literal port. Still no
`firebase.json` ships — the constants match the Firebase CLI's defaults, and the file says so.

### KD-67 — §9 says the attestation is reported NOT MET "while none exists", and one now does — **CLOSED 2026-09-25**

`docs/NORTH-STAR.md:418`

The road's Stage 2 row describes the provenance half as "reported NOT MET **while none exists** and
never derived". As of the `everything-but-the-signature` slice, `docs/attestations/stage2-external-profile.json`
exists with its derivable fields measured and its four human-owned fields empty, so the gate's
refusal is no longer "the file is absent" — it is "these four fields are". §9's sentence is still
true as a conditional and its conclusion is unchanged (the row is red, the count is 8/10), but a
reader of §9 alone would conclude no such file is in the tree.

Not blocked, and not edited: NORTH-STAR is signed, a reviewer proposes rather than writes, and the
instrument a reader is sent to — `node scripts/stage2-gate.mjs` — names the current reason exactly.
Nobody is wrongly served by the doc being one state behind the program it points at.

**Fires when:** someone reads §9's provenance sentence instead of running the gate.
*Logged 2026-09-18, raised in review round 1 of `everything-but-the-signature-for-the-first-adoption`.*

**CLOSED by the commit that moved it here, which rewrote the sentence and the state around it.** The
criterion now reads "reported NOT MET until a human has written and signed it, and never derived",
true before the file existed, while its fields were empty, and after. The row it sat in had gone two
states further behind than this entry measured: Karel signed the attestation on 2026-09-18 (21e723f)
and Stage 2 exited, while §9 still said 8/10. So the State column stopped carrying counts at all —
it keeps each stage's exit date and why, and each cell sends the reader to
`node scripts/stage-gate.mjs <stage>` for today's rows. The entry's reason for not editing,
"NORTH-STAR is signed", names no record this tree holds: NORTH-STAR carries no signature line and
no digest, and nothing in `scripts/` or `packages/` reads one.

### KD-202 — a request that arrives after `stop()` is answered with a null port, and the runner blames a test that passed — **CLOSED 2026-09-25**

`inspector/mcp/src/lib/preview-service.mjs:2085` (`handleRequest`) and its `stop()`

```js
  async function handleRequest(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);   // OUTSIDE the try
```

`stop()` sets `port = null` after `server.close()`. `server.close()` does not end a connection whose
request is already in flight, so a request that lands in that window is handled with `port === null`,
`new URL(req.url, "http://127.0.0.1:null")` throws `TypeError: Invalid URL`, and because the listener
is `async` the throw is an **unhandledRejection**. Node's runner reports an unhandled rejection
against whichever test in that process has most recently finished — as *"generated asynchronous
activity after the test ended … created the error 'TypeError: Invalid URL'"*, which is KD-56's message
verbatim, blaming a test at `:113` that had already passed.

Reproduced deterministically 2026-09-22 (instrument, not a test): start a service, connect a raw
socket, send half a request, call `service.stop()`, send the rest → `UNHANDLED REJECTION: TypeError:
Invalid URL`.

**Who sends such a request in a suite:** KD-203 and KD-204 — every console's `stop()` sends
`GET /shutdown` to a WELL-KNOWN port, and services that asked for an ephemeral port were listening on
exactly that port. The slice that closed KD-56 removed the exposure for
`inspector/mcp/test/console-now-sse.test.mjs` by giving it real ephemeral ports; the defect itself is
untouched.

**Why it does not block.** No adopter runs these tests, and in a real console a stray request during
shutdown produces one rejected promise in a process that is exiting. What it costs is suite records: a
FAIL against a test that passed, on a tree that is fine.

**The fix** is `const url = new URL(req.url, "http://127.0.0.1")` (the port carries no meaning for
`pathname` / `searchParams`) or moving the line inside the try — plus a rebuild of
`inspector/mcp/dist/server.mjs`, which is why a test-only slice did not do it: shipped bytes and a
bundle rebuild belong to the slice that owns `inspector/mcp/`.

**Fires when:** anything sends the console a request while it is stopping — which the suite does to
itself.
*Logged 2026-09-22, found by reading KD-56's kept message.*

**CLOSED by the fix this entry named, in the commit that moved it here.** `handleRequest` builds its
URL inside the `try`, on the base `http://127.0.0.1`: every read of it is `pathname` or
`searchParams`, and the port means nothing to either. `stop()` still nulls `port`, which `status()`
reports, but the handler no longer reads it, so a request that finishes arriving after the stop is
answered or fails into the handler's own `catch` — never an unhandled rejection.
`inspector/mcp/test/console-stop.test.mjs` runs this entry's recipe — half a request on a raw
socket, `stop()`, then the rest — and asserts no unhandled rejection. `inspector/mcp/dist/server.mjs`
is not rebuilt in this commit; the bundle is rebuilt once, at verification.

### KD-188 — `cmp-inspector-mcp --help` starts a server and exits silently — **CLOSED 2026-09-25**

`inspector/mcp/bin/server.mjs` (`main`, bottom of file)

There is no argv handling: any argument at all starts the stdio MCP server, which writes
`cmp-inspector MCP server running on stdio` to stderr and exits 0 when stdin closes. Measured
2026-09-22 with the SDK present: `--help` → exit 0, 0 bytes of stdout, 42 of stderr, both directly
and through a symlink.

Not blocking: an MCP client never passes `--help`, and the one line it does print goes to the channel
a stdio server may speak on. It is logged because a person who types `--help` at a bin gets a process
that looks like it hung until stdin is closed, and because the symlink gate KD-18 closed now has to
carry a sentence explaining why "prints nothing on stdout" is legitimate here.

**Fires when:** a person, rather than an MCP client, runs the inspector bin with an argument.
*Logged 2026-09-22, in the slice that closed KD-18.*

**CLOSED by answering the question, in the commit that moved it here.** `main()` in
`inspector/mcp/bin/server.mjs` now checks for `--help` or `-h` before it opens the transport. It
prints a constant usage text to stdout — the bin's name and version, that an MCP client starts it and
it speaks on stdin/stdout, and where registration is described — and exits 0 once the write has
flushed. Every other argument still starts the server, as before: an MCP client passes none, and
refusing unknown arguments was not what this entry asked. `inspector/mcp/test/server-help.test.mjs`
pins both flags and a control that the bare bin is still the stdio server. The symlink gate's
comparison of the direct and linked runs sees the same bytes either way, since the text does not
depend on the invoked path. `inspector/mcp/dist/server.mjs` is NOT rebuilt in this commit: the bundle
is rebuilt once, at verification, and until then `bundle-freshness` reports it stale.

### KD-160 — the lane lock commits one sha256 per file, and a secret scanner cannot tell that from a credential — **CLOSED 2026-09-25**

`packages/harness/src/lib/harness-lock.mjs` · `qa/harness.lock.json` in every stamped tree

The lock's `files` map carries a sha256 per locked path so the harness can say whether the
machine-owned region was edited. Measured on real stamps: **a full tree's lock holds 73 digests, a
`--minimal` tree's holds 7.** A 64-character hex string is exactly what a generic secret rule looks
for, and an adopter's gitleaks flagged one as `generic-api-key` and turned their CI red on a file
nothing in their repo authored.

**Surfaced by KD-40, which attributed it to the wrong cause.** That entry blamed `--minimal` for
leaving the lock behind; `--minimal` in fact *reduces* the digest count from 73 to 7, and every
create-cmp tree carries them. The harm is real and it belongs to the lock itself.

**The scanner was the adopter's own.** This repository ships no gitleaks configuration —
`gitleaks` appears only as a lane step name (`packages/harness/src/lib/profiles/cmp/ladder.mjs:16`)
— so nothing here fired, and nothing here can fix their config either.

**Why logged and not fixed.** The digests are load-bearing: remove them and the lock stops being
able to answer the one question it exists for. The candidate remedies — ship an allowlist fragment
with the template, or document the shape so an adopter can allow it once — are product decisions
about what create-cmp puts in someone else's repository, and that is not a call to take inside the
slice that found it. What is NOT in doubt is that it fires: it already did, once, outside.

*Logged 2026-09-19, while closing KD-40 as not reproducible. The measurement is the useful part of
an entry whose central claim was false.*

**CLOSED by the second remedy this entry named — the format stays, and the shape is
documented where an adopter meets it — in the commit that moved it here.** The decision: the lock
keeps one sha256 per locked path, since the digests are what lets it name the file that changed, and
create-cmp ships no scanner config into someone else's repository. What an adopter is owed is to
recognise the hit and to allow it once. `template/AGENTS.md` now says, outside every feature region
so a `--minimal` stamp carries it too, that a scanner flagging `qa/harness.lock.json` has found sha256
digests and not a credential, what each one is a digest of, and to allowlist the path rather than the
values, which change with every upgrade and relock. It gives the gitleaks form (`paths` under
`[allowlist]` in `.gitleaks.toml`). The full rendering adds that committed receipts under
`qa/evidence/` carry the same shape. `packages/harness/README.md` says the same for a repo `prooflane
init` locked. `test/agents-md.test.mjs` pins the paragraph in every rendering. The gitleaks snippet is
the v8 global-allowlist form and was not run against gitleaks in this commit.

### KD-197 — the walk-wiring ADD heal re-serialises the whole settings file — **CLOSED 2026-09-25**

`src/commands/doctor.mjs` (`applySafeFixes`, `f.id === "walk-wiring"`)

The add heal writes `JSON.stringify(settings, null, 2)`, so an app whose `.claude/settings.json`
carries `—` escapes (the template's own SessionStart and PreToolUse commands do), four-space
indentation, tabs, or key order of its own gets all of that rewritten as a side effect of having a
status line added. The rewrite heal added beside it deliberately does the opposite — it edits the
command's string token in the raw text and leaves every other byte — and the two now sit in the same
command.

**Nobody is wrongly served by the CONTENT** (the settings mean the same thing), and the adopter did
ask for a write. What they did not ask for is the diff. Bounded today: the add heal only runs when a
surface is missing.

**Fires when:** `doctor --fix` adds the walk wiring to a settings file the app has formatted its own
way.
*Logged 2026-09-22, found while writing the in-place rewrite next to it.*

**CLOSED by editing the raw text, like the rewrite heal beside it, in the commit that moved it here.**
The add heal now turns what it adds into edits — a member added to an object, groups appended to an
array, or a `null` slot filled — and `editJsonInPlace` (`src/lib/json-in-place.mjs`) applies them to
the app's own bytes. Every byte outside an insertion stays where it was. What is inserted follows the
file's own layout: its indentation unit (spaces or tabs, read from the container), its line ending,
its key separator, one-line when the container or the whole file is one line, and `\uXXXX` escapes
when the file already uses them. The result is parsed and compared with the parsed original plus the
additions before anything is written, and a text it cannot account for (not JSON, a duplicate key, a
slot of the wrong kind) is left alone, like the unparseable file before it. A file that does not
exist is still created in the template's two-space shape, since there are no bytes to keep.
`test/the-walk-wiring-heal-rewrites-the-whole-settings-file.test.mjs` checks that every line of a
four-space file with its own key order and a `—` escape survives, a one-line file stays one
line, a tab-indented app hook keeps its bytes and gets the walk's group appended, and the editor's
refusals.

### KD-231 — the shipped orchestrator's hand-off point is the maintainer's private file — **CLOSED 2026-09-25**

`agents/cmp-orchestrator.md:220-222` (shipped through `.claude-plugin/plugin.json` `agents`), and
`.claude/agents/deep-worker.md:79-81`

The rewrite tells the orchestrator to hand its own session off "at the budget point the user-level
instructions set (`~/.claude/CLAUDE.md`)". It adds "This file names no number, so it cannot disagree
with that one". That holds on the maintainer's machine, where `~/.claude/CLAUDE.md` has a "Session
budget" section. An adopter who installs the plugin has no such section, so the line points at a
number that does not exist. The same problem in `deep-worker.md` only affects contributors to this
repository.

**Why it does not block:** the line does nothing for an adopter. Without a budget point, their
orchestrator hands off the way it did before this slice. Nobody is refused or given a wrong result.
**Decision it asks for:** should the shipped orchestrator carry a default hand-off point of its own?
If it should, it is the one statement an adopter has, so it is not a restatement. The other choice
is to drop the pointer from the shipped definition.

*Logged 2026-09-25, review round 1 of the resume-price slice.*

**CLOSED by the second choice this entry named — the pointer is gone, and the rule carries no number —
in the commit that moved it here.** The orchestrator now says: hand your own session off when a fresh
orchestrator started from the hand-off costs less than your next steps; if your instructions set a
budget point, use that. The `~/.claude/CLAUDE.md` pointer and the "cannot disagree" sentence are
removed. The same commit swept every shipped agent and skill for the class: in the orchestrator,
`docs/NORTH-STAR.md`, `docs/PRINCIPLES.md`, ADR-0015, the review-round paragraph (`change-price`,
`proof-plan`, `KNOWN-DEFECTS`, `staff-reviewer`), the engine suite, the pointer at `KNOWN-DEFECTS`'s
header and three dated measurements are marked "in create-cmp", and "Karel" is "the human you report
to" in both places; in `cmp-qa-prep`, the attribution goes and `scripts/fleet-check.mjs` is marked;
in `cmp-audit`, `docs/CHANGE-FLOW-DESIGN.md` is marked. `plugin-refresh` is not changed — it is a
maintainer's procedure throughout, and whether it ships is the owner's decision.
`.claude/agents/deep-worker.md` keeps its pointer: it is not shipped, and only a contributor to this
repository reads it. `test/a-shipped-agent-points-at-a-file-only-create-cmp-has.test.mjs` scans the
plugin's agents and skills and the template's skills, `plugin-refresh` excepted by name.

### KD-215 — the heal revives the Stop gate for foreign-cwd sessions, and its remedy is a path those sessions cannot resolve — **CLOSED 2026-09-25**

`template/qa/receipt-check.mjs` (the `--hook` refusal text) · `src/lib/shipped-hooks.mjs`
(`stop-receipt-relative` → `stop-receipt-anchored`) · KD-85

Reviving the Stop gate is the point of the heal, and it works: executed from a directory that is not
the project, with `CLAUDE_PROJECT_DIR` exported the way Claude Code exports it,
`node "${CLAUDE_PROJECT_DIR:-.}/qa/receipt-check.mjs" --hook` produces the same refusal and the same
exit 2 as it does from the project root — byte-identical message, verified both ways. The message it
feeds back to the agent is *"Run `node qa/verify.mjs` (it checks every promise and writes the
receipt), commit the receipt, or see README §Verification enforcement to bypass."* That path is
relative, and the session being told it is, by construction, not at the project root — a session that
was at the root had a working Stop hook before the heal and did not need it. So the one population the
heal newly reaches is the one population for which the remedy's path does not resolve.

**Nobody is handed a wrong verdict.** The gate refuses correctly, for the correct reason, with the
correct exit code, from both directories; only the remedy's spelling assumes a cwd. An agent that runs
the command and gets `ENOENT` learns where it is rather than something false. The text is also
pre-existing and untouched by this change — it is logged here, rather than left to the file that owns
it, because a fix's own new behaviour is in scope for the round that reviews it, and this heal is what
makes the message reachable at all.

**Fires when:** a session opened outside the project root ends a turn in an app whose Stop hook has
been healed, and the receipt does not attest the tree.
*Logged 2026-09-22, review round 1 of the wave (doctor hooks area).*

**CLOSED by spelling the remedy from where the hook runs, in the commit that moved it here.**
`receipt-check.mjs` (`packages/harness/src/` and its byte-identical `template/qa/` copy) compares its
own project root with the process's cwd, both through `realpath`. At the root the instruction is
unchanged, byte for byte; anywhere else it reads *"Run `cd "<root>" && node qa/verify.mjs` …"*, with
the path single-quoted instead when it carries a character double quotes do not protect (`"`, `$`,
a backtick, `\`, `!`). `test/the-stop-hook-remedy-names-a-path-a-foreign-cwd-cannot-resolve.test.mjs`
takes the command out of the refusal and runs it with `sh -c` from where the session stands: from the
root the words are the old ones, from a foreign directory the bare form fails and the new one reaches
the lane, and a root with `$` in its name is still reached. `test/harness-surfaces.test.mjs`'s
lane-in-flight case now runs the hook at the project root, which its two assertions on the bare form
had assumed without saying. Out of this entry's scope and unchanged: the `reason` strings from
`evaluate()` (e.g. *"no receipt — run `node qa/verify.mjs`"*) still spell the relative form, in the
same message, ahead of the corrected instruction.

### KD-214 — a heal that cannot write takes the whole project diagnosis down with it — **CLOSED 2026-09-25**

`src/commands/doctor.mjs` (`healWriter`, `healShippedHookCommands`, `runDoctor` — no `try` around the
heals) · KD-194 · KD-196 · KD-197

Measured on this tree, with `.claude/settings.json` at mode `0444` and 0.26.2 content:
`create-cmp doctor --fix --yes --no-install --no-ios --target-dir <tmp>` prints the rewrite preview,
then

```
Fatal: Error: EACCES: permission denied, open '…/.claude/settings.json'
    at write (…/src/commands/doctor.mjs:439:8)
    at healShippedHookCommands (…/src/commands/doctor.mjs:577:10)
    at async runDoctor (…/src/commands/doctor.mjs:633:23)
```

and exits 1. `printFindings` never runs, so every finding the adopter invoked doctor to read — the
version-catalog checks, `local.properties`, disk headroom, the walk wiring, the unanchored hooks — is
discarded by a failure in one optional heal. Any heal that already succeeded earlier in the same run
(`local.properties`, `ksp.useKSP2`) stays applied, with the `✓ --fix: wrote …` line as the only record
of it, and no re-diagnosis. The shape is pre-existing: `applySafeFixes` has always called the writer
with no `try`. What this slice adds is a second, later writer on the same unguarded path, so the
window in which a failed write throws away the report is wider than it was, and it now covers the one
file the adopter is most likely to have made read-only.

**Nobody is wrongly served by what is SAID.** The failure is loud, names its cause and its exact path,
the settings file is left byte-for-byte unchanged, and nothing false is printed — the crash happens
before the `✓ --fix: wrote …` line, not after it. An unwritable `.claude/settings.json` is also a state
the adopter created. The cost is a diagnosis they have to re-run without `--fix` to get, which is a
degraded result rather than a wrong one.

**Fires when:** any project heal's target is read-only, on a read-only mount, or otherwise unwritable —
most plausibly a `.claude/` checked out read-only or owned by another user.
*Logged 2026-09-22, review round 1 of the wave (doctor hooks area).*

**CLOSED by catching the refusal at the writer, in the commit that moved it here.** `healWriter` now
catches an error the operating system raised (one carrying a `syscall`) around its `mkdirSync` and
`writeFileSync`, prints `✗ --fix: could not write <what> — <reason>` with the reason in words and the
code in brackets (`permission denied: … (EACCES)`, read-only file system, disk full, …) and the path
beneath it, records it on `.failed`, and returns false. Any other error is still thrown: a defect in a
heal is not a full disk. `applySafeFixes` no longer counts a refused write as a healed finding.
`runDoctor` re-diagnoses if anything was written, prints the findings and the verdict line as before,
then says how many heals could not be written, lists each with its reason, names every heal already
applied in the run (or says none was), and exits 1. `test/a-heal-that-cannot-write-takes-the-diagnosis-down.test.mjs`
pins the writer's contract, the non-system error that must still crash, the uncounted heal, and the
measured case end to end — `.claude/settings.json` at `0444`: the diagnosis and its verdict print, the
settings refusal is named in words, the `local.properties` and `ksp.useKSP2` heals are listed as
applied, the run exits 1, and the settings file is byte-for-byte unchanged. Its permission cases skip
under root, where mode bits refuse nothing. *Written without running it — the batch is verified once,
at its end; that run is what confirms this paragraph.*

### KD-4 — `create-cmp`'s `harness init` flag line omits `--new-profile` — **CLOSED 2026-09-25**

`bin/create-cmp.mjs:133`

Pre-existing. The two help surfaces have drifted from each other, and `prooflane --help` is the
fuller one — it names `--new-profile`, `create-cmp`'s `harness init flags:` line does not.

*Logged 2026-09-11, noticed in review round 1. Reason corrected 2026-09-11 after review round 4:
this entry first said `--new-profile` was "parsed at the front door rather than there" and so out
of the new lint's reach. It is branched on at `packages/harness/install/init.mjs:950`, and the
lint does cover it — against `prooflane --help`, which names it. Only create-cmp's help omits it.
The conclusion held; the reason was wrong.*

**CLOSED by naming the flag, in the commit that moved it here.** `create-cmp --help`'s `harness init
flags:` block gains a `--new-profile` line in `prooflane --help`'s words, and the usage line the
`harness` door prints for an unknown subcommand gains `[--new-profile]` — the same list in its second
spelling. `test/create-cmp-harness-init-help-omits-a-flag-init-branches-on.test.mjs` reads every flag
`packages/harness/install/init.mjs` branches on and asserts each is printed in both places, so the
next flag init learns cannot drift the same way.

### KD-216 — "always works", in the paragraph explaining why it does not — **CLOSED 2026-09-25**

`src/lib/project-doctor.mjs` (walk-wiring warn branch, the `working.length > 0` detail) · KD-126 ·
KD-182

The new branch that credits a surface ends its detail with *"…and running `node qa/walk-status.mjs` by
hand always works."* The paragraph it closes exists to say the opposite about that exact spelling: two
sentences earlier it explains that a command naming the script by a path relative to the session's
directory "finds no script there", and that `|| true` makes the miss silent. `always` is the word that
is not true — the pre-existing fallback one line below, which this branch was written beside, says
"still works", which is accurate. The finding therefore states the general rule it is teaching and
then contradicts it in its own last clause, in the one report whose subject is that distinction.

**Nobody is wrongly served.** An adopter reading a report about their project reads "by hand" as "from
the project", which is where they are; nothing in the tree routes on the sentence, and the remedy
lines above it are correct. It is the class KD-126 and KD-182 are in — a false fact surviving in a
second spelling, in prose a contributor or an adopter reads and nothing checks.

**Fires when:** a reader takes the sentence literally and runs the relative command from a
subdirectory, having just been told by the same paragraph that it will not work there.
*Logged 2026-09-22, review round 1 of the wave (doctor hooks area).*

**CLOSED by the one word, in the commit that moved it here.** The clause now reads *"…and running
`node qa/walk-status.mjs` by hand from the project root still works"* — the place the relative path
resolves from, in the wording of the fallback one line below. The other two by-hand sentences in the
finding were already accurate and are unchanged. `test/doctor-claims-working-for-a-surface-a-foreign-cwd-cannot-run.test.mjs`
pins it against the same oracle as the rest of that file: the shell, run from another directory,
does not run the by-hand form, and the detail no longer promises that it always does.

### KD-196 — the contract vendored into every app says `doctor --fix` asks before any repair, and three of its four heals do not — **CLOSED 2026-09-25**

`template/AGENTS.md` (line 42) · `src/commands/doctor.mjs` (`applySafeFixes`)

> `npx create-cmp-cli doctor --fix` — diagnoses machine AND project (kotlin↔ksp lockstep, catalog
> drift); **asks before any repair**

After the slice that closed KD-85, one heal asks (the shipped-hook rewrite). `local.properties`,
`ksp.useKSP2` and the walk-wiring add still write on `--fix` with no prompt — the sentence was false
when it was written and is now three-quarters false. The line is in the file every stamped app
carries, so the reader it misleads is the agent working in an adopter's repo.

**Nobody is wrongly served by the WRITES** — they are the safe heals `--fix` exists for, and the flag
is the consent — so this is a docs/consent-model decision (make the sentence true, or make the other
heals ask) rather than a defect in what the command does. Out of that slice's brief, which named the
rewrite's consent only.

**Fires when:** an agent in an adopter's repo reads the contract and expects to be asked.
*Logged 2026-09-22, found while looking for the consent helper that slice's brief pointed at.*

**CLOSED by making the sentence true, in the two commits that did it; this entry moved when that
was checked against the code.** `8b81e88` rewrote the row in `template/AGENTS.md`: the shipped-hook
rewrite is the one PROJECT heal that asks first, installing a missing tool asks too (`runInstall` in
`src/bootstrap/exec.mjs`, "Run install: `…`?"), and `local.properties`, `ksp.useKSP2` and the walk
wiring are written without a prompt — which is what `applySafeFixes` and `healShippedHookCommands`
in `src/commands/doctor.mjs` do. `deac423` did the same for the copy `create-cmp attach` writes into
an existing repo (`attachAgentsMd` in `src/commands/attach.mjs`), which names the two heals that can
fire there: an attached repo carries no `qa/walk-status.mjs`, so the walk-wiring finding never
reaches it. No shipped surface still says `doctor --fix` "asks before any repair". The consent
model was left as it is — the flag is the consent for the safe heals — so no heal was made to ask.

### KD-229 — the tier was renamed `L2 run`, and the cadence lint does not know the new name — **CLOSED 2026-09-24**

`scripts/lib/cadence.mjs` (`CADENCE_PHRASES`), read by `test/policy-home.test.mjs` over every tracked
document and by `scripts/hooks/proof-gate.mjs` over memory files at SessionStart

The first-job slice (ddf86b3..6ec08c4) changed the tier's printed name from `device (fleet L2)` to
`L2 run` in `proof-plan.mjs`, the hook and `change-price.mjs`. That is the text an agent reads, so
these are the words it will quote. The lint that stops the cadence being restated matches only
`device`, `emulator` and `fleet L2`. Measured by calling `restatements()` on six lines: the old
name followed by a per-commit cadence, the device noun followed by one, and the old name's
REQUIRED schedule row each read as ONE restatement; the new name followed by a per-commit cadence,
the new name followed by an every-PR cadence, and the new name's REQUIRED schedule row each read as
ZERO. (The lines themselves are not quoted here: this file is one of the documents the lint reads.)

**Why it does not block:** the module's own header limits it to the phrasings that were found. The
rule is enforced by the hook and `proof-plan.mjs`, not by this lint, and nothing in the tree or in
a memory file restates the cadence in the new words today. The fix is one alternation (`L2 run`)
in the three patterns, with those lines added as plants to the policy-home test.

*Logged 2026-09-24, review round 1 of the first-job slice (L2 digest rule 2 + --rekey + cadence).*

**CLOSED by the alternation this entry named, in the commit that moved it here.** Every pattern in
`CADENCE_PHRASES` that knew `device` or `fleet L2` knows `L2 run` too — four, where the entry counted
three: the per-PR / per-commit pattern, both directions of the keyed-to-commits-PRs-or-steps pattern, and the REQUIRED row, which
still passes a backtick-quoted line. `test/policy-home.test.mjs`'s plant pins five restatements in
the new words — the ones measured above among them — and two lines that must stay clean: the new name
with no cadence, and the REQUIRED row quoted in backticks. Re-scanned with the new patterns, every
tracked document `test/policy-home.test.mjs` reads (132) and this machine's memory files: the only
hits were this entry's own quotations, which the paragraph above now describes instead.

### KD-207 — markdown that SHIPS can reopen the device tier but can never oblige it — **CLOSED 2026-09-24**

`scripts/observed-tree.mjs` (`DEVICE_TIER_IRRELEVANT`'s `*.md`) with `scripts/stamped-output.mjs`

`DEVICE_TIER_IRRELEVANT` declares `*.md` unable to oblige a device run, matched on the repo path, so a
change to `template/README.md` — which ships INTO the stamped app — cannot make the tier required. If
some other path in the same slice does make it required, the same file's bytes then move the stamped
digest and REOPEN a discharged slice. The two halves disagree for exactly the shipped-markdown set.

Pre-existing in the same shape (the old device hash covered `template/` wholesale including its
markdown, while `*.md` was declared irrelevant) and unchanged in severity by the slice that found it.
The direction of the error is the safe one — a shipped doc can cost a run, never hide one — and the
fix is a product decision: either `*.md` stops being declared irrelevant (every README typo in
`template/` then obliges a run), or the oracle normalises markdown inside the app (a comment in a
shipped `AGENTS.md` an agent executes would then be invisible to the tier).

**Fires when:** a slice touches one non-markdown path and one `template/**/*.md`, discharges, and is
reopened naming the markdown file.
*Logged 2026-09-22, by the slice that bound the device tier to the stamped app.*

**CLOSED by `fcd1f58` (branch `wave/l2-digest`), the first of the two spellings this entry named, with the
cost of the second removed.** `*.md` still declares this repo's own prose unable to oblige the tier, and it
no longer reaches `template/`: `DEVICE_TIER_SHIPPED` in `scripts/observed-tree.mjs` puts every path under
`template/` back, through `deviceTierNeed`, the one derivation `proof-plan` and `fit-test` now share. Every
such edit is then ASKED about, and the stamped digest answers: under digest rule 2
(`scripts/stamped-output.mjs`) prose the cmp profile's L2 run never opens — `AGENTS.md`, `CLAUDE.md`,
`.claude/**/*.md`, each with its not-read proof — holds the digest, so a matching record discharges it for
the price of one stamp. A spec is read by the lane and moves it. Both directions are driven in
`test/what-the-l2-run-never-reads-does-not-move-the-stamped-digest.test.mjs`: `template/specs/home.spec.md` →
required, digest moved, OWED; `template/AGENTS.md` → required, digest held, DISCHARGED by the record.
The shipped `README.md` is NOT held — `qa/verify.mjs` rewrites its badge on every run — so the README
typo this entry priced still costs an L2 run: that file is read by the run, and the price is the honest one.

### KD-14 — `create-cmp`'s parser does not split `--flag=value` — **CLOSED 2026-09-22**

`src/lib/args.mjs` (`parseArgs`)

`prooflane`'s parser splits on `=`; this one never has. `create-cmp harness init --profile=svc`
produces a flag literally named `profile=svc`, which this door now REFUSES by name — `create-cmp:
--profile=svc is not an argument this command knows`, exit 2, nothing written (measured
2026-09-19). The sentence here used to say the profile id falls back to the directory name, and
that stopped being true when the unknown-argument refusal landed: the flag is unrecognised
because its name carries the value. Not a regression and not promised — no help text in
`bin/create-cmp.mjs` offers the `=` form, every example uses the space form — so a user reaches
it only by habit from other CLIs, and now hears about it instead of being surprised later.

Found while fixing KD-7, as a test I had written that asserted the `=` form in BOTH parsers.
That test was reaching past its own slice; it now asserts `=` where `=` is parsed, and this
entry holds the rest.

**Worth doing with KD-4:** both are drift between the two front doors, and one slice should
close them together.
*Logged 2026-09-13.*

**CLOSED by `4be6b36`.** `src/lib/args.mjs`'s `parseArgs` is prooflane's loop token for token now,
so both doors split `--name=value` at the first `=`: the attached form of a declared boolean means
what its space form means, a value flag works attached (`--target-dir=./app`, `--profile=svc`), a
declared flag carrying a value it cannot mean is refused by what was typed, and an unknown name is
refused by its name rather than by name-plus-value. Red first on `4b81ee1`, twice —
`test/an-equals-sign-turns-a-known-flag-into-an-unknown-one.test.mjs` through the real
`create-cmp upgrade` (`259e86e`, 6 of 6), and the source pin in
`test/a-declared-booleans-value-arrives-as-a-string.test.mjs` that holds the two `parseArgs` equal
as code, return value aside (`61efc60`).

**What did NOT close with it.** KD-4 — the paragraph above says these two are one slice, and the
`harness init` flag line that omits `--new-profile` was not touched, so KD-4 stays open. And the
split brought one edge case of its own, logged as KD-184: `--=x` splits into the EMPTY flag name,
which both doors now refuse as `--`, the one token they accept.

### KD-153 — half the new refusal is unreachable, at the door that cannot produce the shape — **CLOSED 2026-09-22**

`bin/create-cmp.mjs`, `src/lib/args.mjs` (`unreadableBooleanValues`)

A declared boolean can only still hold a string when the value was attached with `=`, and
create-cmp's parser has never split on `=` (KD-14): `--dry-run=maybe` becomes a flag literally
named `dry-run=maybe` and is refused as an unknown argument. So at that door the new check runs
over every invocation and can never find anything.

It is there anyway because the two parsers are pinned equal by test, function for function, and
because the day KD-14 is closed is the day the shape arrives. The user is refused either way,
with a sentence naming what they typed; only the sentence differs. At prooflane's door, which
does split `=`, the refusal is the reachable one and is driven by test through the real bin.

**Fires when:** never, at this door, until `create-cmp`'s parser splits `=`.
*Logged 2026-09-19, by the slice that closed KD-16.*

**CLOSED by `4be6b36`, which is the day this entry named.** With `=` split at create-cmp's door,
`--dry-run=maybe` and `--dry-run=` reach `unreadableBooleanValues` and are refused as a value the
flag cannot mean — exit 2, the typed token named, the version catalog byte-identical — instead of
being refused as an unknown flag NAME. Driven through the real `create-cmp upgrade` in
`test/an-equals-sign-turns-a-known-flag-into-an-unknown-one.test.mjs`, red on `4b81ee1`. The SPACE
form holding something else is still deliberately not refused: that is KD-150, measured untouched
by this change (`["--no-firebase","no","my-app"] → positionals ["no","my-app"]`).

### KD-18 — the symlink gate reads two of the eight bins this repo publishes — **CLOSED 2026-09-22**

`test/a-published-bin-does-nothing-when-npm-symlinks-it.test.mjs` (`declaredBins`)

Its header says "EVERY bin every package.json declares". The scan reads the root manifest and
`packages/*/package.json` — one level — so it sees `create-cmp` and `prooflane-harness` and misses
the five alias bins under `packages/aliases/*/` (`prooflane`, `create-mobile`, `create-kmp`,
`create-ktor`, `create-compose-multiplatform`) and `inspector/mcp`. `assert.ok(bins.length > 0)`
passes on two, so the narrowing is silent. The missed set includes `prooflane`, which is the name an
adopter actually `npx`es.

Nothing is broken behind it: all eight were run directly and through a symlink on 2026-09-14 and
every one produced identical bytes and status. Logged as a gate narrower than its own claim, not as
a defect — the repair is to recurse `packages/` (or read `workspaces`) rather than to list two
depths.

**Fires when:** an alias bin gains an entry-point guard, or any other realpath-sensitive line.
*Logged 2026-09-14, review round 2 of `fix-flag-eats-target`.*

**CLOSED by `1f33325`, red at `b2e67bc`.** The gate enumerates published packages through
`ownedNames()` — the one list `scripts/ground-truth.mjs` derives and
`test/a-version-number-cannot-name-two-different-trees.test.mjs` holds to every tracked publishable
manifest — and links every bin NAME rather than every deduplicated target, so its reach is now
asserted rather than counted: `assert.ok(bins.length > 0)` is gone.

**The count in this entry was low. It is NINE bin names, not eight, and it ran two of them.** At
`b2e67bc` the gate reds with the seven it never ran — `cmp-inspector-mcp` (`@create-cmp/inspector`),
`create-cmp-cli`, `create-compose-multiplatform`, `create-kmp`, `create-ktor`, `create-mobile` and
`prooflane` — and passes over nine at `1f33325`. What the entry got right is that nothing was broken
behind it; what was broken was the gate's claim about itself. Refuters: a dead entry-point guard
planted in `packages/aliases/prooflane/bin/cli.mjs`, in `create-ktor`'s and in
`inspector/mcp/bin/server.mjs` each reds by name, and narrowing the enumeration back
(`p.dir === "inspector/mcp"` skipped) reds the coverage assertion.

Two of the newly read bins legitimately print nothing on stdout — the inspector is a stdio MCP
server that announces itself on stderr (KD-188), and an alias whose dependency is absent says so on
stderr and exits 1 — so the comparison reads stderr as well as stdout now, and a dead entry point is
stated as what it actually looks like: exit 0 in silence.

### KD-134 — the version deriver names three surfaces where a bump must move four — **CLOSED 2026-09-22**

`scripts/ground-truth.mjs` · `package-lock.json`

`CLAUDE.md` says to ask the programs, not a document, and names `ground-truth.mjs` for "counts and
versions, never by hand". It reports the spine as `cli / plugin / marketplace`. A version bump must
actually move **four** surfaces: those three plus `package-lock.json`, which records the root
manifest's own version in two places.

**Measured on this slice.** Bumping 0.26.4 → 0.26.5 across the three the deriver names left the
suite red: `actual: '0.26.4', expected: '0.26.5'`. The author had read the deriver, moved exactly
what it listed, and was still wrong.

**Nobody is wrongly served, and that is why it is logged.** `test/workspace-lock-sync.test.mjs`
refuses the drift by name with the remedy printed, so the lockfile cannot ship stale. The lock is
also genuinely derived state, which is a fair reason for a *count* deriver not to list it as a
package.

**What is logged is narrower and worse:** "which surfaces must move together" is not derived
anywhere, and the program that exists so nobody hand-counts this answers with three of four. A
reader who trusts it exactly as `CLAUDE.md` instructs is handed an incomplete answer and finds out
from a test. That is the drift `ground-truth.mjs` was written to abolish, in the deriver itself.

*Logged 2026-09-19, review round 1 of the packaging slice — by the reviewer, about the author.*

**CLOSED by `a2570ad`.** `scripts/ground-truth.mjs` derives a **version spine**: the six FIELDS a
bump must move — `package.json`, the lock's `version` and its `packages[""].version`, `plugin.json`,
and the marketplace's `metadata.version` plus every `plugins[*].version` — with which of them lag
printed in the table and answered in `--json`. So the program `CLAUDE.md` sends a reader to now
answers the question this entry says it was asked. Before it, both shipped-surface tests red: the
`--json` answer "never mentions package-lock.json version, package-lock.json packages[""].version",
and the printed table never mentioned the lock; after, 13 pass. Refuters: deleting the two lock
surfaces from `versionSpine()` reds six tests including every fixture, and deleting the print line
from `main()` reds the table test.

The four FILES are this entry's; the FIELD list inside them is the closing slice's own reading, and
`npm version` moves `package.json` and the lock for you — so what the spine is worth is worth
exactly for the hand-edited bump this entry measured.

### KD-31 — the contract vendored into every stamped app names a script no stamped app has — **CLOSED 2026-09-22**

`template/qa/lib/profile-contract.mjs` (comment above `l2Execution`)

"Run it with `node scripts/fleet-check.mjs --ladder-plant`." The template ships no `scripts/`
directory; `fleet-check.mjs` lives in create-cmp and is not vendored. The contract's own header
names "the author" — a person writing a profile, in their own tree — as one of its three consumers,
and this is the one instruction it gives them that their tree cannot carry out. The file already
carries one reference of the same shape (`node scripts/sync-harness.mjs`, `profile.mjs:26`), but
that one says "in the create-cmp repo" beside it.

Not blocking: a reader who tries gets `Cannot find module`, immediately, rather than a wrong answer.
**Fires when:** a second-stack author follows it. *Logged 2026-09-14, review round 1 of
`startup-plant`.*

**CLOSED by `a1c3e16`, red at `330ba88`.** `template/qa/lib/profile-contract.mjs` says the run
happens in the create-cmp repo, in the sentence that gives the instruction, and the CLASS closes
with it: `test/a-vendored-instruction-names-a-script-no-stamped-app-has.test.mjs` scans every
tracked file under `template/` for `node <path>` and refuses a path the template does not ship
unless the SENTENCE the instruction sits in says the script lives in the create-cmp repo. Refuter:
planting "run `node scripts/nope.mjs`" into `template/qa/verify.mjs` reds it.

**It was sixteen instructions, not one, and the sibling this entry called correct is one of them.**
The paragraph above reads `node scripts/sync-harness.mjs` at `profile.mjs:26` as already saying "in
the create-cmp repo" beside it — it says it in the sentence BEFORE, which under the same-sentence
rule is not beside it at all. Fifteen SINGLE SOURCE OF TRUTH headers were live for that reason; all
sixteen now carry the repo in their own sentence. The paragraph reading was measured as the
alternative and refuses exactly one instruction, this entry's, while exempting the other fifteen on
a mention in a neighbouring sentence — a hole, because those headers are precisely where the next
instruction of this kind gets written.

### KD-95 — a worktree under a path with a space in it is a tree this gate refuses to name — **CLOSED 2026-09-22**

`scripts/hooks/proof-gate.mjs` (`literalDir` / `LITERAL_PATH`, and the fleet-check operand reader)

The gate reads the tree a command acts on from the command's own `cd` and from a
`…/scripts/fleet-check.mjs` operand, and it reads both only when they are written literally —
`LITERAL_PATH` excludes whitespace along with `$`, backticks, globs and `~`, and the operand reader
is a `\S*` that cannot cross a space. So `cd "/Users/k/my trees/slice" && gh pr merge` is refused
with "a `cd` this gate cannot read literally", and `node "/Users/k/my trees/scripts/fleet-check.mjs"`
with "a form this gate cannot resolve to a file". Both are true sentences and both are refusals of
work that is real.

The quoted case is the one that could be read exactly — quotes delimit, so a space inside them is
part of the path — and it is not, because the unquoted case next to it cannot be, and one relaxation
without the other is the kind of half-rule that reads as a general guarantee. Nobody is wrongly
served today: every worktree of this repository lives under a space-free path, and the alternative
to refusing is resolving half a path and judging whatever tree happens to sit there — the defect
this slice just closed, made by the gate itself. **Fires when:** a worktree of this repo is checked
out under a path containing a space and a gated command names it. *Logged 2026-09-18, in the slice
that added the reader (KD-79).*

**CLOSED by `87ae6d4`, red at `af85171`.** A `cd` operand and a `…/scripts/fleet-check.mjs` operand
are read from the command as written, so a wholly quoted path with a space in it resolves exactly,
while everything the shell would expand, escape or assemble from pieces — a substitution, a glob, a
`~`, an escape, a path built from adjacent pieces — stays refused. The oracle is `/bin/sh` itself:
`test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs` gained seven rows, and
`test/a-worktree-under-a-path-with-a-space-in-it-is-a-tree-the-gate-can-name.test.mjs` is the red
one at `af85171`. `docs/GATE-RULES.md` moved in the same commit, and its "runs 24 shapes" sentence
now names the table rather than a count.

**Half of what this entry recorded was wrong, and the wrong half was the fail-open one.** It says
`node "/Users/k/my trees/scripts/fleet-check.mjs"` was *refused* with "a form this gate cannot
resolve to a file". It was not refused: measured on `4b81ee1` by calling the module's own
`classify`, that command returns `null` — the hook printed nothing and the device run went ahead
**ungated**. Silence, not refusal, which is the opposite direction from the one this entry argued
was safe. The `cd` half is right about the refusal and wrong about its cause: `cd "/tmp" && gh pr
merge` was refused too, with no space in it at all, because `readablePrefix` blanks every quoted
span before `CHDIR` looks for the operand, so `LITERAL_PATH`'s whitespace exclusion was never
reached.

**What stayed open, named rather than guessed at:** two spellings of a fleet-check run are still
silent (KD-190), the `cd` reader's command position is still a bare separator where
`COMMAND_PREFIX` is not (KD-189), an unquoted brace expansion is still read as a literal path
(KD-192), and the oracle's failure message still describes the gate's answer as the shell's
(KD-193).

### KD-119 — a KD number is allocated per branch, and two branches in flight allocate the same one — **CLOSED 2026-09-22**

`docs/KNOWN-DEFECTS.md` (the open table and its entries), `scripts/hooks/proof-gate.mjs` (comments
that cite a KD number)

Measured 2026-09-18 at this slice's final re-record, between this branch and `origin/main` at
`4b59451`. Both files number their new entries from the highest number they can see, and neither
branch can see the other's. As found, FIVE numbers named two unrelated defects each:

    this branch   KD-109  KD-110  KD-111  KD-112  KD-113   (109-111, 113 open; 112 closed)
    origin/main   KD-109  KD-110  KD-111  KD-112  KD-113   (all open)

`origin/main`'s KD-110 is the preflight guarding `npm test`; this branch's was `COMMAND_PREFIX`'s
three alternatives. Its KD-113 is a nameless workspace spelled two ways; this branch's was the letter
sweep's blind direction. The table rows and entry bodies collide in the same file, so a rebase puts
both in front of whoever does it — the same surface as `b3670aa`, "the rebase kept both copies of
this branch's own rows", one step earlier. **What a rebase does NOT put in front of anybody is the
citation in code:** `scripts/hooks/proof-gate.mjs` cites KD numbers in three comments, and no
conflict hunk ever shows them.

**The collision itself is FIXED, in the commit that logged this:** this branch's five ids were
renumbered to 114-119 — above `origin/main`'s maximum, in every file that carries one including the
three code comments — BEFORE any rebase, because renumbering inside conflict hunks misses the entry
sections that do not conflict. What stays logged is the absence of anything that makes that routine,
and the fact that this entry's own body was rewritten by the renumber that fixed it: a blanket
substitution moved the `origin/main` row of the table above as well as this branch's, which is the
smallest possible demonstration that a KD number is a string in prose and nothing else.

**Direction: a reader is sent to the wrong entry, and nothing else.** No program in this repo parses
a KD number — grepped `scripts/` and `test/`, and `proof-plan.mjs`'s only mention of this file is a
sentence naming it — so no gate, refusal or count routes on one. Nothing false reaches an adopter.
The rule that avoids it is that the number comes from a place both branches can see — `origin/main`'s
highest, re-read at logging time, not the branch's own — and it is a convention, not a program.
Making it one is cheap to state and not free to get right: the deriver would have to fetch, which is
the thing `scripts/proof-plan.mjs` deliberately never does because a gate that fetched would move
the baseline it judges. So the convention stands, unenforced, and this entry is the record of what
it costs when it is missed. *Found 2026-09-18 by the third declared substitute reader, at the final
re-record of the slice that closed KD-107 — outside the four confirmations that re-record was
bounded to, so it landed as a log entry rather than a fix. The author took the fix on the same pass,
because a renumber is cheaper before a rebase than inside one.*

**CLOSED by `3516dc7`.** `node scripts/kd-next.mjs` allocates the next number from every place that
can hold one — the working tree, `origin/main` and every open PR head — prints what it read place by
place, and names on stderr anything it could not reach. So the convention this entry recorded as
"unenforced, and stated in prose" is a program now, and the header of `docs/KNOWN-DEFECTS.md` sends
a reader to it. It does not fetch to get there: it reads `origin/main` as the local remote-tracking
ref and the PR heads through `gh`, which is why the account it prints is part of the answer rather
than a footnote.

What it cannot see is a branch with no pull request — this wave's own shape — and that is logged as
KD-191 rather than carried here. `test/a-kd-number-is-allocated-per-branch-so-two-branches-allocate-the-same-one.test.mjs`
holds the program.

### KD-85 — apps stamped through 0.26.2 keep the unanchored hooks, and nothing this repo can run will fix them — **CLOSED 2026-09-22**

`template/.claude/settings.json` (fixed in 0.26.3) · `src/commands/doctor.mjs` (`applySafeFixes`)

Through 0.26.2 the template shipped three cwd-relative hook commands — `Stop`
(`node qa/receipt-check.mjs --hook`), `UserPromptSubmit` and `statusLine` (both
`test -f qa/walk-status.mjs && … || true`). Claude Code runs a hook in the SESSION's working
directory, so a session opened in a subdirectory loses the Stop gate loudly and loses the walk's
status line and prompt injection **silently**, because `|| true` turns a wrong directory into a
clean exit with no output. payment-blueprint hit the loud half on 2026-09-02 and anchored its own
copy on 2026-09-10; the template was never fixed, so every app stamped in between carries it.

**This slice anchors the template and gates it, and that reaches new stamps only.** Two reasons
the existing population stays broken, and neither is age:

1. Those trees are *other repositories*. No commit here edits them, which is the KD-78 shape — the
   entry exists so the gap is recorded rather than mistaken for coverage.
2. `create-cmp doctor --fix` is the one command that already writes into an app's
   `.claude/settings.json`, and it deliberately **adds** the walk wiring without ever rewriting a
   hook the app already has. That restraint is correct (it is the app's file), and it is also why
   the heal cannot carry this fix. `test/doctor-walk-wiring.test.mjs` pins the legacy string
   deliberately so the limit is stated rather than discovered. What the heal writes IS anchored,
   because it copies the template — gated in the same file.

**What the fix would be, when it is taken:** a `doctor` finding that reports unanchored commands
(the detector is already exported — `anchorViolations` in `src/lib/hooks.mjs`), and a heal that
rewrites only commands matching the shapes the template itself shipped, leaving anything an app
authored alone. That is a new adopter-facing diagnosis with its own consent question about
rewriting a file the app owns, so it is a slice, not a line — and it is the same change that would
close KD-86's half of this.

**RE-PLACED 2026-09-19, and half the recorded reason was not a reason.** It read *"no act available
here — those trees are other repositories; and no command an adopter runs would tell them."* The
first clause answers who can be REACHED from this repository; the second answers who is SERVED, and
that is the header's row-1 question. The second is now false: `create-cmp doctor` reads the app's
own `.claude/settings.json` and names each walk surface whose invocation will not resolve, with the
exact anchor to write for a hook (`src/commands/doctor.mjs`, `cwdRelativeWalkSurfaces`). The
population that was broken AND uninformed is now merely broken and informed, which is row 2.

**What this slice did NOT do, stated so the entry is not read as closed.** (1) No heal. Rewriting a
command an app authored still needs the consent question this entry names, and `--fix` still only
adds. (2) **Only two of the three commands are reported.** The finding filters to the walk
(`walk-status.mjs`), so a 0.26.2 app's `Stop` hook — `node qa/receipt-check.mjs --hook` — is still
diagnosed by nothing here. That one fails LOUDLY, which is why it is the third and not the first:
the silent pair is what an adopter could not otherwise find out.

**CLOSED by `63ba3f0`, red at `1581d00` (7 of 8 cases), finished at `f760f35`.** Both halves this
entry said the fix would be. The DIAGNOSIS: `shipped-hooks` and `unanchored-hooks` name every
anchorable hook surface that will not resolve, the Stop hook this entry recorded as diagnosed by
nothing included. The HEAL: `create-cmp doctor --fix` rewrites a hook command **in place** — the
command string changes and no other byte of `.claude/settings.json` does, so an app's own
formatting, escapes and hand-written hooks survive verbatim. What may be rewritten is bounded by a
committed table of every command the template has ever shipped (`src/lib/shipped-hooks.mjs`, every
string taken from git history) and narrowed again to a pair that differs by the anchor alone, so the
rewrite runs the same script whatever version of the lane the app carries. The consent question this
entry named is asked: `--yes` approves, a non-interactive run declines and prints what it would have
done, `--dry-run` previews and writes nothing. A command the app wrote is never rewritten — it is
reported with the anchored form to paste. The status line is still never rewritten (KD-90).

**The reach is TWO commands, not one, and this entry's row 2 is wrong about that.** It says
`doctor --fix` "is the one command that already writes into an app's `.claude/settings.json`".
`create-cmp upgrade --harness` also does: that file is in neither exclusion list of the sweep, and
`decideFile` returns `applied` whenever the app's copy equals the base stamp. Measured through the
same decision function the planner calls, with real bytes — an app that never touched the file gets
the current template exactly, an app that added its own hook gets a three-way `merged` file in which
**its own hook survives and both anchors land**, and an app that replaced or hand-anchored
create-cmp's own command gets `conflicted`: its file is NOT rewritten and the engine's version lands
beside it as `.cmp-new`. Preserved or merged, never clobbered — and the one case the merge refuses is
the same case the table heal refuses, because a hand-edited command is not a shipped form. The two
doors differ in mechanism and agree in outcome; the second one is logged as KD-194, with what was and
was not measured.

**What this closure does not reach, unchanged.** The population is still other repositories: no
commit here edits them, and an app is repaired when somebody runs `create-cmp doctor --fix` or
`create-cmp upgrade --harness` in it. That was always the remedy this entry named. KD-86's crediting
half goes with it — a bare-basename hook can no longer be read as health, because credit now requires
byte-recognition rather than the detector's silence — but KD-86 stays open for its detection half,
and KD-87's blind spot is likewise improved and not closed. KD-90 (the status line is unanchorable),
KD-180, KD-181 and KD-183 stay open as written, and KD-183's population is widened by KD-195.

*Closed 2026-09-22. The dry-run defect found while closing it — `doctor --fix --dry-run` wrote
`local.properties`, `gradle.properties` and a created `.claude/settings.json` — was ruled blocking
and fixed in the same branch by `af1bfbe` rather than logged, so it has no entry here.*

### KD-131 — one tree, two verdicts: a fixed-port preview-service test under full-suite load — **CLOSED 2026-09-22**

`inspector/mcp/test/preview-service.test.mjs:2922` · `qa-artifacts/suite-history.jsonl`

Measured 2026-09-19 while gating the round-pricing slice. The full suite ran twice over bytes
nothing had touched in between, and the kept records say it plainly — same `observedHash`
(`e386597…`), `FAIL` at 22:10:52Z and `PASS` at 22:12:22Z. The failing assertion is
`assert.match(page, /NOT refreshing/)`: the service was in the right state (`stale`, `pending:
false`, `phase: "unrefreshed"` all asserted and passing on the line above), and what came back from
`fetch` was a console page that did not carry the banner. Run alone, the file is 83/83.

Two things in the test are load-shaped rather than logic-shaped: it binds a FIXED port (19737)
rather than an ephemeral one, and it waits for `phase !== "idle"` on a 100 × 20 ms budget that a
busy machine can exhaust. A fixed port makes "the page I fetched is the service I started" an
assumption rather than a derivation, which is this repository's own
`served-page-is-not-your-code` shape one process over.

**Why it does not block.** No adopter runs create-cmp's inspector tests, and nothing in the failing
path is imported by the slice that observed it — the change under gate was `scripts/`, agent
definitions and docs. The second record over identical bytes IS the evidence that it is
non-deterministic rather than a break: a deterministic consequence of a diff does not pass ninety
seconds later on the same tree.

**Why logged and not fixed.** `inspector/mcp/` is another slice's file, KD-56 already holds the
class for it ("fails inside a full suite run and passes alone", and it names the owner), and the
honest fix — an ephemeral port and a derived readiness wait — is a change to a test this slice has
no business editing while gating something else. What this entry adds is the measurement KD-56 asks
for and a warning to the next reader of this branch's suite history: the `FAIL` row is this, and it
is followed by a `PASS` over the same hash.

*Logged 2026-09-19 by the slice that ran the suite, before any review round.*

**CLOSED by `1201495`.** The fixed port 19737 and the 100 × 20 ms budget are both gone: the service
takes an ephemeral port, the wait is derived rather than counted, and the page is fetched BETWEEN two
equal readings of the freshness — so the banner is judged only against the state the page was actually
served from, and "the page I fetched is the service I started" is a derivation instead of the
assumption this entry named.

Two things were ruled out on the way and are worth keeping. It was **not** a port collision:
`status().url` reports the port the service really bound and the service probes upward on EADDRINUSE,
so a collision cannot misroute the fetch — the fixed port was removed anyway, because it is a bet.
And it is **not** CPU load alone: 40 runs of that test under 24 burners were all green, which matches
KD-56's own note about this family. What explains the FAIL is the state moving between the assertions
and the request, which the fix makes impossible to mistake.

### KD-165 — one tree, two suite verdicts, three minutes apart — from a test whose verdict rests on wall-clock budgets — **CLOSED 2026-09-22**

`test/a-git-call-that-died-outside-the-kill-timer-is-read-as-an-answer.test.mjs` (second case),
`qa-artifacts/suite-history.jsonl`

Both rows are against the SAME `observedHash` (`b359f866…`) and the same commit (`bf79f72`):

```
05:47:00Z  FAIL  2122/2124   268552 ms   failing: "a git call that died outside the kill-timer
                                          is not an answer: crashing each one in turn must cost
                                          the check its verdict, never win one"
05:50:02Z  PASS  2123/2124   105713 ms   failing: []
```

The FAIL was what `node scripts/proof-plan.mjs` read out for this tree at the start of this
review — *"read it, do not re-run it"* — and the PASS was appended while the review was running.
Both are true of the same bytes, which is the whole entry.

**It is not this slice's code.** That file imports `scripts/hooks/proof-gate.mjs`; nothing in the
KD-16 change — neither parser, neither bin, none of the six installer read sites — is on its
import graph. What separates the two runs is load: 268552 ms against 105713 ms, and against
35489 ms and 36400 ms for the two full runs of this same branch ninety minutes earlier.

Executed here, 2026-09-19, on the same bytes:

```
$ node --test test/a-git-call-that-died-outside-the-kill-timer-is-read-as-an-answer.test.mjs
  ✔ 2 pass, 0 fail, duration_ms 7722          (the case itself: 7423 ms)
$ 12 concurrent CPU burners, same command
  ✔ 2 pass, 0 fail                             (the case itself: 4048 ms)
```

So it did not reproduce at the load available here, and this entry claims no diagnosis it cannot
show. What the test's own structure shows is where load reaches it: each of its six cases spawns
git with `budgetMs: REMOTE_CALL_CAP_MS` and then asserts `elapsed < NO_CAP_WAS_WAITED_OUT_MS` —
two wall-clock bounds per case, either of which a loaded machine crosses without the code under
test being wrong. Its own failure message names the first and tells the reader to *"raise
budgetMs at this call site, do not relax the bound"*.

**Why logged and not fixed.** No adopter runs this repository's suite, and the refusal the test
guards is not degraded — it is green whenever the machine is not saturated. Raising either bound
is the one remedy the test explicitly refuses. This is KD-131's class exactly (the same bytes
carrying a FAIL and a PASS, both on disk), with one thing genuinely new: KD-131 and KD-56 both
scope themselves to `inspector/mcp/`, and this member is a test of the **proof gate's own refusal
path**, so the sentence *"no adopter runs this repository's inspector tests"* no longer covers
the class.

**What a reader of the record cannot tell.** `suite-history.jsonl` records the verdict, the
duration and the tree, and nothing about the machine — so the only evidence that the FAIL was
load and not a defect is the duration beside it, read by a human. A gate that consumed these rows
would have to pick one of the two answers for one tree, and nothing tells it which.

**Fires when:** the suite runs on a machine busy enough to stretch it past ~3×, which on this
project is a device lane, a Gradle build, or several agent sessions at once.
*Logged 2026-09-19, review round 2 (re-record) of `fix-boolean-value-form-inverted-2`. Found by
reading the plan's suite line rather than re-running it — and corrected in the same round when
the PASS landed underneath it.*

**CLOSED by `d3ff9c0`.** The two wall-clock bounds per case are replaced by what the run RECORDED —
the shim's own `reached` / `survived` marks and the gate's own `why` sentence — so each case is proven
by which path the run took rather than by how fast the machine was. The one remedy the test itself
refuses was not taken: the bound is not relaxed, the purse is raised to 60 s, which is what its own
failure message names.

Measured both ways. The UNCHANGED file under 32 burners: **1 RED in 12 runs** — `` `git …
--is-ancestor …` died on SIGTERM but the whole check took 667ms ``. The rewritten file under the same
32 burners: **12/12 green**, with per-case elapsed values of 636, 699, 802 and 846 ms — every one past
the old 600 ms bound, and every one a run in which the gate was right.

**What this entry logged about the RECORD is unchanged and still true.** `suite-history.jsonl` records
the verdict, the duration and the tree and nothing about the machine, so no reader and no gate can
tell load from defect for the next member of this class; this closure removes one member, not the
class. One further member was found inside this test's own output and is logged as KD-205 — the
ordering check's `contains()` / `behindBy()` call site drops the `why` that says which of four causes
killed a git call.

### KD-56 — one unreproduced failure, and the instrument that saw it discarded the reason — **CLOSED AT THE TEST 2026-09-22; the production half is KD-202**

`node scripts/fit-test.mjs` ran `npm test` while `fleet-check` was compiling the scratch app and
booting the emulator, and reported `1951/1952 — 1 FAILING ✖ inspector/mcp/test/console-now-sse.test.mjs`
on `f2f7d24`. Nothing that followed reproduced it: that file alone five times with the emulator
running, 5/5; the full suite idle, 1951/1951; the full suite with all eight cores saturated by `yes`,
1951/1951. The slice touched neither the test nor `steps-bridge.mjs`/`preview-service.mjs`.

Two readings of the source narrow it. The lane-silence bound is 30 minutes, so the fixture's
`startedAt` cannot go stale inside a run. And `watchStepStream` polls once a second behind its
`fs.watch` — written precisely because "fs.watch on macOS coalesces and can drop under load" — so a
dropped FSEvents notification cannot outlast the test's 8 s frame deadline. What remains is a
test-process event loop starved for most of 8 s, under a load CPU alone did not recreate (the real
condition also had Gradle's and the emulator's disk I/O), or a failure that is not a frame timeout.

**It is logged and not chased further because the message is gone**, and that is the finding worth
keeping. `fit-test.mjs` runs the suite fresh and parses its stdout for the NAMES of failing tests — its
own comment says a bare count is unactionable — and discards the rest, so the one run that failed left
a name and no reason. Keeping the failing tests' output (or the whole log, under `qa-artifacts/`) is
the change that turns the next occurrence into a diagnosis. Not an adopter-facing defect: it is a test
of the live console's transport, which has the fallback that would make the real feature survive this.
*Logged 2026-09-16, during the device tier of `published-bytes-drift`.*

**THE MESSAGE, 2026-09-18 — and it is not what this entry guessed.** It recurred twice in one hour on
the `gate-judges-the-tree-the-command-acts-on` branch, under a full `npm test` and not under a lane;
the file passes 3/3 alone, immediately after, every time. Kept verbatim this time, which is the change
this entry asked for:

```
Error: Test "a line appended to the stream arrives as the RENDERED row — the page interprets nothing"
at inspector/mcp/test/console-now-sse.test.mjs:113:1 generated asynchronous activity after the test
ended. This activity created the error "TypeError: Invalid URL" and would have caused the test to
fail, but instead triggered an unhandledRejection event.
```

So it is **not a frame timeout**, which is what both readings above narrowed to, and not a starved
event loop: it is work the test leaves running after it returns, which then throws `TypeError: Invalid
URL`. Node's runner attributes post-test async activity to the test that spawned it, so the *reported*
failure is a test that had already passed — which is why every isolated re-run is green and why this
looked like load sensitivity for two days. The suspect is an un-awaited fetch or EventSource in the
`:113` test whose URL is built from a server that the test's own teardown has already closed. **Whose
defect: the test's, not the transport's** — nothing here says the console is wrong, and the two
readings above stay correct about the transport. The fix is to await or abort that activity before the
test returns, in a slice that owns `inspector/mcp/`.

**This is now a producer, so it is no longer unreproduced.** It cost this branch two recorded suite
verdicts and one of them stood as a `FAIL` the gate told its author not to re-run.
*Re-placed 2026-09-18 with the message it was missing, by the slice that hit it.*

**CLOSED AT THE TEST by `4413078`, and the production defect it was hiding is open as KD-202.** The
symptom is out of the suite: the three services in `inspector/mcp/test/console-now-sse.test.mjs` that
asked for `port: 0` — the standard way to ask the OS for a free port — were handed the console's
well-known port instead (`opts.port || DEFAULT_PORT`, and `0 || 9600` is `9600`), and were measured
binding **9601**, which is `DEFAULT_DAEMON_PORT`. Every console's `stop()` fires `GET /shutdown` at
that address unconditionally, daemon or no daemon, so a test service was sitting exactly where the
stray request goes. Those three now take an OS-assigned port that nothing else in the suite
addresses.

**The mechanism this entry asked for, measured rather than narrowed.**
`inspector/mcp/src/lib/preview-service.mjs` builds ``new URL(req.url, `http://127.0.0.1:${port}`)``
OUTSIDE its `try`, and `stop()` sets `port = null` after `server.close()` — which does not end a
request already in flight. A request landing in that window is handled with a null port, the URL
constructor throws `TypeError: Invalid URL`, and because the listener is `async` it becomes an
unhandledRejection, which node's runner attributes to whichever test most recently finished. That is
this entry's kept message verbatim, blaming the `:113` test that had already passed. Reproduced
deterministically: start a service, connect a raw socket, send half a request, call `stop()`, send
the rest.

**So the suspicion this entry recorded was wrong in its subject.** It reads "an un-awaited fetch or
EventSource in the `:113` test whose URL is built from a server that the test's own teardown has
already closed" — nothing in that test is at fault, and *"whose defect: the test's, not the
transport's"* is the wrong way round. The production half is NOT fixed here: it is shipped bytes plus
a `dist/server.mjs` rebuild, which belongs to the slice that owns `inspector/mcp/`. It is logged as
**KD-202**, with the two facts that put a request in that window logged beside it — **KD-203**
(`port: 0` is read as the default) and **KD-204** (`stop()` always sends `GET /shutdown` to the
daemon port). The change this entry asked of `fit-test.mjs` — keep the failing run's output — was
not made either; what closed this was the message being kept by hand in 2026-09-18's re-placement.

### KD-217 — `--fleet`'s empty form was traded for the generic sentence; two docblocks in the same file disagree about it — **CLOSED 2026-09-23**

`src/lib/args.mjs`, `packages/harness/install/args.mjs` (the `DESTINATION_FLAGS` docblock vs. the
`emptyValues` docblock immediately below it)

Both copies say, of `DESTINATION_FLAGS`: *"`--fleet` is deliberately NOT here … it already refuses
both its empty and its bare form with a sentence that teaches the manifest format. Folding it in
would trade that sentence for this one."* `emptyValues` tests `flags[k] === ""` for **every** value
flag before consulting `destinations`, so the empty form is already traded — keeping `--fleet` out
of `DESTINATION_FLAGS` only preserves the **bare** form's sentence. The `emptyValues` docblock
twelve lines down says the opposite (*"this is that refusal for every value flag, before any
command runs"*), and the same slice's own test asserts the new behaviour
(`an-empty-directory-flag-installs-into-the-working-directory.test.mjs:133`, *"every value flag the
installer takes refuses an empty value by name — `--profile=`, `--fleet=`"*). Measured on
`e21fc3d`:

```
$ prooflane upgrade --fleet=
  ✗ prooflane: --fleet needs a value, and was given none …      exit 2
$ prooflane upgrade --fleet
  ✗ --fleet needs the path to a fleet manifest.  A fleet is a file you write… exit 2
```

Both refuse and write nothing, so nobody is wrongly served; one fact has two spellings in one file
and the first is false.

**Fires when:** anyone reads either docblock to decide what `DESTINATION_FLAGS` buys.
*Logged 2026-09-22, round 1 of the doors review.*

**CLOSED by `8a0b7fc`, confirmed by the round-2 reviewer.** Both `DESTINATION_FLAGS` docblocks —
`src/lib/args.mjs` and `packages/harness/install/args.mjs` — no longer say that folding `--fleet` in
"would trade that sentence for this one". They now say what the two measurements above show:
`upgrade --fleet=` is already refused by `emptyValues` with the generic sentence, because that check
runs for every value flag before the destination set is consulted, and only the BARE `--fleet` still
reaches `fleet.mjs`'s sentence teaching the manifest format — which is the whole reason for keeping
`--fleet` out of the set. One fact, one spelling, and it agrees with the `emptyValues` docblock below
it. `8a0b7fc` is on `wave/review-doors` and is not yet an ancestor of the branch this closure was
written on; it lands when that branch merges into the wave, ahead of this one.

### KD-16 — a boolean flag's value form is consumed by a reader that cannot read it — **CLOSED 2026-09-19**

`packages/harness/install/args.mjs`, `src/lib/args.mjs` (`consumesNext`, `flagBool`)

`consumesNext` lets a declared boolean swallow the next token when it is exactly `true` or
`false`, and its docstring gives the reason: "`flagBool` is tri-state by contract". Two places
that value arrives where nothing is tri-state: `packages/harness` has no `flagBool` at all (every
reader is truthiness, and `Boolean("false")` is `true`), and `flagBool` reads the value form of
`x` but never of `no-x` while `consumesNext` consumes it either way.

Re-opened by review round 1 of `refuse-unknown-args`, because `5c2cea6` moved it to **Closed**
under a heading that describes KD-17 ("the flag lists could not reach a typo or a short flag"),
and refusing an unrecognised argument cannot reach it: `--dry-run` and `--no-ios` are both
*recognised*. Both halves reproduce verbatim on `5c2cea6`:

```
$ cd cwd && prooflane init --dry-run false ../pC --no-interview
  project: …/pC   ✓ 50 files written   ! --dry-run: nothing was written.

$ node -e 'parseArgs(["--no-ios","true","./my-app"])'  →  {"no-ios":"true"}
  flagBool(flags, "ios", true)  →  true          ← the flag the user typed does nothing
```

**Its placement was wrong, and the reason it kept was the abolished exemption in a new costume.**
The entry said "neither half is a regression … and an adopter is no worse served than before" —
which is *pre-existing*, the criterion this file's header struck off the line on 2026-09-14,
wearing the words "no worse than before" instead of the word "pre-existing". The header's own
answer is that age decides who paid for a defect and never whether it blocks; the question is
whether shipping it WRONGLY SERVES an adopter. Re-placed against that line on 2026-09-19 and
measured on `8bd782a`, it is the first row twice over — *given a tree they did not ask for*, and
*sent into a refusal* the wrong way round:

```
$ create-cmp upgrade --dry-run true --yes --target-dir <a two-line version catalog>
  Apply these changes (backups written as *.bak-upgrade)? (auto-yes)
  ✓ wrote gradle/libs.versions.toml (backup: gradle/libs.versions.toml.bak-upgrade)
  Applied.

$ prooflane init --new-profile false --dry-run --no-interview <a tree the cmp profile claims>
  ✓ 51 files written          ← the claimed-tree refusal (install/init.mjs:950) never fired
```

An adopter who wrote `--dry-run true` had their version catalog rewritten, with the consent
prompt skipped by the `--yes` on the same line — the flag that protects the tree was the one
misread, and the flag that removes the last question was the one read correctly.

**CLOSED at the parser, which is the only place that reaches every reader.** A declared boolean
that consumes `true`/`false` now stores the BOOLEAN, at both doors and at the harness door's `=`
branch, so the ~24 sites spelled `=== true` / `!== true` / `Boolean(...)` are right without one
of them being edited. `flagBool` reads `x` and `no-x` through one tri-state helper (`--no-x
false` is true; today's precedence — the affirmative name answers first — is unchanged and now
pinned), the harness package has the same `flagBool` and its six boolean reads go through it, and
a declared boolean still holding a string after all that (`--dry-run=maybe`, reachable only
through the `=` form) is refused by name at both bins. The SPACE form holding anything else is
deliberately not refused: that is KD-7's shape, and KD-150 logs what it costs.

*Logged 2026-09-14 (review round 2 of `fix-flag-eats-target`); closed and re-opened 2026-09-14;
closed 2026-09-19 by the slice that fixed it, with
`test/a-dry-run-asked-for-in-words-writes-the-tree.test.mjs` and
`test/a-declared-booleans-value-arrives-as-a-string.test.mjs` — 54 of the truth table's 162 rows,
and all three end-to-end shapes, measured red on `8bd782a` first.*

### KD-117 — one measurement, two defect numbers: the doc credited KD-79 where the code credits KD-105 — **CLOSED 2026-09-18, in the round that found it**

`docs/GATE-RULES.md` (Rule 4) vs `scripts/hooks/proof-gate.mjs` (`IN_WORD`, `GAP`)

Both sentences describe the same measurement — fifteen shapes of the construct sweep went from
refused to READ when a word in the wrapper run was written `\S*`, `time . /x/s.sh; gh pr merge`
among them, "the six-shape class whose fix had just closed". The code comment said that class is
**KD-105**'s and the doc paragraph two files away said it is **KD-79**'s. KD-105 is the entry that
carries the six shapes; KD-79 is the device-tier scheduler defect. They disagreed because one commit
corrected the comment while rewriting the paragraph that carries the same citation and leaving its
number alone.

Nothing was decided on it — no verdict, tree or refusal reads either sentence — and the reviewer
placed it as logged, in KD-28's shape, on the ground that "the citation names the entry that carries
the measurement" is not a statement a program can decide. **Closed rather than logged because the
remedy was one word and the round was already open:** `docs/GATE-RULES.md` now says KD-105, which is
what the code says and what `KNOWN-DEFECTS-CLOSED.md` carries. The reviewer's argument against a
mechanical guard stands and no guard was added; every `KD-NNN` in this repository that a checker
could resolve already does. *Found in review round 2 of the slice that closed KD-107, and corrected
in it.*

### KD-107 — the two readers agree in one direction, and the other direction is where the gate goes silent — **CLOSED 2026-09-18**

`scripts/hooks/proof-gate.mjs` (`COMPOUND` vs `invocation`)

KD-105 was *the two readers in this file do not mean the same thing by a command position*, and the
fix gave `COMPOUND` a wrapper run of its own. It is a second literal spelling, not the shared
declaration KD-105's entry proposed, and it is not the same list: `COMPOUND` carries
`!|nohup|time|env|caffeinate|sudo|command|builtin` plus `\d*[<>]+\S*` redirections, `invocation()`
carries `nohup|time|env|caffeinate|sudo` and nothing else. So the two still answer differently — now
with `COMPOUND` the wider one, which is the safe direction FOR COMPOUND and the unsafe one for the
reader that decides whether this gate runs at all.

Measured 2026-09-18 at `7bc38dd`, by feeding the hook a real `PreToolUse` payload on this worktree:

    gh pr merge 1 --rebase               deny
    time gh pr merge 1 --rebase          deny
    ! gh pr merge 1 --rebase             SILENT — classify() returns null, no gate runs
    command gh pr merge 1 --rebase       SILENT
    2>/dev/null gh pr merge 1 --rebase   SILENT
    timeout 300 gh pr merge 1 --rebase   SILENT

`classify()` returning null makes the hook `return` before any verdict, so these merge without the
proof gate having an opinion — a fail-open at the door rather than in the tree-reading this slice is
about. It is also why the comment above `COMPOUND` still cannot be read literally: it says *the same
rule `WATCHED` uses*, which is what `168187f`'s comment said and what KD-105 was written about, and it
is no truer now, only untrue in the opposite direction.

**Direction: fail-open, and UNCHANGED FROM `main`** — `invocation()` is byte-identical on `main` and
on this branch; nothing in this slice widened or narrowed it, and merging changes nothing about which
commands reach the gate. **No producer:** every merge, publish and fleet-check in this repository is
typed bare or behind a `cd`, and the four wrappers that a human or an agent plausibly writes in front
of a long command — `time`, `env`, `sudo`, `nohup` — plus `VAR=x` assignments are all classified
today. **The fix is one declaration, not two lists:** export the command-position prefix once and let
both readers spell it from that, which is the invariant KD-105's closed entry already names and the
only thing that stops this pair drifting a third time. *Logged 2026-09-18, at the re-record of review
round 2 (KD-79's slice). The placement call is the reviewer's: it is a fail-open, and it blocks
nothing only because merging is not what introduces it.*

Closed by `COMMAND_PREFIX` in `scripts/hooks/proof-gate.mjs` — one exported declaration of what may
stand between a separator and a command, embedded by BOTH `invocation()` and `COMPOUND`, with a test
that reads it back out of each so a third spelling cannot be added without failing. The accepted
wrapper words are a closed list stated in `docs/GATE-RULES.md` (Rule 4) and bound to the code by the
same test; what the list does not read through is named there and logged as KD-114 rather than
inferred. The separator classes were deliberately NOT unified, and that is the one place the fix
departs from the entry above: the two readers run at different moments — `invocation()` on raw text,
`COMPOUND` after every quoted span has been blanked — so `-c "` is meaningful only to the first and
`{`, `}` and a `case` pattern's `)` are structural only to the second. Unifying those would make
`git commit -m "{gh pr merge}"` a merge, which is KD-64's mistake in a new costume.

`test/a-wrapper-word-walks-an-unproven-merge-past-the-gate.test.mjs` holds it, with `/bin/sh` as the
oracle in the same shape KD-79's slice landed: a stand-in `gh`, `npm` and `node` on PATH record
their own argv, so "this shape really invokes a merge" is measured rather than asserted. 135 of 180
shapes were silent when it was written. **The unification also weakened a refusal before it fixed
anything, and the sweep KD-105's fix landed is what said so:** written with `\S*` for a wrapper's
operands, the run swallowed its own `;` and the match began at the start of the line, so the prefix
`commandCwd` reads shrank to nothing and fifteen shapes of
`test/a-construct-this-reader-cannot-follow-is-refused-wherever-it-stands.test.mjs` went from
refused to READ — including `time . /x/s.sh; gh pr merge`, the six-shape class KD-105's own fix had
just closed. No word in a command prefix may cross a character that ends a command, newline
included; that clause is in the declaration because a guard test refused the version without it.

### KD-105 — `COMPOUND` and `WATCHED` do not mean the same thing by "a command position" — **CLOSED 2026-09-18, in the round that found it**

`scripts/hooks/proof-gate.mjs` (`COMPOUND`, `invocation`)

`168187f` narrowed `COMPOUND`'s boundary to `(?:^|[;&|(){}\n])\s*` and its comment says this is
*the same rule WATCHED uses*. It is not the same rule. `WATCHED`'s `invocation()` spells a command
position as a separator **plus an optional run of wrapper words and assignments** —
`(?:nohup|time|env|caffeinate|sudo)(?:\s+-\S+)*\s+` and `[A-Za-z_][A-Za-z0-9_]*=\S*\s+` — because
those are exactly the words a shell allows in front of a command without ending the command
position. `COMPOUND` now accepts only the separator. So one reader in this file says `time X` is a
command position and the other says it is not, which is the two-spellings-of-one-fact shape, and it
drifted in the reader that was edited.

The consequence is a fail-open, measured 2026-09-18 with the same oracle the slice's own test uses —
`/bin/sh` with the gated command replaced by `pwd -P` — over 12 constructs × 10 command positions,
120 of which the shell ran to completion. 114 refuse correctly. Six resolve the payload's cwd where
the shell has moved:

    time . <dir>/s.sh; gh pr merge 1        shell: <dir>    gate: the payload's cwd
    ! . <dir>/s.sh; gh pr merge 1           shell: <dir>    gate: the payload's cwd
    time source <dir>/s.sh; …               shell: <dir>    gate: the payload's cwd
    ! source <dir>/s.sh; …                  shell: <dir>    gate: the payload's cwd
    time eval cd <dir>; …                   shell: <dir>    gate: the payload's cwd
    ! eval cd <dir>; …                      shell: <dir>    gate: the payload's cwd
    FOO=bar . <dir>/s.sh; …                 shell: <dir>    gate: the payload's cwd
    2>/dev/null . <dir>/s.sh; …             shell: <dir>    gate: the payload's cwd

Only the three keyword-ONLY constructs leak: `if`/`for`/`while`/`case`/`{ }` after `time` or `!` are
still refused, because their own internal `;`/`{` re-establishes a separator for `COMPOUND` to find.
`. ./env.sh && gh pr merge`, with no prefix, is still refused — the unprefixed forms are unaffected.
All eight shapes above were REFUSED at `91b4129` under the old whitespace boundary, so this is a
regression the fix opened while closing the false positives it was for; the old boundary refused
them for the wrong reason (it refused `git add .` too) and this is the sliver where the wrong reason
happened to give the right answer.

**Direction: fail-open** — the session's tree is judged in place of the command's, which is KD-79's
own direction. **No producer:** nothing in this repository, its session logs, or the surfaces that
produce these commands writes a wrapper word, a `!` or a `VAR=x` assignment in front of a sourced
script or an `eval` before a gated command; a merge here is typed as `gh pr merge --rebase
--delete-branch` with at most a leading `cd`. **The fix, when it is taken up, is one edit and not a
parser:** give `COMPOUND` the prefix run `WATCHED` already declares, from one shared declaration, so
the two cannot answer the question differently again — the invariant being *the two readers in this
file agree on where a command begins*, which is what a landed harness should assert rather than any
one of these eight shapes. *Logged 2026-09-18, at the re-record of review round 2 (KD-79's slice).*

**Closed in the round that found it.** The direction decided it: this is a FAIL-OPEN, and it was
opened by this slice's own previous commit rather than inherited — `91b4129` refused all eight of
these shapes and `168187f` let them through. A defect that hands back a tree the command will not
act on is the thing this slice exists to stop, so "no producer" buys a delay it does not need when
the fix is the clause `invocation()` in the same file has always carried.

`COMPOUND`'s boundary is now a separator plus that same optional run of wrappers, assignments and
redirections, and the two readers agree about where a command begins.
`test/a-construct-this-reader-cannot-follow-is-refused-wherever-it-stands.test.mjs` keeps them
agreeing: 12 constructs x 12 command positions against `/bin/sh` as the oracle, asserting that every
shape the shell runs is REFUSED — including the ones where the construct happens not to move the
directory, because a reader that got those right did so by not following a branch it would not have
followed the other way either. Both errors this boundary has made are mutation-pinned: widen it back
to "preceded by whitespace" and the argument sweep goes red; narrow it to "preceded by a separator"
and the construct sweep does.

### KD-79 — the scheduler says the device tier is OWED and the gate enforcing it says nothing is owed — **CLOSED 2026-09-18, in the slice that fixed it**

`scripts/hooks/proof-gate.mjs` (`decide`, `kind === "device"`, `o.state === "none"`) vs
`scripts/proof-plan.mjs`

Measured 2026-09-18 on this branch, one command apart. `node scripts/proof-plan.mjs`:

```
device (fleet L2) OWED — discharge at slice close, NOT NOW
    8 changed path(s) are not declared irrelevant to fleet L2:
    .claude-plugin/marketplace.json, .claude-plugin/plugin.json, llms.txt, ….
```

`CMP_AVD=Medium_Phone_API_35 node scripts/fleet-check.mjs --min-level L2`, refused by the
PreToolUse hook before the runner started:

```
nothing is owed — every changed path is declared unable to affect fleet L2
(docs/, test/, scripts/, .github/, *.md, inspector/mcp/, .claude/, packages/harness/src/console/).
```

Both read `obligation()` from the same module, so they cannot disagree on one input — and the
hook's stated reason is impossible for this slice's change set. `.claude-plugin/` is not `.claude/`,
`llms.txt` is not `*.md`, and `package.json`, `package-lock.json` and
`packages/aliases/*/package.json` match no prefix on that list. Whatever set it judged, it was not
this branch's. Two candidates, not distinguished here: the hook compared the WORKING TREE against
HEAD, which is clean after a commit, so "every changed path is irrelevant" is vacuously true over
an empty set — this repo's own recurring shape, a guard written against ABSENCE passing on
VACUITY; or it resolved a sibling git worktree, whose uncommitted paths that day were exactly
`docs/GATE-RULES.md`, `scripts/hooks/proof-gate.mjs` and one `test/` file — every one of them on
the irrelevant list, which would explain the reason word for word (KD-64 is the same reader
confusing sibling worktrees).

**Not fixed here, deliberately.** `scripts/hooks/proof-gate.mjs` is owned by another slice that was
in flight the same day, and editing a gate from under it is worse than the disagreement. Nor was
the refusal worked around: a gate that refuses is obeyed, and this slice's device tier is left owed
and undischarged rather than run behind the gate's back.

**The direction is safe, and that is why this is logged rather than blocking**: it REFUSES a run
that is owed, so nothing false is ever certified. The cost is a slice that cannot close its own
last gate. The unsafe mirror image — allowing a run to discharge a tier the merge will not keep —
is what the sibling slice is about, so both directions are known.

**Fires when:** the tier is invoked from a worktree whose slice changes only paths one of the two
readers can see.
*Logged 2026-09-18, measured while closing the count-gate slice.*

Closed by the tree resolution in `scripts/hooks/proof-gate.mjs` ("WHICH TREE IS THIS COMMAND
ABOUT?"). **Of the two candidates above, the second is the one that fired**, and the first is ruled
out: `changedPaths()` reads `merge-base HEAD origin/main`, never `HEAD`, so a clean working tree
after a commit is not an empty change set. The hook judged the SESSION's worktree — `REPO_ROOT`,
fixed by the `node "${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/proof-gate.mjs"` wiring — whatever tree
the command it was gating would run in, and this repo keeps several worktrees of itself checked out
at once. The reason it printed was word-for-word true of that other tree, which is why it read as
impossible.

Every PreToolUse verdict is now about the tree the command will act on: read from the payload's
`cwd` and from the command's own leading `cd`, settled by `git rev-parse --show-toplevel
--git-common-dir` — the call KD-64 named and left for a slice that could pay for it deliberately —
and REFUSED outright when it cannot be told, because "assume the session's" is the defect and not
the fallback. A tree that is not a worktree of this repository gets silence rather than a refusal
about somebody else's slice. `test/the-proof-gate-judges-the-tree-the-command-acts-on.test.mjs`
holds it on two real worktrees of one throwaway repository, running a copy of this tree's own
`scripts/` — including the FAIL-OPEN half nobody had measured, a merge ALLOWED because the session's
tree owed nothing while the tree being merged owed both at-close tiers.

### KD-61 — a narrowed run of the declared suite is recorded as the suite — **CLOSED 2026-09-17, in the slice that found it**

`scripts/suite-reporter.mjs` says it records "exactly when the DECLARED suite runs … and never for a
targeted run, which must not be recorded as one". It cannot tell. Provoked 2026-09-17 in a scratch repo
whose one test file holds a passing and a failing test, with `package.json`'s `test` script copied
verbatim: `NODE_OPTIONS=--test-name-pattern=ok npm test` exits 0 and writes `verdict: PASS`,
`tests: 1`, bound to the tree hash; `suiteStatus` calls it `fresh` and `describeSuiteStatus` prints
`PASS 1/1 … for this exact tree — read it, do not re-run it`, and `fit-test.mjs` would print it as the
suite. The same holds for `NODE_OPTIONS=--test-skip-pattern=…` and `--test-only` (both measured), and for any hand-run
`node --test --test-reporter=./scripts/suite-reporter.mjs <fewer files>`. (`npm test -- --test-name-pattern=x`
does NOT narrow: the flag lands after the file operands and the whole suite runs.) Relatedly,
`suiteStatus` never reads `verdict`, so an `INCOMPLETE` record for these bytes is also `fresh` — the
reporter writes none on SIGINT (measured), so no path to one was found.

Not blocking: every reach is deliberate narrowing, and the readers are this repo's own gates and
agents, not an adopter. The class, when it is fixed: a record is fresh only for a finished,
unnarrowed run of the declared operands — the reporter can see the runner's flags in
`process.execArgv` and `NODE_OPTIONS`. *Logged 2026-09-17, review round 1 of `suite-record`.*

**Closed before merge** (`suite-record`, round 1 → fix): the reporter compares the run's own filter flags (execArgv, NODE_OPTIONS) and file operands with the files package.json declares, expanded by the shell; anything less is recorded `scope: "narrowed"` with its reasons, and `suiteStatus` reads only a finished run of the declared suite as fresh. Pinned by `test/a-green-suite-is-run-again-because-nothing-recorded-it.test.mjs`, including the NODE_OPTIONS reproduction end to end.

### KD-62 — the suite hash skips gitignored files a suite test reads — **CLOSED 2026-09-17, in the slice that found it**

`scripts/suite-record.mjs` justifies its git view with "tracked plus untracked-not-ignored files is
exactly the working tree a test run sees". Not quite: `test/ground-truth-derivation.test.mjs` reads
`docs/research/launch/GROUND-TRUTH.md` when present, and `git check-ignore` confirms `docs/research/`
is ignored — so regenerating that file (`ground-truth.mjs --markdown`) can turn the assertion red
without moving the hash, and a fresh PASS record survives it. `node_modules/` is the same shape for a
dependency changed without a lockfile edit.

Not blocking: one optional file, one assertion, repo-internal reader. The class, when it is fixed:
either no suite test reads an ignored path, or the hash covers what the suite reads. *Logged 2026-09-17,
review round 1 of `suite-record`.*

**Closed before merge** (`suite-record`, round 1 → fix): the suite hash covers every file git can list, ignored ones included, minus generated output (`SUITE_HASH_SKIP`), so a gitignored input that moves makes the record stale. A directory missing from the skip list costs a re-run, never a false fresh.

### KD-59 — the plan history records as `closed` slices that never closed — **CLOSED 2026-09-17, in the slice that found it**

`close()` appends a `closed` row for whatever plan `obligation()` hands it, and on trunk that is
`o.stale` — ANY leftover plan, not the one the merge just landed. Two ways that row attests nothing,
both executed on 2026-09-17 (branch `proof-history`, round 1):

- `test/proof-gate-hook.test.mjs` "PostToolUse after a merge" writes a fake discharged plan and runs
  the real hook. It restores `proof-plan.json` but not the history: `npm test` on a clean `main`
  (a clone with `origin/main` = HEAD) left `a plan this test wrote · 0 min` in
  `qa-artifacts/proof-plan-history.jsonl`, and `--history` counted it as a closed slice. Every suite
  run on trunk, or on a docs-only branch, adds another and pulls the median toward zero.
- A plan abandoned on branch `a` (never discharged, never merged) is recorded as `closed via merge`
  when some OTHER branch merges without `--open`, with a duration spanning both. The row's
  `device`/`review` fields are the trunk's `none`, never the slice's — in the ordinary merge path too.

Not blocking: `scripts/` is not shipped and `--history` sits in no refusal path; nobody but this
repo's own G2 measurement is misled. But that measurement is the slice's whole reason. The fix is
two lines of isolation (the hook test must also save/restore the history, or the hook take a history
path from env) plus recording a stale plan whose branch is not the merged one as `abandoned`, not
`closed`. *Logged 2026-09-17.*

**Closed before merge** (`proof-history`, round 1 → fix): the merge-hook test now points the hook at a scratch history (`PROOFLANE_HISTORY_DIR`) with a fixture that settles on every branch, and asserts the real history is untouched; a leftover plan whose branch still exists is recorded `cleared`, and a stale plan's row no longer carries trunk's tier states. Pinned by `test/a-settled-slice-leaves-no-record-of-what-it-cost.test.mjs` and `test/proof-gate-hook.test.mjs`.

### KD-60 — "the totals always add up" does not hold once a plan is replaced — **CLOSED 2026-09-17, in the slice that found it**

`summarize()` claims a device run or review matching no closed slice is counted as unattributed
"so the totals always add up". A run inside a `replaced` slice's window is claimed (so not
unattributed) and excluded from `deviceRuns` (closed only): replaced run at 10:30 + closed run at
11:30 on one branch gives `deviceRuns 1, unattributedDeviceRuns 0` of 2 rows. The per-slice line
still shows it; the summary line does not. Not blocking: a report line under-counts, no gate reads
it. *Logged 2026-09-17.*

**Closed before merge** (`proof-history`, round 1 → fix): totals now have three buckets — closed slices, slices that never closed, unattributed — and a test asserts they add up to the history for both runs and reviews.

### KD-57 — on Node 20, nine tests ran and did not report — **CLOSED, 2026-09-16**

CI on `f58ca39`: Node 20 counted `1932` tests where Node 22 and 24 counted `1941` on the same runner
and the same `sh`-expanded file list, `fail 0`. The nine were every test in
`test/one-command-upgrades-a-declared-fleet.test.mjs` but the last. Its `quiet(fn)` helper replaced
the global `process.stdout.write` with a no-op across an `await`, and Node 20's runner writes each
result through that writer — so results emitted while a swap was pending went into it. Review
reproduced it on 20.19.0 (`# tests 1` for the file alone) and showed a failure inside a swap still
exited 1: the COUNT lied, not the verdict. Fixed by removing the helper; the commands' output is let
through, and none of it reads as TAP. Logged by review as KD-53 and renumbered, because the 0.26.0
branch had already taken 53–56.

**Four more test files swap the same writer** —
`a-fleet-upgrade-lands-a-different-harness-in-each-repo`,
`a-fleet-upgrade-writes-to-a-tree-the-manifest-never-named`,
`one-artifact-is-recorded-with-a-different-origin-in-each-repo`, and
`the-fleet-command-names-a-front-door-the-caller-did-not-use` (which captures rather than discards).
None lost a result on this CI run; each would, on Node 20, the day a test is added after its swap.
Not fixed here, because nothing is lost today and the change asked for was the one that was.

The same round corrected a count: the guard's comment said 228 tracked test files, and on this
branch there are 226 — 228 was measured on the 0.26.0 branch, which adds two. The comment no longer
carries a number.

### KD-53, KD-54, KD-55 — three holes in the drift walk, logged by round 1 and closed in its own fix — **CLOSED, 2026-09-16**

All three were logged by the review of `7ca2fec` as not blocking, and all three sat inside
`publishedBytesDrift()`'s walk, which round 1's blocking findings required rewriting anyway. The
reviewer's own note on KD-53 said whoever next touched the walk should close it there rather than
paying for a second fixture; that was the same afternoon.

- **KD-53, the anchor was the newest unbroken run of a version.** Bump away and revert onto a
  published number, and the anchor became the revert — everything shipped under the first run was
  forgiven. The walk now takes the OLDEST commit that ever bore the version, which over-reports rather
  than under-reports; a version reused across two trees is the defect itself, so over-reporting it is
  not a false alarm. Held by a fixture in
  `test/a-version-number-cannot-name-two-different-trees.test.mjs`, and planting the run form back
  turns that test red.
- **KD-54, git read one tree and the manifest another.** The walk ran git in `cwd` and read `files`
  from the module's own `ROOT`. Round 1's fix added npm as a third reader in `cwd`, which would have
  made the split two-against-one — so all three now read one tree. Held by a fixture whose `files`
  names a directory no package in this repo ships; planting the `ROOT` read back turns it red.
- **KD-55, "SIXTY-FOUR" and an unreachable branch.** The header now says 66, as the commit, the test
  and the measurement do; the dead `p.unanchored ?` arm went with the renderer rewrite.

### KD-35 — the prose named a syscall nobody sees — **CLOSED, 2026-09-15**
Round 2 executed two error-code claims I had written from memory twenty minutes earlier and found
one wrong in both places: `node '${CLAUDE_PLUGIN_ROOT}/…/server.mjs'` exits `MODULE_NOT_FOUND`, not
`ENOENT`. ENOENT is the syscall underneath; an MCP client shows a third thing again,
`CONNECTION_CLOSED`. (The other claim held — `bin/server.mjs` with no `node_modules` really is
`ERR_MODULE_NOT_FOUND` for `@modelcontextprotocol/sdk`.)

Logged as non-blocking and fixed anyway, because the round had just established that it was FREE to:
`scripts/observed-tree.mjs`'s `REVIEW_SKIP` is `relPath.endsWith(".md")`, so a markdown edit cannot
move the review hash. The log exists to stop findings being re-litigated, not to preserve a sentence
I know is wrong and can correct at no cost to any gate. Both sites now name what the reader sees,
and the README names all three layers, since which one you get depends on where you are standing.

### KD-38 — the fix moved the mechanism and left the prose pointing at the old one — **CLOSED, 2026-09-15**
Both halves were comments, and both were mine, written in the round that fixed the thing they
described. Fixed rather than logged because a comment file cannot be edited "for free" the way
markdown can — `REVIEW_SKIP` is `.md` only — but the provenance fix in the same commit was already
moving the review hash, so there was no round to save by leaving them.

**`fleet.mjs`'s header still asserted the claim round 1 measured as false.** "`resolveHarness` falls
back to the package the running binary ships from, so a single process carries a single artifact
into every tree" — naming a function `runFleetUpgrade` no longer calls, whose rule is deliberately
the opposite. The paragraph now says what the mechanism is AND carries the measurement that killed
the old one, because a header that only states the right answer teaches nobody why the wrong one was
attractive.

**Extracting `harnessAt` stranded `resolveHarness`'s JSDoc on it.** "`node_modules` first is the
whole point… @param {string} root" sat above a function taking `(pkgDir, where)`, and the exported
`resolveHarness` had no doc at all. Moved back, with a line pointing at `runningHarness` for why a
fleet does not use it.

*Found in review round 2 of `fleet-upgrade`, fixed in it.*

### KD-36 — the criterion-E test proved its plant was gone, not that bytes arrived — **CLOSED, 2026-09-15**
Logged non-blocking by the round that found it, and fixed in the same round, because the test's NAME
was the harm: "THE CRITERION: one command, and the bytes arrive in EVERY tree". It planted staleness
by APPENDING a comment to a vendored file, so "the upgrade arrived" and "my edit was undone" were
the same observation. Review ran the two assertions against a three-line impostor that reverted the
planted file and did nothing else; both passed.

The plant now also DELETES a machine-owned file (`qa/lib/evidence-ladder.mjs`), and the test asserts
it is back and byte-identical to the package's copy. Nothing can put a deleted file back except
vendoring it. Verified by mutation rather than by reasoning: an upgrade that copies `changed` files
but skips `new` ones — precisely a reverter — turns it red.

The class is one this branch has now hit three times and it is worth stating once more: **a test
that cannot refuse the defect in its own name is worse than no test, because the file's name says
it is covered.** Here the fix was to strengthen rather than to cut, because the criterion is real
and per-commit; the two earlier cases had nothing left to assert once the duplicate was removed.

### KD-42 — the hand-rolled glob translation disagreed with the runner — **CLOSED, 2026-09-15**
It refuses what it cannot translate. `?`, character classes, brace alternation and a bare `**` all
throw by name; the two constructs it implements (`**/` spans path segments, `*` spans characters
within one) are unchanged.

Found by differential against the actual runner on a fixture tree — eleven pattern shapes, six
divergent — not by reading. Five diverged in the SAFE direction (guard stricter than runner, a false
alarm at worst). One did not:

```
"test/a?.test.mjs"   runner ran [ab.test.mjs]   guard matched [a.test.mjs]
```

`?` is absent from the escape set, so it reached the RegExp as a QUANTIFIER and the guard reported a
file covered that never runs — **KD-41's unsafe direction, one construct over, inside the function
written to close KD-41.**

Logged non-blocking (nothing in the declaration uses those constructs) and fixed anyway, for the
reason that keeps recurring this week: a translation that silently disagrees with the runner about
ANY construct cannot be trusted about the ones it does implement, and "which of the six is safe" is
a fact about today's declaration rather than about the function. Refusing the whole set ends the
class instead of patching the one character that happened to be dangerous.

The alternative the round offered — stop translating, materialise the tracked paths as empty files
in a temp dir and let `node --test` itself answer in about a second — is the better long-term shape
and is not taken here, because it trades a pure function for a temp-dir side effect in a guard that
runs on every commit. Recorded so nobody re-derives it.

### KD-41 — the guard checked a root PREFIX, so a pattern matching nothing satisfied it — **CLOSED, 2026-09-15**
It asks the globber now: `fs.globSync(pattern, { cwd: ROOT })`, and the two assertions became "every
tracked test file is MATCHED by some pattern" and "every pattern MATCHES something".

Logged non-blocking by the round that found it and fixed in the same round, because what it
measured is the guard failing at its one job. `rootOf` took the substring before the first `*` and
compared with `startsWith` — containment, not matching — so every narrowing after the root was
invisible. Executed: declaring `test/**/nope*` for all three patterns ran `npm test` to **zero
tests, exit 0**, with all three assertions passing. A guard whose entire purpose is "the suite
cannot silently shrink" passed a suite that had shrunk to nothing.

**This is the shape a peer session named the same day**, having paid for it in a Gradle task that
existed, ran, compiled zero Kotlin files and exited 0 while a criterion sat green over a client
nothing ever built: **a guard written against ABSENCE does not catch VACUITY.** Missing pattern,
missing task, missing term — all anticipated. Present-and-empty is the one that gets through, and
from outside it is identical to a property that holds. Three of this session's findings are that
one shape, and it is now the reason this guard asks what a pattern MATCHES rather than where it
points.

Four mutations, each red: patterns matching nothing; `prepublishOnly` back to a bare glob; `ci.yml`
back to a bare glob; and `test/**/*` narrowed to `test/*` — that last one green until a
`test/sub/` file exists, so it was proved at the moment it costs something by creating one and
watching the guard refuse.

The structural half the round also named stands and is not re-logged: the guard lives under a
pattern it audits, so it cannot refuse a declaration that excludes itself. Nothing checks that, and
a fix would be a third declaration of the same fact.

### KD-26 — `npm test` globbed the whole tree, so any directory in it was this repo's suite — **CLOSED, 2026-09-15**
The script names its roots:

```
node --test "test/**/*.test.mjs" "inspector/mcp/test/**/*.test.mjs" "packages/receipts/test/**/*.test.mjs"
```

**The defect, executed both ways.** A stray `wt-probe/test/planted.test.mjs` with one failing
assertion: under the bare glob, `tests 1926, fail 1` — a tree that is not this repo's, failing this
repo's suite. Under the named roots, `tests 1920, fail 0`. The silent direction is the worse one and
the same fix closes it: a worktree whose tests all PASS was adding green rows to a number nobody
audits.

**1925 → 1917, and the eight were not tests.** Node's default patterns include `**/test/**/*.mjs`
and `**/*-test.mjs`, not just `*.test.mjs`, so the runner was executing seven fixtures and helpers
(`test/fixtures/profiles/py-alien/index.mjs`, `test/helpers/harness-fixture.mjs`, …) and — the
one worth naming — `scripts/fit-test.mjs`, a PROGRAM, on every `npm test`. Each counted as one
passing test for not throwing. Those eight rows asserted nothing, and `scripts/fit-test.mjs` is
covered properly by `test/fit-test.test.mjs`, which predates this.

**The fix has its own failure mode, and it is the dangerous direction**: a misspelled root, or a test
written where no root reaches, is not an error — it is a smaller suite that still says PASS. So
`test/a-test-file-outside-the-named-roots-is-never-run.test.mjs` reads the roots OUT of
`package.json` (a constant here would be a second declaration of one fact, which is the defect class
rather than a guard against it) and refuses both directions: a tracked test file under no root, and a
root matching no tracked file. Four mutations, each caught by name — a root dropped, a root
misspelled, an unanchored pattern, and a regression to the bare glob.

**`.claude/worktrees/` is now in `.gitignore`**, not only in `.git/info/exclude`. It holds 355 test
files and was invisible to the old glob solely because Node skips dot-directories — on any other
clone it is 355 untracked files inside the repo, and every "is the tree clean" check sees them.

### KD-19 — a refusal wording the classifier could not read — **CLOSED, 2026-09-15**
Resolved exactly as the entry predicted, by `upgrade --fleet` existing.

`looksUnimplemented` decides *no such command yet* versus *answered and failed* by matching
`/unknown (sub)?command|not a command|unrecognized/i`, and "`--fleet` is not a flag this command
knows" matched neither. That misclassification needed the flag to be UNIMPLEMENTED to fire. It is
implemented, so criterion D now spawns a command that runs, and a non-zero exit from it genuinely
is a failure rather than an absence — which is what the classifier would say.

Closed on the instance, and the class it named stands and is worth restating once: **a refusal
message has a reader somewhere, and adding a spelling without telling the reader makes the reader
silently wrong.** Nothing gates that today. It is not re-logged as an open entry, because an entry
that says "be careful" with no measurement behind it is the kind this file's header refuses.

### KD-33 — the plugin launched its MCP server by a path relative to nothing in particular — **CLOSED, 2026-09-15**
`.mcp.json` names `${CLAUDE_PLUGIN_ROOT}/inspector/mcp/dist/server.mjs`, and the gate now asserts the two properties
its own comment always claimed to be about.

**Karel's change, and his reason is the precise one:** point at this repo from another. A relative
path resolves against the MCP client's cwd, so the plugin's server only ever started for someone
whose cwd happened to be the plugin root.

**Where the variable resolves, measured — and my first measurement of it was WRONG.** I called the
project-scoped `cmp-inspector` after editing the file, got the server's own error rather than a
transport failure, and concluded the path had resolved. MCP servers launch at SESSION START: the
server that answered was started from the relative path, in a checkout where it works. The tell was
in the next session reminder, not in my reasoning.

Corrected, both halves executed:

```
plugin_create-cmp_cmp-inspector   answers          → resolves in PLUGIN scope
cmp-inspector (project)           CONNECTION_CLOSED → does NOT resolve in project scope
printenv CLAUDE_PLUGIN_ROOT       unset             → not an environment variable
node '${CLAUDE_PLUGIN_ROOT}/…/server.mjs'  MODULE_NOT_FOUND
```

**ONE FILE, TWO ROLES — the thing the next reader will trip on.** This repo IS the plugin, so
`.mcp.json` is the plugin's config from the marketplace cache and a project config in this checkout.
The anchored spelling that makes the plugin work everywhere leaves the project-scoped copy dead in
this one directory. That is the correct trade, not a defect: the plugin server serves the same tools
from anywhere, and the project-scoped one was a duplicate that only ever worked here. The test
carries that paragraph so the round trip — seeing `CONNECTION_CLOSED` and "fixing" it by going
relative again — is refused rather than rediscovered.

**The test was re-aimed, and that is a strengthening; here is the direction rather than the
argument.** It pinned `deepEqual(args, ["inspector/mcp/dist/server.mjs"])` — a spelling. Pinning a
spelling looks stricter than asserting a property and is weaker: it cannot tell a correction from a
regression, so it refuses both. The new form asserts one argument, anchored to the plugin root,
naming the committed bundle rather than `bin/server.mjs`, at a path that EXISTS — which the old form
could not reach at all. Executed against four wrong shapes:

```
the OLD spelling (relative, pre-fix)            RED
anchored but pointing at bin/server.mjs         RED
anchored, right shape, file does not exist      RED
two arguments                                   RED
the fix itself                                  green
```

It is not a strict superset and should not be described as one: it gives up exactly one refusal —
of the correct spelling — and buys four. `f5077c8` fixed WHICH FILE, measured against the real
cached install, and inherited FROM WHERE without weighing it; for a year the gate held the half that
had already been fixed.

**"Buys four" is an overclaim, measured — the review round that checked it, 2026-09-15.** Both
forms accept exactly ONE string and refuse every other, so `deepEqual` already refused all four of
those shapes; the new form does not buy them, it inherits them. Run differentially — old gate and
new gate over the same eight candidate `args`, `.mcp.json` rewritten between runs — the two
acceptance sets are singletons that swap: old accepts only the relative spelling, new only the
anchored one, and every other shape (bin, nonexistent file, two args, empty, absolute, trailing
space) is RED under both. What the re-aim actually buys is not a refusal count: the expected value
is now COMPUTED from `BUNDLE` rather than typed, so it tracks a rename instead of pinning a
spelling, and it says WHICH property failed when it fails. The third property — that the file
exists — is real but not new to the suite: `bundle-freshness.test.mjs`'s first test has asserted
`fs.existsSync(BUNDLE)` all along. Nothing to fix; the gate is sound and the argument for it was
one notch stronger than the facts. *Logged 2026-09-15, review round 1 of `plugin-root-path`.*

### KD-34 — a test named for the record-ordering defect was green at the commit that had it — **CLOSED, 2026-09-15**
Cut, which is what the entry asked for, in the round that logged it. Round 2 measured rather than
read: it built a worktree at `283294e` — the tree where the record was written before the ladder
plant — copied both of HEAD's tests in, and ran them. The source scan FAILED there and passes here,
which is the whole gate and it is sound. `a run that FAILED its last check leaves a record the
publish gate refuses` PASSED there, carrying the defect's name and unable to refuse it. I reproduced
that before agreeing.

It could never have done otherwise. Ordering is a fact about the SOURCE; the writer was always
correct, and nothing done with the writer in isolation can see when it is called. The test's first
half restated `verdict: failures.length ? "FAIL" : "PASS"` one line from itself and its second is
asserted by `test/proof-gate-hook.test.mjs:93`, which predates this branch.

Residue of a correct catch, and the round-1 version was mine and worse — it replayed the old call
order by hand and asserted a property no fix could give it. Rewriting it to something TRUE traded a
test that was red for the wrong reason for one that was green for no reason, and kept the name.
That is the third time on this branch that the honest move was to remove a test rather than keep
it: the duplicate that "closed" KD-10, the third KD-29 test, and this. **A test that cannot refuse
the defect in its own name is worse than no test, because the file's name says it is covered.** The
header now says so, and the file carries one test.

### KD-29 — the ladder plant blessed a run that never showed the edit compiled — **CLOSED, 2026-09-15**
The refusal is now symmetric. `assessLadderPlant` requires an `l1Required` step that PASSED before
the plant, exactly as it already required one for `l2Execution`, and names what it saw instead of
asserting a generality. The comment above `wasGreen` was right all along and applied to one half:
"a step that did not PASS before the plant proves nothing after it."

Both halves of the refusal are red at `46393d0` and green here — the receipt from the report
(`releaseBuild: FAIL` before and after, `e2eSmoke` PASS→FAIL) and the one-line version, a ladder
declaring `l2Execution` with no `l1Required` at all. A third test asserting that a blessed verdict
names both halves was written and **cut**: it is green at the merge-base, so it proves nothing about
this fix, and a name like "PASS is never printed with a hole" would have read as the proof.

### KD-12 — the gate printed a rule that contradicted the rule — **CLOSED 2026-09-14**
Half real, half not, and checking which was the work. The printed paraphrase WAS stale — it
carried the new severity test on the old termination shape — and it is now a pointer that
paraphrases nothing, because the second statement of a rule is always the one nobody updates.
The other half asked to loosen `--discharge-review`'s tree binding so the last round's fix
could discharge. It does not need loosening: ADR-0014 is right that merging bytes nobody read
is the thing to refuse, and the last round RE-RECORDS after its own fix instead. That is not a
third round, it costs one message, and it had already been the working practice for three
slices before anyone wrote it down.

### KD-22, KD-23 — a duplicate contract test, and a charter that still required an index of itself — **CLOSED `af1ba7e`, 2026-09-14**
The duplicate `every menu field's recommended answer is one of the answers it offers` was deleted;
`a field with options names a default, and the default is one of them` is again the single spelling,
and measured in round 2 it still covers exactly `MENU_FIELDS` (`CONTRACT_PATHS.filter(options)` and
`MENU_FIELDS` are the same two paths, asserted executably). The Closed note for KD-10 was corrected
to say the guard predated the branch. `DOCUMENTATION.md` §6.2 and §7 stopped demanding an
exhaustive index the header had renounced — §6.2 now points "below" at a reading order that is
above it (§2/§3, lines 40 and 137), which is the whole remainder.

### KD-1, KD-2, KD-9, KD-10, KD-13 — the ladder interview — **CLOSED 2026-09-14, Karel's calls**
`--yes` dropped from `harness init` (it meant the opposite of `--yes` everywhere else in the same
CLI, and never reached a user — 0.25.0 shipped three days before the interview merged).
`askLadderMenu({current})` deleted with both sentences claiming `upgrade` asks. **`^C` abandons
the install** — every question is asked before a byte is written, so honouring it costs nothing,
and a person who pressed stop and found 52 files had been ignored. A menu default that is not one of its own
options was ALREADY gated — `a field with options names a default, and the default is one of
them` has asserted it since before this branch, and the duplicate I added claiming to close
KD-10 was removed rather than kept (KD-22). KD-10 is closed because it was never live, not
because this change fixed it. And `ladderSummary` stopped telling a person to
uncomment a seeded ladder in a file this command never wrote.

### KD-11 — the doc charter claimed to be exhaustive — **CLOSED 2026-09-14, Karel's call**
It stops claiming it. `DOCUMENTATION.md` is a curated reading order now, which can be honestly
incomplete; an exhaustive index cannot, and nothing was ever going to enforce this one. The
"which doc is authoritative" question points at NORTH-STAR §12, a precedence table and a
different instrument.

### KD-7 — a boolean flag swallows the target directory — **CLOSED**
`18af5c3`, `91a3ac2`. Flags that take no value are declared; the token after them stays the
user's. Two rounds of review found three more defects in the fix itself, including an
entry-point guard that would have made every npm-installed `prooflane` a silent no-op.

### KD-15 — `create-cmp --version` scaffolds an app — **CLOSED**
Refusing the unrecognised never reached it: `--version` is a DOCUMENTED flag, so it passed
every check and fell through the dispatcher into `create`. It answers before acting now, the
way `prooflane` always has.

### KD-17 — the flag lists could not reach a typo or a short flag — **CLOSED**
Not by a longer list. `--verfiy`, `--anything` and `-y` all failed identically and no list
reaches them, so both doors now refuse an argument they cannot account for — by name, exit 2,
nothing written — which is the answer `unknown command` already gave one branch down.

### KD-27 — the lane-already-running refusal names a PID and not a project — **CLOSED 2026-09-17**

`scripts/fleet-check.mjs` (the concurrent-lane guard)

    a verify lane is already running (7360 node qa/verify.mjs) — a concurrent device
    run collides with it (wedged adbd, false reds). Wait for it, then run the tier once.

The refusal is RIGHT — two lanes share one adb and one emulator, so the second must not
start — and it is right across repositories, which is the part the message does not say.
Measured 2026-09-14: the blocking lane's cwd was `/Users/test/dev/payment-blueprint`, an
unrelated project, and finding that out took four commands (`ps`, `pgrep -fl`, `lsof`, then
reading the guard). The message had the PID all along and could have had the path.

It matters more than a nicety because of what the reader concludes in the meantime. A lane
"already running" in YOUR repo is something you started and can wait for or kill; one in
someone else's is neither, and the two demand opposite actions. Until the message says which,
the fastest wrong move — killing it — is also the most tempting.

**Fires when:** anyone runs two lanes on one machine, which fleet work makes normal.
*Logged 2026-09-14, hit while closing the interview slice.*

Closed by `describeLane` in `scripts/hooks/proof-gate.mjs`: the refusal now names the project
(resolved from the lane's own cwd via `/proc/<pid>/cwd` or `lsof`, and from an absolute operand
when it has one), says outright when it is ANOTHER project's and must not be killed, and reports
the step and the time left from the lane's own `qa/.lane-in-progress` marker measured against its
last full run — or says which of the two it could not find, never guessing.
`test/a-lane-refusal-names-a-pid-and-not-a-project.test.mjs` holds it, with one test pointed at a
REAL spawned lane process so the `lsof`/`/proc` read is not an unread instrument.

### KD-89 — a partly-installed tree fails three tests, and two of them do not look like a missing install — **CLOSED 2026-09-18 by `scripts/suite-preflight.mjs`, wired as `pretest`**

`package.json` (`workspaces`, `scripts.test`) · `scripts/suite-reporter.mjs`

Measured 2026-09-18 in a fresh git worktree whose ROOT `node_modules` existed but whose
`inspector/mcp/node_modules` did not. `npm test` reported three failures:

```
✖ inspector/mcp/test/bundle-freshness.test.mjs   ERR_MODULE_NOT_FOUND: Cannot find package 'esbuild'
✖ inspector/mcp/test/server-tools.test.mjs
✖ the console host delivers no profile console copy, so the Evidence tab links no step
    to the section it governs        AssertionError: the host delivered stepGoverns={}
```

`npm ci` provisioning the workspace turned all three green, with the tree otherwise untouched.

**The defect is not that an uninstalled tree fails — it is the SHAPE of two of the three failures.**
`inspector/mcp` is a root workspace (`package.json`), so one root `npm ci` provisions it, and
`.github/workflows/ci.yml` does exactly that deliberately ("ONE install, not two"). CI is therefore
never in this state and no adopter ever is. A contributor in a worktree can be, and what they are
shown is one honest module error and **one semantic assertion about console copy and `stepGoverns`**
— a message that reads as a real product defect in code they may have just touched. The cost is a
wrong diagnosis, not a wrong verdict, which is why it is here and not on the first row: nobody is
served anything false by the shipped product, and the failure is loud rather than silent.

It is recorded because it was expensive to disbelieve. The honest way to clear it was to run the
three files on a clean `origin/main` FIRST and watch them fail there too — which proves "not mine"
but still misattributes the cause to the repo. Only chasing `ERR_MODULE_NOT_FOUND` to an absent
workspace directory got the real answer.

**What the fix would be, when it is taken:** a preflight in the suite reporter that checks each
declared workspace has a `node_modules` before the run and says *"workspaces are not installed — run
`npm ci` at the repository root"* instead of letting the assertions speak. That is a change to how
the suite bootstraps, which is a slice with its own failure modes (a preflight that itself goes
wrong makes every run unrunnable), not a line in this one.

**Closed by a door rather than a message, and the paragraph above got two things wrong.** `npm test`
now runs `scripts/suite-preflight.mjs` as `pretest`: it refuses the run by name — which package,
which dependencies, `npm ci` — and `node --test` never starts.

The first correction is the PREDICATE. "Each declared workspace has a `node_modules`" is false for
**10 of this repo's 12 declared packages** after a clean `npm ci`, because their dependencies hoist
to the root; that check refuses a correct tree. Two resolver spellings fail the other way and were
measured too: `import.meta.resolve(spec, parent)` ignores its second argument without
`--experimental-import-meta-resolve` (it reported `esbuild`, `zod` and `@modelcontextprotocol/sdk`
missing while installed), and `require.resolve("@modelcontextprotocol/sdk")` throws
`MODULE_NOT_FOUND` from `inspector/mcp` where it IS installed, because that package has only subpath
exports. What holds is the resolver's own directory walk and nothing above it.

The second is the PLACE. A preflight *in the reporter* can annotate a run; it cannot stop one, and a
skip is worse than the failure it replaces here: `recordRun` computes its verdict from `counts.fail`
and `counts.cancelled`, so `counts.skipped` never reaches it and an uninstalled tree would have
recorded **PASS**. A skip must also name its victims, and the third of the three never reproduced
from the absent workspace alone — logged as KD-109, along with the `catch {}` in `applyConsoleCopy`
that can turn any load error into that same assertion. The risk this entry named — a preflight that
itself goes wrong making every run unrunnable — is answered by construction: the door fails OPEN on
anything it cannot read, and imports only `node:` builtins so it can load on the tree it describes.
`test/an-uninstalled-tree-fails-as-if-the-contributor-broke-it.test.mjs` holds all of it, including
a fixture that proves npm's `pretest` really does abort the run before the test script leaves a
marker.

### KD-78 — the npm pages for two aliases said "8 gates" — **CLOSED 2026-09-18**

`packages/aliases/create-kmp/package.json:4`, `packages/aliases/create-compose-multiplatform/package.json:4`

Both descriptions read *"a machine-enforced verify lane (8 gates, evidence receipts)"*. The lane
that holds an AI-driven change is `local` (17) or `ci` (18); the only profile that runs 8 is
`smoke`, whose receipt `qa/receipt-check.mjs` refuses as done-evidence. **In the tree this is
fixed** — the bare number is gone, and
`test/a-published-npm-description-states-a-lane-size-that-names-no-profile.test.mjs` refuses the
next one. What is NOT fixed, and cannot be from here, is what npmjs.com serves: a registry
description is a property of *published bytes*, and it changes only when someone publishes. Until
`create-kmp@0.1.6` and `create-compose-multiplatform@0.1.6` are published, the pages a stranger
reads before installing still carry the false number, at the versions already live (`0.1.4`).

This is logged rather than blocked because there is no act available in this repository that would
close it — not because nobody is wrongly served. Somebody is, on two npm pages, right now. The
remedy is an outward-facing human act (`docs/PUBLISHING.md`), and standing one up unasked is the
thing this project does not do on its own.

**Fires until:** both aliases are published at the versions this tree holds.
*Logged 2026-09-18, review round 1 of the count-gate slice; the tree-side half was fixed in the
same round.*

**CLOSED by publishing, which is the only act that could close it.** `create-kmp@0.1.6`,
`create-compose-multiplatform@0.1.6` and `create-mobile@0.1.2` are live; the registry's `latest`
tag serves all three, and none of their descriptions contains the bare number. Verified against
`https://registry.npmjs.org/<name>` directly rather than through `npm view`, because npm's local
packument cache served the OLD versions for several minutes after the publishes succeeded — long
enough that `npx <alias>@latest` failed `ETARGET` against a registry that already had the bytes.
A cache reading stale is the `served-page-is-not-your-code` shape, one registry over.

The release proof this publish required (`scripts/hooks/proof-gate.mjs` refuses `npm publish`
without it): fleet check PASS at rung L2 on `06c5aa1`, clean trunk, `treeWasDirty: false`.

*Closed 2026-09-18 by the publish itself. The entry is kept whole above because its reasoning —
that a registry description is a property of published bytes and no commit here can change one —
is the record, and it is the same shape as every other artifact this repo cannot reach from a
commit.*

### KD-40 — a minimal scaffold keeps the lock for a lane it just deleted

`src/lib/minimal.mjs` (`subtractLane`), `packages/harness/src/lib/harness-region.mjs` (`isHarnessFile`)

`subtractLane` deletes every machine-owned lane file outside the keep-set, walking
`listHarnessFiles`, which yields only what `isHarnessFile` accepts: the two DECLARATIONS, the one
GENERATED record, and otherwise `.mjs` alone. `qa/harness.lock.json` is none of those, so the
stripper never sees it. Executed:

```
qa/harness.lock.json     NOT a harness file — --minimal never sees it
qa/harness-source.json   IS a harness file (strippable)
qa/harness-manifest.json IS a harness file (strippable)
qa/verify.mjs            IS a harness file (strippable)
```

So a minimal scaffold keeps a lock whose `files` map names a hundred-odd paths that no longer exist
and whose `fileCount` is wrong — a record that describes a lane the same command removed.

**Reported from outside, with its cost measured.** The `payment-blueprint` session hit this: a
`--minimal` re-scaffold stripped 66 lane files and left the lock, and `gitleaks` then flagged a
SHA-256 content digest inside it as a `generic-api-key`. Its lane went red on an orphan written by
nothing and read by nothing. That is the honest shape of the harm — not that the lock is wrong (no
reader is left to be misled) but that it is an unexplained file full of high-entropy strings sitting
in an adopter's repo, and a secret scanner is exactly the thing that will find it.

**Not fixed here**, and the fix is a decision rather than a line: either the stripper learns about
the lock (and `isHarnessFile`'s `.mjs`-or-declaration rule grows a third case), or `--minimal`
stops being a lane-subtraction and becomes a lane-less install. The second is probably right and is
a slice, not an edit.

**Fires when:** anyone runs `create-cmp … --minimal` over a tree that has a lane. *Logged
2026-09-15, reported by the payment-blueprint session and verified here by execution.*

**CLOSED 2026-09-19 — NOT REPRODUCIBLE, and the entry above was false when it was written.**

Everything from *"the lock it wrote describes a lane the same command removed"* onward is wrong.
Measured by executing the real template twice: a fresh `--minimal` stamp locks **7** files reading
`intact`, and re-stamping `--minimal --force` over a full 73-file tree locks the same 7. The cause
is ordering that predates this entry: `applyMinimalMode` runs BEFORE `writeLaneLock`
(`src/scaffold.mjs:484-493`, whose own comment says so, and `:301-317`), so the lock is rewritten
over the kept subset every time. That ordering and `test/minimal-mode.test.mjs:83-91` both landed in
`2ddce4f` on **2026-08-21** — three weeks before this was logged on 2026-09-15.

**The gitleaks harm was real and mis-attributed.** A full stamp's lock holds **73** sha256 digests
and a minimal one holds **7**, so `--minimal` REDUCES the high-entropy strings blamed on it. That
finding is now its own entry, KD-160, where it belongs.

**The `isHarnessFile` route this entry implies is refused on the merits, not on cost.**
`packages/harness/src/lib/harness-lock.mjs:33-34`: *"The lock is deliberately NOT a .mjs file, so it
is not part of the region it describes — a manifest inside its own manifest could never settle."*
`writeHarnessLock` hashes the region and then writes the file, so a lock inside its own region would
record its pre-write bytes and read `modified` the instant it was taken.

**The residue, and it is harmless.** `isHarnessFile` does not recognise the lock, so `subtractLane`
cannot see it — and a swept `qa/` shows it is a class of one: of 7 files outside the region in a
full stamp, `--minimal` removes `approvals.json`, `comments.json` and `evidence/schema.json`, and
the survivors are `qa/e2e/README.md`, `qa/e2e/smoke.yaml`, `qa/golden/home.json` (app content, kept
by design) and the lock. Nothing reads a minimal tree's lock: `harden.mjs:200` reads one only on the
`alreadyFull` branch, and `src/lib/harness-upgrade.mjs:62-69` excludes it as derived state.

**Closed by a pin, not by an argument.** `test/a-minimal-lock-names-a-lane-the-tree-does-not-carry.test.mjs`
asserts what is true and was refuter-tested: moving `writeLaneLock` before the `config.harness ===
false` block makes it fail with *"the lock names 66 path(s) the tree does not carry"* — **66, the
exact number this entry reported from payment-blueprint.** So the failure MODE it describes is real,
the code already prevents it, and the prevention is now held in place.

*Closed 2026-09-19. The lesson is the file's own: an entry written from reading, about behaviour
nobody executed, drifts from the tree it describes. This is the third today.*

