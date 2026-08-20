# M4 — Mechanical Enforcement + Negative Proof (design / delegation contract)

> Layer-4 completion. Everything below ships **in the generated project** (ADR-0001) and works
> with zero plugin. This doc is the buildable contract the implementation subagents work against;
> the *why* of the core decision is [ADR-0005](adr/0005-evidence-binding-by-inputs-hash.md).

The goal: make "no done without a verdict" **mechanical**, not honor-system, and **prove** the
gates refuse real violations. Four pieces (A–C buildable now; D device-gated, stays a SKIP).

---

## The shared primitive — `inputs.hash` and `qa/receipt-check.mjs`

Both enforcement points (Stop hook, CI) reduce to one question: *does the committed receipt
validly attest this tree?* Answer with a content hash of the **verified surface**, per ADR-0005.

### A1. Extend the receipt (`template/qa/verify.mjs`)

Add an `inputs` block to the receipt object (keep deterministic key order; place it next to
`commit`):

```js
inputs: {
  hash: computeInputsHash(),   // sha256 hex over the verified surface
  fileCount: <n>,              // how many tracked files went into the hash
},
```

`computeInputsHash()` — pure Node, no Gradle, uses the existing `tryGit` + `createHash`:

1. `git ls-files` restricted to the **verified surface** (below). Tracked files only —
   deterministic, ignores untracked scratch.
2. For each path (sorted, `localeCompare`): read bytes, `sha256(content)`.
3. Hash the concatenation of `` `${path}\0${fileSha}\n` `` for all files → the `inputs.hash`.
4. If git is unavailable (`tryGit` returns null), fall back to a `walkFiles` over the surface dirs
   so a non-git scaffold still produces a stable hash.

**Verified surface** — a single exported constant `VERIFIED_SURFACE` so it is auditable in one
place. Principle: *every tracked file whose content can change the lane's verdict, minus lane
outputs.*

- **Include:** `composeApp/` , `specs/` , `qa/` , `gradle/libs.versions.toml` , root
  `build.gradle.kts` , `settings.gradle.kts` , `gradle.properties`.
- **Exclude (lane outputs, never inputs):** `qa/evidence/**` (the receipt itself — including it
  would make the hash depend on its own output), `qa-artifacts/**`.
- **Out of surface by design:** `*.md` docs, `README`, `.github/`, `.claude/` — a doc/hook edit
  must not force a lane re-run.

Compute the hash **before** writing `latest.json` (the receipt is an output). Unit-safe: same tree
→ same hash, byte-for-byte.

### A2. The predicate — `template/qa/receipt-check.mjs` (new, dependency-free)

Reuses the exact same `computeInputsHash` + `VERIFIED_SURFACE` as verify.mjs — **factor them into a
tiny shared module** `template/qa/lib/inputs-hash.mjs` and import from both (no copy-paste; one
source of truth for the surface). 

```
node qa/receipt-check.mjs [--hook] [--json]
```

Logic:
1. Read `qa/evidence/latest.json`. Missing/unparseable → **INVALID** ("no receipt — run
   `node qa/verify.mjs`").
2. `recomputed = computeInputsHash()`.
3. **VALID** iff `receipt.verdict === "PASS" && receipt.inputs?.hash === recomputed`.
   Else INVALID with the specific reason: stale (`hash` differs → "source changed since the receipt
   — re-run the lane"), failed (`verdict === "FAIL"` → "the committed receipt is a FAIL"), or
   schema-old (no `inputs` field → "receipt predates evidence binding — re-run the lane").
4. Report the attesting `profile` in the message for transparency (a `scaffold` receipt attests
   less than `local`/`ci` — say so, don't silently accept-or-reject on profile).

Exit codes: **VALID → 0**, **INVALID → 1** normally; but under `--hook` see A3.

### A3. The Stop hook (`template/.claude/settings.json` — new file)

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "node qa/receipt-check.mjs --hook" }
        ]
      }
    ]
  }
}
```

`--hook` behaviour (Claude Code Stop-hook protocol):
- Reads the hook JSON on stdin; if `stop_hook_active === true`, **exit 0 (allow)** — never block a
  second consecutive time, so the hook nags at most once and can't trap a session in a loop.
- INVALID → **exit 2** with the actionable reason on **stderr** (exit 2 is the block-and-feed-back
  signal; the message goes to the model: *"Not done: <reason>. Run `node qa/verify.mjs` and commit
  the receipt, or see README §Enforcement to bypass."*).
- VALID → exit 0 silently.

Because validity is content-bound, the hook is silent for conversational turns and doc-only edits
(surface unchanged → hash matches the last PASS receipt) and fires exactly when
verdict-affecting source changed without a fresh PASS receipt.

### A4. Consent + escape hatch (generated `README.md`, new "Verification enforcement" section)

Enforcement must be **transparent, not hostile**. Document, in the generated project's README:
- *What* the Stop hook does (checks the committed receipt attests your changes; blocks "done" if
  not) and that it runs **no build** — it only hashes files.
- *Why* (the CLAUDE.md definition of done, made mechanical).
- *The escape hatch:* delete or comment the `Stop` block in `.claude/settings.json` to disable;
  it is the user's project and their call. Note that CI (M4-C) still enforces receipt-matches-HEAD
  on push regardless, so disabling the local hook trades convenience for a later signal.

---

## B. The refusal demo (C7) — `template/qa/refusal-demo.mjs` + captured doc

Prove the gates **refuse** real violations, each named and blocking. A runnable rehearsal that, in
a throwaway copy of the scaffold, injects each violation, runs the relevant gate, asserts it FAILs
by the **expected clause id**, and reverts. Four canonical violations (roadmap M4):

| # | Violation | Injected how | Must fail as | Gate |
|---|---|---|---|---|
| 1 | Hardcoded color literal | `Color(0xFF…)` into a screen | **ARCH-05** | conformance |
| 2 | UI→data import | `import …data…` into a presentation file | **ARCH-01** | conformance |
| 3 | Deleted / weakened test | remove a `// SPEC:`-tagged test | **specCoverage** (orphan clause) | verify lane step |
| 4 | Undeclared structural regression | mutate a screen's tree without `UPDATE_GOLDEN` | golden-tree (e.g. **HOME-06**) | goldenTrees |

