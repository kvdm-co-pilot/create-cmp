// connect.mjs — the SELF-HEALING tier-1 handshake, plus the verified relaunch
// (C10) it absorbs.
//
// Four separate real-world conditions each used to fail connect_live outright
// and cost a session real time (agent-flow-retrospective §3.3 / §5):
//   1. the `adb forward tcp:9500 tcp:9500` was missing (the lane tears its own
//      forward down; nothing recreated it),
//   2. the debug app was not running (health endpoint dead),
//   3. the adb server's device transport was stale — the adb CLIENT says
//      `device offline` while `adb devices` says `device`,
//   4. the app process had been replaced after a reinstall.
// Each is now an internal healing move, in order: ensure a device is attached
// (else an actionable error naming the exact next command) → refuse (stage
// "lease") while a verify lane holds the machine-global device lease, naming
// the holder — a lane mid-device-phase must never be collided with, and "a lane
// is driving this device" beats a mysterious `device offline` (see
// device-lease.mjs, including the check-don't-hold decision) → ensure the forward
// (creating it IS ensuring it — `adb forward` is idempotent) → poll health → if
// dead, launch the app (applicationId parsed from the project, never hardcoded)
// and re-poll with bounded backoff → on any `device offline`-class error, reset
// the adb server (kill-server / start-server / wait-for-device) ONCE and retry
// the whole sequence once.
//
// Every failure path throws a ConnectError naming the STAGE that failed and the
// one command a human/agent should run next — never a bare timeout.
//
// Pure logic + injectable transports (exec / fetchHealthImpl / sleep), like
// navigate.mjs, so everything unit-tests without adb or a device.

import fs from "node:fs";
import path from "node:path";

import { readDeviceLease, formatHolder, MAX_LEASE_AGE_MS } from "./device-lease.mjs";

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A stage-labeled, next-command-carrying failure. */
export class ConnectError extends Error {
  /**
   * @param {string} stage    which healing stage failed (adb|device|lease|forward|app-id|launch|health|relaunch)
   * @param {string} message  what went wrong, in plain words
   * @param {string} fix      the ONE command/action to run next
   * @param {{offlineClass?: boolean}} [opts]
   */
  constructor(stage, message, fix, { offlineClass = false } = {}) {
    super(message);
    this.name = "ConnectError";
    this.stage = stage;
    this.fix = fix;
    this.offlineClass = offlineClass;
  }
}

// The `device offline` FAMILY: the adb client's transport to a device that
// `adb devices` still lists as fine. All of them are healed by an adb server
// reset, none of them by retrying the same call.
const OFFLINE_CLASS_RE =
  /device offline|device still (?:connecting|authorizing)|device '[^']*' not found|protocol fault|connection reset|closed/i;

/** True when an error is worth ONE adb-server reset + full-sequence retry. */
export function isOfflineClass(err) {
  if (!err) return false;
  if (err.offlineClass) return true;
  const text = `${err.message || err}${err.stderr || ""}${err.stdout || ""}`;
  return OFFLINE_CLASS_RE.test(text);
}

/**
 * Resolve the app's applicationId GENERICALLY from the project — never
 * hardcoded. Precedence: `applicationId = "…"` in the app module's
 * build.gradle.kts (the value `pm`/`monkey` actually need) → create-cmp.json's
 * `package` → the module's `namespace` (equal to applicationId in the template).
 *
 * @param {string} projectDir
 * @param {{fsImpl?: typeof fs}} [opts]
 * @returns {string}
 * @throws {ConnectError} stage "app-id" when nothing resolves.
 */
export function resolveAppId(projectDir, { fsImpl = fs } = {}) {
  const gradle = path.join(projectDir, "composeApp", "build.gradle.kts");
  try {
    const text = fsImpl.readFileSync(gradle, "utf8");
    const m = text.match(/applicationId\s*=\s*"([^"]+)"/);
    if (m) return m[1];
    const ns = text.match(/namespace\s*=\s*"([^"]+)"/);
    if (ns) return ns[1];
  } catch {
    /* no gradle file — fall through to the spec */
  }
  try {
    const spec = JSON.parse(fsImpl.readFileSync(path.join(projectDir, "create-cmp.json"), "utf8"));
    if (spec && spec.package) return spec.package;
  } catch {
    /* no spec either */
  }
  throw new ConnectError(
    "app-id",
    `cannot resolve the applicationId from '${projectDir}' (no applicationId/namespace in ` +
      `composeApp/build.gradle.kts, no package in create-cmp.json).`,
    "pass appId (or the app's projectDir) to connect_live explicitly."
  );
}

