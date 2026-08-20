# create-cmp-harness

The **verify lane** every create-cmp app carries — the machine-owned half of a
stamped project.

A create-cmp app contains two kinds of file. *App-owned* files are the app: its
screens, specs, goldens, approvals, e2e flows. *Machine-owned* files are this
package: executable harness code that is byte-identical in every app ever
stamped, carrying no app content whatsoever.

```
machine-owned  ==  the .mjs files directly under qa/ and qa/lib/
```

`src/lib/harness-region.mjs` is that rule in code, and three properties follow
from it.

**Never stamped.** The lane is copied, not token-replaced. It used to be
stamped, and that silently corrupted it: `lib/approvals.mjs` had to detect
unresolved tokens by *shape* because writing the literal `__PACKAGE__` in its
own source got rewritten out from under it, and `scaffold-feature.mjs` shipped
an error message meaning to name the unresolved token that instead named the
app's real package. Anything app-specific the lane needs is read at runtime
from `create-cmp.json`.

**Verifiable.** Because every app's copy is byte-identical to a known version,
an app can prove offline that its lane is the real one. Without this a receipt
is unfalsifiable — edit `qa/verify.mjs` to force every step green and the
receipt still validates, since the edited file is simply part of the hashed
surface.

**Replaceable.** `create-cmp upgrade --harness` overwrites the region wholesale
instead of merging it. Merging a derived artifact was the mistake that made
upgrades expensive: a three-way merge over 10k lines of engine code produced
~1,000 conflicted lines per app with zero app-specific tokens in them.

## Vendored, not depended on

Generated projects stay dependency-free — `node qa/verify.mjs` runs offline,
in CI, and air-gapped with no install step. The engine ships byte-identical
copies inside `template/qa/`; this package is the single source of truth they
are copied from.

Edit `src/`, then re-vendor from the repo root:

```bash
node scripts/sync-harness.mjs
```

`test/harness-parity.test.mjs` pins package ↔ template ↔ fresh-scaffold
byte-equality, and `test/harness-region.test.mjs` pins the boundary itself.

## Versioning

`create-cmp-harness` versions **independently of `create-cmp-cli`**. The lane
changes far more often than the template's app shape, and fusing the two is
what forced an app-shape merge every time a lane fix shipped. An app records
both: the engine version that stamped its shape, and the harness version that
issues its verdicts.
