# `prooflane`

**Reserved, not released.** This name is held for the **prooflane** harness: a
stack-agnostic verify lane that derives *done* from evidence rather than taking
an agent's word for it.

Nothing useful installs from here yet. What works today:

```bash
npx create-cmp-cli --help
```

Why the name exists before the package: the harness is being split out of
`create-cmp-cli`, and the receipt format, the CLI and each stack profile all
have to agree on one name. Renaming a published evidence format twice is worse
than reserving the name once.

- The plan: [PACKAGE-SPLIT.md](https://github.com/kvdm-co-pilot/create-cmp/blob/main/docs/proposals/PACKAGE-SPLIT.md)
- The goals it answers to: [NORTH-STAR.md](https://github.com/kvdm-co-pilot/create-cmp/blob/main/docs/NORTH-STAR.md)

MIT.