/**
 * `adb devices` → the device to use. Throws a stage-"device" ConnectError with
 * the exact next command when no usable device exists.
 *
 * @returns {Promise<{flag: string|null, actual: string}>} `flag` is what adb -s
 *   needs (null = single unnamed device, no -s); `actual` is the real serial of
 *   the chosen device either way — the device-lease key.
 */
async function resolveDevice({ exec, serial }) {
  let stdout;
  try {
    ({ stdout } = await exec("adb", ["devices"]));
  } catch (err) {
    if (err && (err.code === "ENOENT" || /ENOENT/.test(String(err.message)))) {
      throw new ConnectError(
        "adb",
        "adb is not on PATH.",
        "install Android platform-tools (e.g. `brew install --cask android-platform-tools`) or add $ANDROID_HOME/platform-tools to PATH."
      );
    }
    throw new ConnectError("adb", `\`adb devices\` failed: ${err.message || err}.`, "run: adb devices", {
      offlineClass: isOfflineClass(err),
    });
  }
  const rows = String(stdout)
    .split("\n")
    .slice(1) // "List of devices attached" header
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/))
    .filter(([, state]) => state); // drop noise lines
  if (rows.length === 0) {
    throw new ConnectError(
      "device",
      "no device or emulator is attached.",
      "start an emulator (or plug in a device), then re-run connect_live; check with: adb devices"
    );
  }
  const chosen = serial ? rows.find(([s]) => s === serial) : rows.length === 1 ? rows[0] : null;
  if (serial && !chosen) {
    throw new ConnectError("device", `device '${serial}' is not attached.`, "check the serial against: adb devices");
  }
  if (!chosen) {
    throw new ConnectError(
      "device",
      `${rows.length} devices attached — connect_live needs to know which one.`,
      `pass serial, one of: ${rows.map(([s]) => s).join(", ")} (from adb devices).`
    );
  }
  const [chosenSerial, state] = chosen;
  if (state === "offline") {
    // adb devices ITSELF says offline — the stale-transport class, healed by a server reset.
    throw new ConnectError(
      "device",
      `adb reports device '${chosenSerial}' as offline (stale adb server transport).`,
      "adb kill-server && adb start-server && adb wait-for-device",
      { offlineClass: true }
    );
  }
  if (state === "unauthorized") {
    throw new ConnectError(
      "device",
      `device '${chosenSerial}' is unauthorized.`,
      "accept the USB-debugging authorization prompt on the device screen, then re-run connect_live."
    );
  }
  return { flag: serial ? chosenSerial : null, actual: chosenSerial }; // single unnamed device: no -s needed
}

/**
 * The self-healing connect. See the file header for the healing order.
 *
 * @param {object} opts
 * @param {number} opts.port                validated inspector port
 * @param {string|null} [opts.serial]       validated adb serial
 * @param {string} [opts.projectDir]        app repo root, for applicationId resolution (default: cwd)
 * @param {string} [opts.appId]             explicit applicationId (skips resolution)
 * @param {boolean} [opts.relaunch]         force a verified relaunch even when already healthy
 * @param {boolean} [opts.clearState]       with relaunch: also `pm clear`
 * @param {(cmd:string, args:string[])=>Promise<{stdout:string}>} opts.exec
 * @param {(o:{port:number, timeoutMs?:number})=>Promise<object>} opts.fetchHealthImpl
 * @param {(ms:number)=>Promise<void>} [opts.sleep]
 * @param {number} [opts.launchWaitMs]      bounded backoff budget after a launch (default 20s)
 * @param {(serial:string)=>object|null} [opts.readLeaseImpl] device-lease reader (injectable for tests)
 * @returns {Promise<{health:object, appId:(string|null), healed:string[], relaunch:(object|null), port:number, serial:string}>}
 */
