# Shared device pin — one emulator, one simulator, one runtime per machine

Status: **decided by Karel, 2026-10-31, in the session that commissioned this slice** — K3 amended
the same day, from "asked once per machine" to "asked per project". The decisions below are his and
are recorded as his. Opt-in: a project that never answers the question behaves exactly as it did
before this slice.

```json cmp:feature
{ "touches": [], "screens": false }
```

## The problem, as it was measured

One developer machine, 2026-09-10 → 2026-10-31. The disk filled four times, and every time the
largest reclaimable item was a test device nobody had chosen on purpose:

- **Three Android emulators, 20 GB** (`Medium_Phone` 10 GB, `Fuelled_API_35` 6.8 GB,
  `Brat_Princess` 3.2 GB) — one per app, because `device-provider.mjs` and `cmp-doctor` both
  say "one AVD per app, named after the app".
- **iOS 18.5 installed three times, ~19 GB each time plus a 6.6 GB dyld cache**, beside the
  iOS 26.5 the machine actually uses. Each `simctl runtime delete` came back within days under
  a new identifier. Two causes: an app's `verify.mjs` asked for a simulator **by name**
  (`"iPhone 16 Pro"`, which only exists on 18.5), and macOS keeps the original download in
  `/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime/` and re-registers it.
- **The template's iOS build picks whatever `simctl` lists first** (`grep … | head -1` in
  `template/manifest.json`), so which runtime a build lands on is an accident of list order.
- **The inspector's `connect_live` boots the first AVD `emulator -list-avds` prints** — a guess,
  where the lane deliberately refuses to guess.

Nothing here is a bad choice in one place. It is four places each choosing a device, none of
them knowing what the machine already has.

## Decisions (Karel's, and closed)

**K1 — Detect what is installed and pin it; never hard-code a version.** The pin is written
from what the machine already has (the newest iOS runtime, an iPhone on it, the newest Android
system image and an AVD built on it). No version, device name or API level is written into the
plugin or into an app as "the" device.

**K2 — One shared emulator.** Every create-cmp app that opts in uses the machine's pinned AVD. The
isolation the per-app rule bought is kept a different way: a lane that boots the shared
emulator boots it with `-wipe-data` (a factory-fresh device every run), and the existing
machine-global device lease (`device-lease.mjs`) already stops two apps driving it at once.

**K3 — Opt-in PER PROJECT, asked with the pros, the cons and a disk check.** Amended by Karel the
same day: a machine-wide "asked once" swept every later app into a choice made for another one.
So each project is asked on its own — the machine keeps one detected device set, and each project
answers `shared` or `per-app`. The question carries the pros, the cons, free disk space, what each
installed device costs and what sharing would let you reclaim. Plain `cmp-doctor` inside a project
never asked asks at a terminal; `cmp-new` asks for every new app. An agent session has no terminal,
so the skills ask the human (AskUserQuestion) from `--device-pin status`, then record the answer
with `--device-pin shared` or `--device-pin per-app`. `--yes` never answers it. Every git worktree
of one repo is one project, so a repo's worktrees are asked once, not once each.

**K4 — The pin lives on the machine, not in the plugin and not in an app.** One file,
`~/.config/create-cmp/devices.json` (`$XDG_CONFIG_HOME` honoured; `CMP_DEVICE_PIN` overrides
the path): the machine's device set, and each project's answer keyed by its repo. Disk is per
machine, so the devices are per machine; an app repo that carried the answer would carry one
developer's laptop into everyone's checkout.

**K5 — A pinned device that is missing is a refusal, never a download or a substitute.** The
lane, the iOS build and the inspector stop with "pinned … is not on this machine — run
cmp-doctor --device-pin repin". Fetching a replacement is the exact behaviour that filled the
disk.

**K6 — Explicit overrides still win.** `CMP_AVD` (and an attached device) are honoured before
the pin, as today. The pin replaces guessing, not the developer.

## What changes, and where

| Place | Before | After (mode `shared`) | No pin / `per-app` |
|---|---|---|---|
| `packages/harness/…/device-provider.mjs` | `CMP_AVD`, else `cmp_pixel`, else the only AVD, else refuse | `CMP_AVD`, else the pinned AVD (refuse if gone), booted with `-wipe-data` | unchanged |
| `packages/harness/…/ios-sim.mjs` (new) + `template/manifest.json` `ios` | first UDID `simctl` lists | the pinned simulator (refuse if gone) | newest runtime's first available iPhone — deterministic |
| `inspector/mcp/…/live-session.mjs` | first AVD listed | `CMP_AVD`, else the pinned AVD | unchanged (first AVD) |
| `cmp-doctor` | — | `--device-pin status\|shared\|per-app\|repin [--target-dir <app>]`; asks per project; lists unshared runtimes/AVDs/images with sizes and the exact command to remove each | — |
| `cmp-new` skill | — | asks the new app the same question after GREEN | — |

The pin's reader and discovery live in one module,
`packages/harness/src/lib/profiles/cmp/device-pin.mjs`, imported by the lane, the doctor and
(bundled) the inspector — the path and the shape are stated once.

## Edge cases

- **Pinned AVD deleted by hand.** Refusal naming the AVD and the repin command (K5).
- **Pinned simulator's runtime removed by an Xcode update.** Same: refusal, repin. Repin
  proposes the newest runtime now installed.
- **Nothing installed yet.** Doctor's toolchain checks install a system image and an AVD first
  (unchanged); the pin question is asked only when there is something to pin, and says so.
- **Several iOS runtimes or system images installed.** The proposal is the newest; the others
  are listed as reclaimable with their size and removal command. Nothing is deleted by doctor.
- **The cached runtime download in `AssetsV2`.** Listed with its size and the supported removal,
  Xcode → Settings → Components. System Integrity Protection guards that directory: `sudo rm`
  there is "Operation not permitted" (measured 2026-10-31), so no command is offered for it.
- **Linux / no Xcode.** The iOS half of the pin is absent; the Android half works.
- **Two apps' lanes at once on the shared emulator.** The device lease already serializes them
  and names the holder; unchanged.
- **A hand-edited or corrupt pin file.** Read as "invalid", reported by doctor with the path;
  the lane refuses rather than guessing.
- **Opted out (`per-app`) or never asked.** Behaviour is the pre-slice behaviour, except the
  iOS build picks deterministically instead of by list order.
- **A new app on a machine where others share.** Asked on its own (K3); its answer changes no
  other project's. `status` says how many other projects share.
- **Worktrees.** Keyed by the repo's common git dir, so `git worktree add` inherits the repo's
  answer; a scratch directory outside git is its own project.
- **`repin` while several projects share.** It re-detects the set for all of them and says how
  many it changed — it is the machine's set, so it is never re-detected per project.

## Out of scope

- Deleting anything. Doctor reports reclaimable devices and prints the commands; the human
  runs them.
- Pinning Xcode itself (`DEVELOPER_DIR`). One Xcode was the measured case; the pin records the
  active Xcode path for the report only.
- App-local scripts that choose a device by name (an app's own `verify.mjs`). They can read the
  pin through `ios-sim.mjs`; changing them is the app's change, not this one.
