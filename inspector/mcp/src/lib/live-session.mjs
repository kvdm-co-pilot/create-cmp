// live-session.mjs — A1: the console's "Live device" section, and the
// start-chain the harness used to make the agent hand-roll.
//
// Two halves:
//   • getLiveDeviceStatus — a fast probe of the debug inspector
//     (GET /inspect/health, sub-second timeout). Reachable -> the console
//     embeds /inspect/remote (already a self-contained page) with a status
//     chip; unreachable -> instructions + the Start button.
//   • createLiveSession — the chain "boot AVD (if no device) → installDebug →
//     launch → forward", run ONCE per click as a background state machine the
//     page polls via /live/status. Every step's outcome is recorded honestly;
//     a failed step stops the chain with the real error, never a spinner.
//
// Injectable exec/fetch for tests; nothing here fabricates device state.

import path from "node:path";

const HEALTH_TIMEOUT_MS = 900;

/**
 * Fast probe. Never throws — unreachable is a NORMAL state the section renders.
 * One silent retry before declaring unreachable: the debug inspector's minimal
 * HTTP server closes sockets per request, so a pooled keep-alive connection can
 * die between console renders and fail exactly one fetch — a transient that
 * must not flicker the human-facing "connected" chip.
 */
export async function getLiveDeviceStatus({ port = 9500, fetchImpl = fetch } = {}) {
  const url = `http://127.0.0.1:${port}/inspect/health`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
      const res = await fetchImpl(url, { signal: ctrl.signal, headers: { connection: "close" } });
      clearTimeout(timer);
      if (!res.ok) return { reachable: false, reason: `health -> HTTP ${res.status}` };
      const health = await res.json();
      return {
        reachable: true,
        appId: health.appId ?? "unknown",
        buildType: health.buildType ?? "debug",
        processStartedAtMs: health.processStartedAtMs ?? null,
        remoteUrl: `http://127.0.0.1:${port}/inspect/remote`,
      };
    } catch {
      if (attempt === 2) return { reachable: false, reason: "inspector not reachable (app not running, or no adb forward)" };
    }
  }
  return { reachable: false, reason: "unreachable" };
}

/**
 * The start chain as a poll-able state machine. One instance per service;
 * `start()` is idempotent while a chain is running (a second click reports the
 * running chain instead of racing a parallel one).
 */
export function createLiveSession({
  projectDir,
  port = 9500,
  exec,
  gradleEnv,
  log = () => {},
  // Injectable so the health step is testable. Without it the step reached the
  // REAL loopback inspector on the machine-global port — a test would silently
  // assert against whatever app happened to be running, exactly the isolation
  // trap that let a foreign preview daemon get adopted.
  fetchImpl = fetch,
} = {}) {
  const state = {
    running: false,
    startedAt: null,
    finishedAt: null,
    ok: null,
    steps: [], // {name, status: running|ok|fail, detail?, ms}
  };

  /**
   * A step's detail is read by a human watching the chain, so it must never be
   * "[object Object]" — which is exactly what `String(x)` gives for the exec
   * result a step returns when it just hands back its `exec(...)` promise.
   * Strings pass through; an exec result degrades to its stdout; anything else
   * with no useful text reports nothing rather than noise.
   */
  const describeDetail = (value) => {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "object") {
      const out = [value.stdout, value.stderr].filter((s) => typeof s === "string" && s.trim());
      return out.length ? out.join(" ").trim() : "";
    }
    return String(value);
  };

  const step = async (name, fn) => {
    const entry = { name, status: "running", startedAt: Date.now() };
    state.steps.push(entry);
    log(`live-session: ${name}…`);
    try {
      const detail = describeDetail(await fn());
      entry.status = "ok";
      if (detail) entry.detail = detail.slice(0, 300);
    } catch (err) {
      entry.status = "fail";
      entry.detail = String(err && err.message ? err.message : err).slice(0, 500);
      throw err;
    } finally {
      entry.ms = Date.now() - entry.startedAt;
      delete entry.startedAt;
    }
  };

  async function run() {
    // 1. A device, booting one only when none is attached.
    await step("device", async () => {
      const { stdout } = await exec("adb", ["devices"]);
      const attached = stdout.split("\n").slice(1).filter((l) => l.trim().endsWith("device"));
      if (attached.length > 0) return `already attached: ${attached[0].split("\t")[0]}`;
      const { stdout: avds } = await exec("emulator", ["-list-avds"]);
      const avd = avds.split("\n").map((s) => s.trim()).filter(Boolean)[0];
      if (!avd) throw new Error("no device attached and no AVDs exist — create one in Android Studio first");
      // Detached boot; readiness is the next wait, not this spawn.
      exec("emulator", ["-avd", avd, "-no-window", "-no-audio"], { detach: true });
      await exec("adb", ["wait-for-device"], { timeoutMs: 120_000 });
      // sys.boot_completed gate — wait-for-device alone returns during boot animation.
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const { stdout: boot } = await exec("adb", ["shell", "getprop", "sys.boot_completed"]).catch(() => ({ stdout: "" }));
        if (boot.trim() === "1") return `booted ${avd}`;
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error(`AVD ${avd} did not finish booting within 120s`);
    });

    // 2. Install the debug build (the inspector only exists in debug).
    await step("installDebug", async () => {
      const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
      await exec(gradlew, [":composeApp:installDebug", "--console=plain"], {
        cwd: projectDir,
        env: gradleEnv ? gradleEnv() : undefined,
        timeoutMs: 900_000,
      });
    });

    // 3. Launch + forward, then prove the inspector answers.
    await step("launch", async () => {
      const appId = await resolveAppId();
      await exec("adb", ["shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"]);
      return appId;
    });
    await step("forward", async () => {
      await exec("adb", ["forward", `tcp:${port}`, `tcp:${port}`]);
      return `tcp:${port} → tcp:${port}`;
    });
    await step("health", async () => {
      const deadline = Date.now() + 30_000;
      let lastReason = "";
      while (Date.now() < deadline) {
        const status = await getLiveDeviceStatus({ port, fetchImpl });
        if (status.reachable) return `${status.appId} (${status.buildType})`;
        lastReason = status.reason;
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error(`inspector never became healthy: ${lastReason}`);
    });
  }

  async function resolveAppId() {
    // applicationId from the gradle file — debug suffix-free template default;
    // falls back to grepping both .kts and .gradle spellings.
    const fs = await import("node:fs");
    for (const f of ["composeApp/build.gradle.kts", "composeApp/build.gradle"]) {
      const p = path.join(projectDir, f);
      if (!fs.existsSync(p)) continue;
      const m = fs.readFileSync(p, "utf8").match(/applicationId\s*=?\s*"([^"]+)"/);
      if (m) return m[1];
    }
    throw new Error("could not resolve applicationId from composeApp/build.gradle(.kts)");
  }

  return {
    status: () => ({ ...state, steps: state.steps.map((s) => ({ ...s })) }),
    start() {
      if (state.running) return { started: false, reason: "a live-session chain is already running" };
      state.running = true;
      state.ok = null;
      state.steps.length = 0;
      state.startedAt = new Date().toISOString();
      state.finishedAt = null;
      run()
        .then(() => {
          state.ok = true;
        })
        .catch(() => {
          state.ok = false; // the failing step already carries the real error
        })
        .finally(() => {
          state.running = false;
          state.finishedAt = new Date().toISOString();
        });
      return { started: true };
    },
  };
}