export async function connectLive({
  port,
  serial = null,
  projectDir,
  appId,
  relaunch = false,
  clearState = false,
  exec,
  fetchHealthImpl,
  sleep = defaultSleep,
  launchWaitMs = 20_000,
  readLeaseImpl = (s) => readDeviceLease(s),
} = {}) {
  const healed = [];

  const attempt = async () => {
    // 1. A device must be attached (and usable).
    const { flag: s, actual: actualSerial } = await resolveDevice({ exec, serial });
    const withSerial = (args) => (s ? ["-s", s, ...args] : args);

    // 1.5. The machine-global device lease (src/lib/device-lease.mjs — the
    // check-only reader; the acquiring side lives in every generated app's
    // qa/lib/device-lease.mjs). A verify lane holds the device for its whole
    // device phase; driving the live app mid-lane is the wedged-adbd /
    // `device offline` collision class, so a held device is a refusal that
    // NAMES the holder — never a mysterious transport error. connect_live
    // checks but never holds (see device-lease.mjs's hold-vs-check decision):
    // a console session is open-ended and must not starve the lane.
    const heldBy = readLeaseImpl(actualSerial);
    if (heldBy) {
      throw new ConnectError(
        "lease",
        `device ${actualSerial} is held by ${formatHolder(heldBy)} — a lane is driving this device right now; ` +
          `device evidence is batched, not concurrent.`,
        `wait for the holder to finish (its lease clears on exit, or goes stale after ` +
          `${Math.round(MAX_LEASE_AGE_MS / 60_000)} min if it crashed), then re-run connect_live.`
      );
    }

    // 2. Ensure the forward exists — creating it IS ensuring it (idempotent).
    const forwardArgs = withSerial(["forward", `tcp:${port}`, `tcp:${port}`]);
    try {
      await exec("adb", forwardArgs);
    } catch (err) {
      throw new ConnectError(
        "forward",
        `adb forward failed (adb ${forwardArgs.join(" ")}): ${err.message || err}.`,
        `run it by hand to see adb's own words: adb ${forwardArgs.join(" ")}`,
        { offlineClass: isOfflineClass(err) }
      );
    }

    // 3. Poll health once, briefly.
    let health = await fetchHealthImpl({ port, timeoutMs: 3000 }).catch(() => null);

    // 4. Dead health = the debug app is not running. Launch it and re-poll
    //    with bounded backoff — the failure mode that used to be a bare error.
    let resolvedAppId = appId || (health && health.appId) || null;
    if (!health) {
      resolvedAppId = appId || resolveAppId(projectDir || process.cwd());
      try {
        await exec("adb", withSerial(["shell", "monkey", "-p", resolvedAppId, "-c", "android.intent.category.LAUNCHER", "1"]));
      } catch (err) {
        throw new ConnectError(
          "launch",
          `launching '${resolvedAppId}' failed: ${err.message || err}.`,
          `is a DEBUG build installed? install one: ./gradlew :composeApp:installDebug`,
          { offlineClass: isOfflineClass(err) }
        );
      }
      const deadline = Date.now() + launchWaitMs;
      let backoff = 500;
      while (!health && Date.now() < deadline) {
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 3000);
        health = await fetchHealthImpl({ port, timeoutMs: 3000 }).catch(() => null);
      }
      if (!health) {
        throw new ConnectError(
          "health",
          `launched '${resolvedAppId}' but /inspect/health on port ${port} never answered within ${launchWaitMs}ms. ` +
            `Either the installed build is not a DEBUG build (the inspector is structurally absent from release ` +
            `builds), or the app is crashing on startup.`,
          `check the app's own words: adb logcat --pid=$(adb shell pidof ${resolvedAppId}) — or reinstall: ./gradlew :composeApp:installDebug`
        );
      }
      healed.push("app-launched");
    }

    // 5. An explicitly requested relaunch (relaunch_app's job, absorbed as an
    //    internal move): verified by processStartedAtMs advancing, never assumed.
    let relaunchReceipt = null;
    if (relaunch) {
      relaunchReceipt = await relaunchApp({
        appId: health.appId || resolvedAppId,
        serial: s || undefined,
        clearState,
        exec,
        fetchHealthImpl: () => fetchHealthImpl({ port, timeoutMs: 3000 }),
        sleep,
      }).catch((err) => {
        throw new ConnectError(
          "relaunch",
          `relaunch failed: ${err.message || err}.`,
          "check `adb devices`, then retry connect_live { relaunch: true }.",
          { offlineClass: isOfflineClass(err) }
        );
      });
      health = await fetchHealthImpl({ port, timeoutMs: 3000 });
      healed.push(clearState ? "relaunched-cleared" : "relaunched");
    }

    return { health, appId: health.appId || resolvedAppId || null, healed, relaunch: relaunchReceipt, port, serial: actualSerial };
  };

  try {
    return await attempt();
  } catch (err) {
    if (!isOfflineClass(err)) throw err;
    // The `device offline` class: reset the adb server ONCE, then retry the
    // whole sequence once. kill-server may complain when no server runs — fine.
    await exec("adb", ["kill-server"]).catch(() => {});
    await exec("adb", ["start-server"]).catch(() => {});
    await exec("adb", serial ? ["-s", serial, "wait-for-device"] : ["wait-for-device"]).catch(() => {});
    healed.push("adb-transport-reset");
    try {
      return await attempt();
    } catch (err2) {
      if (err2 instanceof ConnectError) {
        err2.message += " (the adb server was already reset once — this is not the stale-transport class.)";
        throw err2;
      }
      throw err2;
    }
  }
}

