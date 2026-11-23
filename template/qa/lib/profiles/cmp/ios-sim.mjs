// ios-sim.mjs — which iOS simulator a build or a run uses, decided once here
// instead of by whatever `xcrun simctl list` happens to print first.
//
//   node qa/lib/profiles/cmp/ios-sim.mjs        → prints the UDID, exit 0
//                                                 or the reason on stderr, exit 1
//
// Order (docs/features/shared-device-pin.md K5, K6):
//   1. CMP_IOS_SIM — a UDID or a device name; the developer's explicit choice.
//   2. The machine's shared device pin, when it opted in — refused, never
//      substituted, when the pinned simulator is gone.
//   3. Otherwise the first available iPhone on the NEWEST installed runtime —
//      deterministic, and never a reason to install an older one.

import { pathToFileURL } from "node:url";
import { defaultSh, compareVersions, readPin, pinnedSimulator, REPIN_HINT } from "./device-pin.mjs";

/** Available simulators with their runtime version, newest runtime first. */
export function availableSimulators({ sh = defaultSh } = {}) {
  const r = sh("xcrun simctl list devices available -j", { timeout: 60_000 });
  if (!r.ok) return null;
  let parsed;
  try {
    parsed = JSON.parse(r.out);
  } catch {
    return null;
  }
  const out = [];
  for (const [runtime, list] of Object.entries(parsed.devices || {})) {
    const m = runtime.match(/SimRuntime\.iOS-(\d+)-(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const version = [m[1], m[2], m[3]].filter((x) => x !== undefined).join(".");
    for (const d of list) out.push({ udid: d.udid, name: d.name, runtime, version });
  }
  // Stable: newest runtime first, simctl's own order within a runtime.
  return out.map((d, i) => ({ d, i })).sort((a, b) => compareVersions(b.d.version, a.d.version) || a.i - b.i).map(({ d }) => d);
}

/**
 * @returns {{ok: true, udid: string, name: string, version: string, source: "env"|"pin"|"newest"}
 *         | {ok: false, reason: string}}
 */
export function resolveSimulator({ sh = defaultSh, env = process.env, pin = readPin({ env }) } = {}) {
  const sims = availableSimulators({ sh });
  if (!sims) return { ok: false, reason: "could not list iOS simulators (`xcrun simctl list devices available -j` failed) — is Xcode installed and selected?" };

  if (env.CMP_IOS_SIM) {
    const want = env.CMP_IOS_SIM;
    const hit = sims.find((s) => s.udid === want) || sims.find((s) => s.name === want);
    if (hit) return { ok: true, udid: hit.udid, name: hit.name, version: hit.version, source: "env" };
    return { ok: false, reason: `CMP_IOS_SIM=${want} is not an available simulator on this machine — nothing is downloaded to satisfy it` };
  }

  if (pin && pin.state === "invalid") return { ok: false, reason: `the device pin at ${pin.path} is invalid (${pin.reason}) — ${REPIN_HINT}, or set CMP_IOS_SIM` };
  const pinned = pinnedSimulator(pin);
  if (pinned) {
    const hit = sims.find((s) => s.udid === pinned.udid);
    if (hit) return { ok: true, udid: hit.udid, name: hit.name, version: hit.version, source: "pin" };
    return { ok: false, reason: `the pinned shared simulator ${pinned.name} (${pinned.udid}) is not available on this machine — ${REPIN_HINT}; nothing is downloaded or substituted` };
  }

  const newest = sims[0];
  if (!newest) return { ok: false, reason: "no iOS simulator is available — create one in Xcode (Window → Devices and Simulators)" };
  const pick = sims.find((s) => s.version === newest.version && /^iPhone/.test(s.name)) || newest;
  return { ok: true, udid: pick.udid, name: pick.name, version: pick.version, source: "newest" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = resolveSimulator();
  if (r.ok) {
    process.stderr.write(`· iOS simulator: ${r.name} (iOS ${r.version}, ${r.source})\n`);
    process.stdout.write(`${r.udid}\n`);
  } else {
    process.stderr.write(`✗ ${r.reason}\n`);
    process.exit(1);
  }
}
