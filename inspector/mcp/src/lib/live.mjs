// live.mjs — Tier 1: fetch the tree / catalog / health from a running app's
// debug-only inspector server (template: 127.0.0.1:9500, loopback-only,
// reached via `adb forward tcp:9500 tcp:9500`).
//
// Pure fetch logic — no MCP imports, no adb here (connect_live shells adb in
// the server layer). Every failure maps to an actionable Error message, never
// a raw fetch/abort stack.

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 9500;

// The app reads the semantics tree on its MAIN thread with a generous internal
// timeout (cold start keeps the main thread busy for seconds) — so the client
// timeout must be even more generous than the server's 5s bridge.
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Validate a TCP port (connect_live input). Throws a clear Error. */
export function validatePort(port) {
  if (port === undefined || port === null) return DEFAULT_PORT;
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`invalid port '${port}' — expected an integer 1..65535.`);
  }
  return n;
}

/** Validate an adb device serial (safe charset only — it is passed to execFile). */
export function validateSerial(serial) {
  if (serial === undefined || serial === null) return null;
  const s = String(serial);
  if (!/^[A-Za-z0-9._:-]+$/.test(s)) {
    throw new Error(`invalid adb serial '${serial}' — allowed characters: A-Z a-z 0-9 . _ : -`);
  }
  return s;
}

async function fetchJson(pathName, { host = DEFAULT_HOST, port = DEFAULT_PORT, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const doFetch = fetchImpl || fetch;
  const url = `http://${host}:${validatePort(port)}${pathName}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await doFetch(url, { signal: controller.signal });
  } catch (err) {
    const cause = err && err.cause && err.cause.code ? ` (${err.cause.code})` : "";
    const reason = err && err.name === "AbortError"
      ? `timed out after ${timeoutMs}ms`
      : `${err && err.message ? err.message : err}${cause}`;
    throw new Error(
      `could not reach the live inspector at ${url} — ${reason}. ` +
        "Is the app running (a DEBUG build of a create-cmp app)? Did you run connect_live " +
        "(or `adb forward tcp:" + validatePort(port) + " tcp:" + validatePort(port) + "`)?"
    );
  } finally {
    clearTimeout(timer);
  }

  let body;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`live inspector at ${url} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const detail = body && body.error ? body.error : `HTTP ${res.status}`;
    if (res.status === 503) {
      throw new Error(`live inspector not ready: ${detail}`);
    }
    throw new Error(`live inspector error at ${url}: ${detail}`);
  }
  return body;
}

/** GET /inspect/health → the health payload. */
export function fetchHealth(opts = {}) {
  return fetchJson("/inspect/health", opts);
}

/** GET /inspect/tree → the full contract document (source "live-android"). */
export function fetchLiveTree(opts = {}) {
  return fetchJson("/inspect/tree", opts);
}

/** GET /inspect/design-system → the declared catalog { colors, dimens }. */
export function fetchLiveCatalog(opts = {}) {
  return fetchJson("/inspect/design-system", opts);
}
