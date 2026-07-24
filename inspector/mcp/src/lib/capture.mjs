// capture.mjs — C6's atomic verb: pixels + tree + hash from the SAME frame.
//
// The stale-frame fix (PixelCopy + the sha256 tripwire) made single captures
// honest; this makes the PAIR honest. A walkthrough card that shows pixels next
// to a tree is a lie unless both describe the same moment — and "I called the
// two endpoints quickly" is trust, not proof. The proof here is a sandwich:
//
//   pixels A  →  tree  →  pixels B      accept only when sha(A) == sha(B)
//
// If the two pixel captures hash identically, the window did not produce a new
// frame while the tree was read — the tree belongs to those pixels. If they
// differ (an animation, a recomposition), the whole attempt is discarded and
// retried after a settle; after `maxAttempts` the failure is surfaced honestly
// (both hashes included) rather than returning a plausible-but-unprovable pair.
//
// Staleness is refused at the same layer: a capture whose hash equals
// `previousSha256` is (by default) an error naming the tripwire — byte-identical
// consecutive "screenshots" of supposedly different moments was exactly the P1
// this session opened with. `allowSame: true` opts out for screens that are
// legitimately static.
//
// Pure logic + injectable transports (fetchImpl/sleep), like navigate.mjs.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { fetchLiveScreenshot, fetchLiveTree, fetchLiveNav } from "./live.mjs";
import { readPngMeta } from "./png.mjs";

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Capture pixels + tree + route as one provably-coherent observation.
 *
 * @returns {{
 *   png: string, width: number, height: number, sha256: string,
 *   tree: object, route: (string|null), attempts: number, sameAsPrevious: boolean
 * }}
 * @throws when the frame never stabilises within `maxAttempts`, or when the
 *   capture equals `previousSha256` and `allowSame` is false.
 */
export async function captureScreen({
  host,
  port,
  out,
  previousSha256 = null,
  allowSame = false,
  maxAttempts = 3,
  settleMs = 300,
  fetchImpl,
  sleep = defaultSleep,
  timeoutMs,
} = {}) {
  const opts = { host, port, fetchImpl, timeoutMs };
  let lastPair = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const bytesA = await fetchLiveScreenshot(opts);
    const tree = await fetchLiveTree(opts);
    const bytesB = await fetchLiveScreenshot(opts);
    const hashA = sha256(bytesA);
    const hashB = sha256(bytesB);

    if (hashA !== hashB) {
      // The UI produced a new frame mid-observation — the tree is not provably
      // A's tree. Discard, settle, retry.
      lastPair = { hashA, hashB };
      if (attempt < maxAttempts) await sleep(settleMs);
      continue;
    }

    const sameAsPrevious = previousSha256 != null && hashA === previousSha256;
    if (sameAsPrevious && !allowSame) {
      throw new Error(
        `capture_screen: frame is byte-identical to the previous capture (sha256 ${hashA.slice(0, 12)}…) — ` +
          "the screen has not changed since last time. If this screen is expected to be static, " +
          "pass allowSame: true; otherwise navigate/settle first (this refusal is the stale-frame tripwire)."
      );
    }

    const target = resolve(out || join(tmpdir(), "cmp-inspector", `capture-${Date.now()}.png`));
    const dir = dirname(target);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
    writeFileSync(target, bytesA);

    // Route label is best-effort context, never part of the coherence proof.
    let route = null;
    try {
      route = (await fetchLiveNav(opts))?.currentRoute ?? null;
    } catch {
      /* nav endpoint absent on older apps — the capture stands without it */
    }

    return { ...readPngMeta(target), sha256: hashA, tree, route, attempts: attempt, sameAsPrevious };
  }

  throw new Error(
    `capture_screen: frame never stabilised across ${maxAttempts} attempts — the two pixel reads kept ` +
      `differing (last pair ${lastPair.hashA.slice(0, 12)}… vs ${lastPair.hashB.slice(0, 12)}…). ` +
      "The UI is animating; wait for it to settle (longer settleMs) or capture a quieter moment."
  );
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
