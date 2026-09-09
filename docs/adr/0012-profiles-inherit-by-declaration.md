# ADR-0012: A profile inherits by DECLARING a base, and the core derives the rest — protocol 2

- **Status:** accepted — 2026-09-09, Karel van der Merwe (signed by his instruction in session — "you can do both as the product owner and lead architect"; drafted by the architect)
- **Implementation:** landed with this ADR — `declaredBase` / `resolveInheritance` in `profile-loader.mjs`, `PROFILE_PROTOCOL = 2` with `SUPPORTED_PROFILE_PROTOCOLS = [1, 2]`, and Stage 2's criterion D green.
- **Date:** 2026-09-09

## Context

Stage 2's row opens with *"Profile versioning and protocol handshake; `extends`"*, and its gate states
the criterion precisely, including the way it may NOT be satisfied:

> **False green:** write the heir as `export * from "../base/index.mjs"` plus its own override — ESM
> re-export, no core support, criterion green, claim false. **RESISTS:** this gate writes both
> fixtures itself, and the heir it writes imports nothing. The only way to make it green is for the
> LOADER to derive the inheritance from the declared base.

That is the whole design constraint, and it is the right one. A profile that inherits by importing
its base has not inherited anything the core can reason about: the loader sees one module, the
receipt names one pack, and nothing can say what was inherited from where. Inheritance has to be
DATA — an id the core resolves — or it is a language feature wearing a protocol's name.

Two spellings are legal for the declaration, and the gate deliberately writes both. `extends` is a
reserved word: legal as an export NAME (`export { BASE as extends }`), not as a binding. An author
reaches for whichever their tooling tolerates, and the core must not privilege one.

## Decision

> **A profile inherits by declaring a base id; the loader resolves the chain and merges before it
> validates.** The heir's own declarations always win; everything else comes from the nearest
> ancestor that has it. Identity is never inherited. A circular chain is refused by name.
> **`extends` arrives in profile protocol 2**, and the lane speaks 1 and 2.

**Validation runs on the RESOLVED profile, not the file.** The protocol's required exports are a
property of the profile, not of the module that declares it — an heir that declares only what it
changes is complete once its base is merged in. Validating the raw module is what makes the loader
refuse an heir for omitting a declaration it legitimately inherits.

**Inheritance covers a named list, never "every export the base has".** Spreading a module namespace
would inherit `id` and `protocol` too, so an heir would silently become its base and its receipts
would name the wrong pack — the exact confusion `pack` exists to prevent (§8.9, ADR-0011). It would
also inherit whatever a base happens to export for its own internal use, which is not a contract.
So inheritance is exactly the protocol's own surface: the required exports minus identity, plus the
optional declarations the loader and the lane already know by name.

**An override wins even when it is falsy.** `in` decides, not truthiness. A stack with no
flow-shaped journey files declares `flows: null`, and a merge that read null as "absent" would
restore the base's flows underneath it — handing that stack a journey it does not have. The
ktor-backend fixture is exactly that stack, which is why the case is not hypothetical.

**The protocol moves to 2, and this is the part that is easy to skip.** Inheritance changes what a
profile must export, so only a loader that can derive the rest can load an heir. Without the bump an
heir declares 1, and an older lane refuses it with *"profile X must export layout"* — pointing the
author at their own file when the fix is to upgrade the harness. The protocol refusal says exactly
the right thing instead, and it already existed; it just needed a version worth comparing.

**So `extends` REQUIRES protocol 2, refused by name below it.** A version signal that authors may
ignore is advisory, and an advisory signal is one a reader cannot trust. Refusing `extends` at
protocol 1 is what makes "this profile needs a newer lane" a fact rather than a hope.

**A profile at protocol 1 is still loaded, unchanged.** It was written before `extends` existed, it
is complete on its own, and nothing about it moved. Refusing it would be a rename dressed as a
version — the failure ADR-0007 refused for the receipt, one layer down.

## Consequences

- **Stage 2's criterion D is green**, and by the only route the gate allows: the heir it writes
  imports nothing, so the inheritance is the core's or it does not exist.
- **No existing profile changes.** `cmp` declares protocol 1 and loads exactly as before; the
  fixture profiles are untouched.
- **A second profile becomes cheap to author**, which is the point of the stage: a backend heir of a
  base profile declares its tiers and its steps and inherits the rest, instead of restating
  declarations it does not vary.
- **The chain is reported** (`chain: ["heir", "base"]`), so a reader can see what a profile inherited
  from rather than inferring it. Nothing gates on it.
- **Two spellings must both be maintained forever**, or for as long as `extends` is a reserved word.
  That is a real, permanent cost, paid to avoid making authors guess which one the core prefers.
- **Depth is unbounded and cycles are refused by name**, with the chain that closed them in the
  message. Hanging or blowing the stack on an author error tells them nothing.

## Alternatives considered

- **`export * from "../base/index.mjs"`.** Rejected — and the gate rejects it too, by writing the
  fixtures itself. It is ESM re-export wearing the word: the core derives nothing, and nothing can
  say what came from where.
- **Inherit every export of the base.** Rejected: it inherits identity, so an heir becomes its base
  on every receipt, and it inherits internals that were never a contract.
- **Keep protocol 1 and treat `extends` as additive.** Rejected: an older lane then refuses an heir
  by naming a declaration the author deliberately left out. The refusal would be technically true
  and practically misleading, which is the class of signpost this project spends most of its effort
  removing.
- **Bump to 2 and refuse 1.** Rejected: every existing profile would have to be edited for a change
  that did not affect it.
- **Merge with truthiness rather than `in`.** Rejected: it silently restores a base's value under an
  intentional `null`, and the first profile to hit it would be the one with no flows.

## What would make this wrong

**A base that is not installed beside its heir.** Resolution is by id under `qa/lib/profiles/`, so an
heir whose base lives in another package cannot load. That is deliberate today — a profile is
vendored like everything else (ADR-0008) — but it means `extends` cannot yet express "inherit from a
profile I depend on", which is what a published profile registry would want. If Stage 2's
distribution work makes profiles separately installable, this resolution rule is the first thing
that has to be revisited.

## Related

- `docs/NORTH-STAR.md` §9 Stage 2 (the row this implements), §9.2, §8.9 (why identity is never
  inherited).
- `scripts/stage2-gate.mjs` criterion D — the criterion, and the false-green it names.
- `docs/adr/0007-receipt-format-name-is-routing-metadata.md` — why a version that refuses what it
  need not refuse is a rename dressed as a version.
- `docs/adr/0011-pack-is-load-bearing.md` — the companion case, where a version bump WAS refused for
  the same reason and the field was made required instead.
- `test/fixtures/profiles/ktor-backend/index.mjs` — the profile that declares `flows: null`, and so
  the reason the falsy-override rule is not hypothetical.
