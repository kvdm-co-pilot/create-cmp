# Attach mode (M0) — the harness without the scaffold

Status: **v1 (M0a) built 2026-08-21** on Karel's direct instruction to execute LADDER
R1–R5; this brief records the design decisions and the staging so the remaining scope
(M0b) has a contract to build against. Companion: `docs/research/LADDER-PLAN.md` §R5,
`docs/research/AGENTIC-MOBILE-STUDIO.md` §M0.

```json cmp:feature
{ "touches": [], "screens": false }
```

## The decision

Attach mode is Act 1's **other door** (LADDER §2): "install Act 2/3 into a repo that
skipped Act 1." It is deliberately the last rung, because it is built almost entirely
out of the rungs before it — R1's symptom table, R2's hook classifier, R3's walk
machinery — and the design question is not *what* to install but *what can be installed
honestly into a tree we did not stamp*.

**The honesty constraint is the design.** In a create-cmp scaffold, every AGENTS.md row
and every hook is test-pinned to machinery that provably ships. A foreign Compose repo
has none of that machinery: no `qa/` lane, no PreviewRegistry, no `renderScreens` task,
no testTag conventions, no loopback inspector. An attach that wrote our full discovery
surfaces into such a repo would be a discovery surface that lies — the exact failure
mode R1's evidence-or-silence gate exists to kill. So attach is staged by what can be
made TRUE mechanically:

## Staging

**M0a — the contract (built).** `create-cmp attach [dir]`:

- **Refuses dishonestly-shaped targets**: not a Gradle project, or no Compose/KMP
  signal in its build files → exit 1 with the reason; a `create-cmp.json` tree → exit 1
  pointing at `harden` / `upgrade --harness` (those own stamped apps).
- **Writes `AGENTS.md`** — an attach-specific rendering of the R1 symptom table
  containing ONLY rows that are true in any Compose/KMP repo: the engine's `doctor` and
  `upgrade` at the toolchain walls, the famous-failures URL, and an honest "what is NOT
  wired here" section naming what a create-cmp scaffold would add.
- **Writes `.claude/settings.json`** — advisory-only, derived through the R2
  classifier's rules: a SessionStart context stating what this repo has and does not
  have. No Stop hook (nothing to enforce), no lane nudges (no lane), and no
  inspector nudge (no inspector is wired — a nudge naming absent tools would lie).
- **Never clobbers**: an existing differing file keeps its bytes and our content lands
  beside it as `*.cmp-new` (the R3 walk's sidecar convention); a byte-identical file is
  reported current. Idempotent by construction.
- **Reports** wired / sidecar / skipped-with-reason, and names the staged remainder.

**M0b — the eyes (staged, trigger-gated per the studio plan: first post-launch adoption
signal or first "can I use this on my existing app?" inbound).** Wiring
PreviewRegistry + the `renderScreens` task + the preview `qa/` subset into a foreign
Gradle build requires detecting/adding a desktop JVM target and a registry seeded from
the repo's own composables — real per-repo variance that deserves its own design pass,
plus the M0 DoD proof (attach onto ≥2 real third-party open-source Compose apps with
the preview loop green on both). Not faked in M0a: the report names it as not wired.

## Decisions recorded (the why)

1. **AGENTS.md, not CLAUDE.md.** AGENTS.md is the vendor-neutral surface and, in a
   foreign repo, plausibly ours to seed. CLAUDE.md in a foreign repo is the *owner's*
   contract — overwriting or shadowing it is clobbering identity.
2. **No lane subset in M0a.** The lane's steps address `:composeApp:` and the stamped
   layout by name; pointed at an arbitrary module layout they would fail as noise, and
   a lane that cannot pass teaches distrust (same rot as a lying table).
3. **No `create-cmp.json`.** Attach does not make the repo a stamped app, and writing
   the spec-of-record would invite `harden`/`upgrade --harness` to treat it as one.
   M0b revisits whether attach needs its own marker file.
4. **Reuse over invention.** Sidecar convention from the R3 walk; hook classes from R2;
   the table grammar and evidence-or-silence bar from R1. Attach adds a door, not a
   mechanism.

## Open decisions (for the human)

- M0b's wiring strategy for non-`composeApp` module names (parameterize the lane vs
  generate a thin adapter).
- Whether the M0 DoD's "≥2 real third-party apps" proof runs before or after the M0b
  build (the studio brief implies after; running one probe earlier would de-risk it).