Rules:
- Operate on a **copy** (temp dir / `git stash`-style isolation) — never leave the template dirty.
- Assert on the **clause id in the failure message**, not just non-zero exit — the point is the
  gate names the offender.
- Also assert the **Stop-hook predicate** goes INVALID for the violated tree (ties the demo to
  enforcement: violation ⇒ receipt-check blocks "done").
- Emit a summary table (violation → expected clause → observed verdict → PASS/FAIL of the
  *assertion*). Exit non-zero if any assertion fails (i.e. a gate did NOT catch its violation).
- Capture a committed narrative: `docs/research/harness-refusal-demo.md` (or extend the C-series
  rehearsal log) — the recorded evidence that C7 passed, with the observed messages.

This supersedes the M2 note that negative proofs were run as ad-hoc scratch violations — C7 makes
them a **repeatable, committed rehearsal**.

---

## C. Receipt-matches-HEAD CI enforcement (`template/.github/workflows/verify.yml`)

Add a step **before** the lane re-run, so a bad receipt fails fast:

```yaml
- name: Receipt attests HEAD
  run: node qa/receipt-check.mjs
```

The committed `qa/evidence/latest.json` must validly attest the checked-out tree (PASS + inputs
hash matches). This is robust to the rebase/merge problem that deferred it from M2 (ADR-0005:
content hash, not parent SHA). CI still **independently re-runs** the full lane afterward (existing
`node qa/verify.mjs --profile ci`) — so CI proves both *"the author's receipt is honest"* and
*"the lane is green on a clean runner."*

Note in the workflow comment: this is the enforcement the local Stop hook mirrors — same predicate,
two locations.

---

## D. `prove_change` / tokenDrift live tier — **stays a SKIP**

Runtime resolved-token drift and `prove_change` verdicts need the running app + `cmp-inspector`
live tier. Not buildable without a device/emulator; leave `stepTokenDrift` the honest SKIP it is
and embed `prove_change` verdicts into the receipt in the **device session**, not M4. Record this
as the one M4 item deferred with its reason (transparent SKIP, not silent gap).

---

## Gate (orchestrator-run, not trusted from prose)

1. **Engine** `npm test` → 204/204 (template changes must not break engine expectations; if the
   feature-strip / manifest tests assert file sets, update them for the new `qa/receipt-check.mjs`,
   `qa/lib/inputs-hash.mjs`, `.claude/settings.json`).
2. **Fresh scaffold**, full lane → PASS, and the receipt now carries `inputs.hash` + `fileCount`.
3. **Stop-hook positive**: right after a PASS lane, `node qa/receipt-check.mjs --hook` → exit 0.
4. **Stop-hook negative**: touch a `composeApp/src` file → `receipt-check --hook` → exit 2 with the
   stale reason; re-run lane → exit 0 again.
5. **C7**: `node qa/refusal-demo.mjs` → all four violations caught by the named clause, summary all-
   green, tree left clean.
6. **CI check negative**: hand-edit `latest.json` verdict/hash → `receipt-check` exit 1; revert.
7. Doc-only edit (`README.md`) does **not** invalidate a PASS receipt (surface exclusion works).

Definition of done for M4: violation ⇒ Stop hook blocks "done"; fix ⇒ lane PASS ⇒ done permitted —
demonstrated, not asserted.

## Delivered / deferred (update as built)

- [x] A — inputs.hash + receipt-check + settings.json Stop hook + README consent.
      `qa/lib/inputs-hash.mjs` (surface + hash), `qa/receipt-check.mjs` (predicate, `--hook` exit-2
      + `stop_hook_active` loop-guard), `.claude/settings.json` Stop hook, README §Verification
      enforcement. Gated: fresh-scaffold receipt carries `inputs.hash`(64-hex)+`fileCount`;
      positive VALID/0, dirtied-surface INVALID/1 + hook exit-2, doc-edit stays VALID (surface
      exclusion), receipt-verdict tamper caught. Engine 204/204.
- [x] B — refusal demo C7. `qa/refusal-demo.mjs` (throwaway scaffold; inject→run narrowest
      gate→assert clause id in output AND receipt-check blocks→`git checkout` revert). Reads the
      clause-citing text from JUnit XML (Gradle `--console=plain` omits it from stdout). Evidence
      narrative: `docs/research/harness-refusal-demo.md` (internal/gitignored, per charter; the
      runnable script is the tracked, reproducible proof). Gated by orchestrator: **4/4 assertions
      PASS** (ARCH-05, ARCH-01, HOME-01/specCoverage, HOME-06), tree left clean.
- [x] C — receipt-matches-HEAD CI step (`.github/workflows/verify.yml`: `Receipt attests HEAD`
      runs `node qa/receipt-check.mjs` before the lane re-run; same predicate as the Stop hook).
- [ ] D — DEFERRED (device session): prove_change/tokenDrift live tier (needs running app +
      inspector; `stepTokenDrift` stays the honest SKIP).
