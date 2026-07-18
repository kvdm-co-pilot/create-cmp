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

async function fetchRaw(pathName, init, { host = DEFAULT_HOST, port = DEFAULT_PORT, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const doFetch = fetchImpl || fetch;
  const url = `http://${host}:${validatePort(port)}${pathName}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return { url, res: await doFetch(url, { ...init, signal: controller.signal }) };
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
}

async function fetchJson(pathName, opts = {}, init = undefined, { notFoundIsNull = false } = {}) {
  const { url, res } = await fetchRaw(pathName, init, opts);

  // Graceful absence: an older app build simply doesn't have this route yet — a 404 here
  // means "not available", not "error", so callers that opt in get null instead of a throw.
  if (notFoundIsNull && res.status === 404) return null;

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

/**
 * GET /inspect/nav → { currentRoute, backStack } or `null` when the running app predates the
 * route (a 404 there means "not available", not "error" — graceful absence, per the eyes-
 * hardening contract). Any OTHER failure (unreachable, 503, malformed body) still throws.
 */
export function fetchLiveNav(opts = {}) {
  return fetchJson("/inspect/nav", opts, undefined, { notFoundIsNull: true });
}

/** GET /inspect/crashes → { crashes: [...] } — persisted crash JSON, current boot + previous. */
export function fetchLiveCrashes(opts = {}) {
  return fetchJson("/inspect/crashes", opts);
}

/** GET /inspect/db → schema { tables:[{name,sql}] }. */
export function fetchLiveDbSchema(opts = {}) {
  return fetchJson("/inspect/db", opts);
}

/**
 * GET /inspect/db?table=<name>&limit=<n> → { table, columns, rows, rowCount }.
 * `table` is required (this is the caller's identifier to read, not free-form SQL — the
 * device validates it strictly against `sqlite_master` regardless of what's passed here).
 */
export function fetchLiveDbQuery({ table, limit, ...opts } = {}) {
  if (!table || typeof table !== "string") {
    throw new Error("fetchLiveDbQuery requires a string `table` (see fetchLiveDbSchema for valid names).");
  }
  const qs = new URLSearchParams({ table });
  if (limit != null) qs.set("limit", String(limit));
  return fetchJson(`/inspect/db?${qs.toString()}`, opts);
}

/**
 * GET /inspect/screenshot → the raw PNG bytes as a Buffer.
 *
 * TRANSPORT ONLY — callers must write the bytes to a FILE and hand back the path
 * (pixels flow to the HUMAN, never into model context). Non-200 responses carry a
 * JSON {error} body, which is surfaced as a clean Error.
 */
export async function fetchLiveScreenshot(opts = {}) {
  const { url, res } = await fetchRaw("/inspect/screenshot", undefined, opts);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = JSON.parse(await res.text());
      if (body && body.error) detail = body.error;
    } catch {
      /* keep the status-code detail */
    }
    if (res.status === 503) throw new Error(`live inspector not ready: ${detail}`);
    throw new Error(`live inspector error at ${url}: ${detail}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * POST /inspect/tap with {"x":<px>,"y":<px>} (root-relative px, the same space the
 * tree's bounds report) → {"tapped":true,"x":…,"y":…}. HTTP, not adb — one less
 * host dependency for driving the app.
 */
export function postTap({ x, y, ...opts } = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`postTap requires numeric x and y (got x=${x}, y=${y}).`);
  }
  return fetchJson("/inspect/tap", opts, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y }),
  });
}
