# `prooflane-studio-cmp`

**Reserved, not released.** Held for the [prooflane](https://www.npmjs.com/package/prooflane)
harness: a stack-agnostic verify lane that derives *done* from evidence rather than
taking an agent's word for it.

The mobile eyes: preview registry, headless render, live inspector. Providers behind the console's interfaces.

Nothing useful installs from here yet. What works today:

```bash
npx create-cmp-cli --help
```

The names are claimed ahead of the code deliberately. The harness is being split
out of `create-cmp-cli`, and the CLI, the receipt format and every stack profile
have to agree on one name — renaming a published evidence format twice is worse
than reserving the name once. This project uses unscoped `prooflane-*` names
because the `@prooflane` organisation was unavailable.

- The plan: [PACKAGE-SPLIT.md](https://github.com/kvdm-co-pilot/create-cmp/blob/main/docs/proposals/PACKAGE-SPLIT.md)
- The goals: [NORTH-STAR.md](https://github.com/kvdm-co-pilot/create-cmp/blob/main/docs/NORTH-STAR.md)

MIT.
