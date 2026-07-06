# Behavior specifications

**The spec is the source of truth for intended behavior.** Durable tests (Compose UI Tests,
E2E flows) are its executable projection — every clause maps to at least one test carrying its
id, and every durable test cites the clause it verifies.

## The workflow

1. **New behavior begins as a spec clause.** Before writing code, add a clause to the feature's
   spec (AI proposes, human confirms). Changing behavior = changing the clause first.
2. Implement, mirroring the exemplar. Write/update the durable tests **tagged with the clause
   id** (`// SPEC: HOME-02`).
3. `node qa/verify.mjs` — the lane checks the tests; the spec-coverage gate (when it ships)
   fails orphan clauses (no test) and orphan tests (no clause).

## Format

One file per feature: `specs/<feature>.spec.md`. Clauses are Given/When/Then with **stable
ids** (`<FEATURE>-<NN>`) — ids are never renumbered or reused; a withdrawn clause is struck
through and kept. `app-base.spec.md` covers the base architecture and the app shell the
scaffold itself ships.