/**
 * C10 — deterministic app lifecycle, implemented OUTSIDE the process on purpose.
 * An in-app relaunch endpoint dies with its own process and can never prove the
 * restart happened; adb force-stop + launch is strictly stronger, and
 * `processStartedAtMs` (the in-app half, GET /inspect/health) is the receipt:
 * the walk asserts it MOVED FORWARD, so "fresh process" is proven, not assumed.
 * `clearState: true` adds `pm clear` — pristine app data (databases, prefs),
 * for walks that must start from first-run state.
 *
 * @param {{ appId: string, serial?: string, clearState?: boolean, port?: number,
 *   exec: Function, fetchHealthImpl: Function, sleep?: Function,
 *   waitTimeoutMs?: number }} opts
 *   `exec(cmd, args)` runs a process (injectable: execFileAsync in prod);
 *   `fetchHealthImpl()` reads /inspect/health and returns its parsed JSON.
 * @returns {{ relaunched: true, clearedState: boolean,
 *   beforeStartedAtMs: (number|null), afterStartedAtMs: number }}
 */
export async function relaunchApp({
  appId,
  serial,
  clearState = false,
  exec,
  fetchHealthImpl,
  sleep = defaultSleep,
  waitTimeoutMs = 20_000,
} = {}) {
  if (!appId) throw new Error("relaunchApp: appId is required (resolve it from /inspect/health first).");
  const adb = (args) => exec("adb", serial ? ["-s", serial, ...args] : args);

  const before = await fetchHealthImpl().catch(() => null);
  const beforeStartedAtMs = before?.processStartedAtMs ?? null;

  await adb(["shell", "am", "force-stop", appId]);
  if (clearState) await adb(["shell", "pm", "clear", appId]);
  await adb(["shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"]);

  // The receipt: health must come back with a STRICTLY NEWER process start.
  const deadline = Date.now() + waitTimeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    await sleep(500);
    try {
      const health = await fetchHealthImpl();
      const startedAt = health?.processStartedAtMs;
      if (typeof startedAt === "number" && (beforeStartedAtMs == null || startedAt > beforeStartedAtMs)) {
        return { relaunched: true, clearedState: clearState, beforeStartedAtMs, afterStartedAtMs: startedAt };
      }
      lastError = new Error(
        `health is reachable but processStartedAtMs (${startedAt}) has not advanced past the ` +
          `pre-relaunch value (${beforeStartedAtMs}) — the old process may still be serving.`
      );
    } catch (err) {
      lastError = err; // expected while the process is down — keep polling
    }
  }
  throw new Error(
    `relaunchApp: no fresh process within ${waitTimeoutMs}ms — ${lastError ? lastError.message : "health never responded"}. ` +
      "Check `adb devices`, the adb forward, and that the app launches (adb logcat)."
  );
}
