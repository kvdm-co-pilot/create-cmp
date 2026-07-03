// source.mjs — resolve WHICH tree (and catalog) a tool call operates on.
//
// Every tool accepts an optional discriminated-union `source`:
//   { kind:"file",        path }                      — a tree JSON on disk (tier 0)
//   { kind:"live",        host?, port? }              — the running app's debug server (tier 1)
//   { kind:"uiautomator", xml? | xmlPath? }           — Appium page-source XML (tier 2)
//
// Resolution order (first match wins):
//   explicit `source` → legacy `treePath` (kept for Phase 0 callers, = file)
//   → session default (set by connect_live) → env CMP_INSPECTOR_LIVE ("host:port"
//   or "port") → env CMP_INSPECTOR_TREE (file path) → a clear instruction.
//
// Pure logic; live fetches go through an injectable fetchImpl for unit tests.

import { readFileSync } from "node:fs";
import { loadTree } from "./tree.mjs";
import { convertUiautomatorXml } from "./uiautomator.mjs";
import { fetchLiveTree, fetchLiveCatalog, DEFAULT_HOST, DEFAULT_PORT } from "./live.mjs";

/**
 * Normalize the caller's inputs into a concrete source descriptor.
 * @param {object} params
 * @param {object} [params.source]        discriminated union (see above)
 * @param {string} [params.treePath]      legacy file path (Phase 0 compatible)
 * @param {object|null} [params.sessionDefault] source set by connect_live
 * @param {object} [params.env]           defaults to process.env
 * @returns {object} a {kind,...} descriptor
 */
export function resolveSourceDescriptor({ source, treePath, sessionDefault = null, env = process.env } = {}) {
  if (source && typeof source === "object") {
    if (!["file", "live", "uiautomator"].includes(source.kind)) {
      throw new Error(
        `unknown source kind '${source.kind}' — expected "file", "live" or "uiautomator".`
      );
    }
    return source;
  }
  if (treePath) return { kind: "file", path: treePath };
  if (sessionDefault && typeof sessionDefault === "object") return sessionDefault;
  if (env.CMP_INSPECTOR_LIVE) {
    const raw = String(env.CMP_INSPECTOR_LIVE);
    const [a, b] = raw.includes(":") ? raw.split(":") : [DEFAULT_HOST, raw];
    return { kind: "live", host: a || DEFAULT_HOST, port: Number(b) || DEFAULT_PORT };
  }
  if (env.CMP_INSPECTOR_TREE) return { kind: "file", path: env.CMP_INSPECTOR_TREE };
  throw new Error(
    "No tree source available. Pass `source` ({kind:\"file\"|\"live\"|\"uiautomator\"}) or `treePath`, " +
      "run connect_live for a session default, or set CMP_INSPECTOR_LIVE / CMP_INSPECTOR_TREE. " +
      "For tier 0, render a screen with the inspector harness first."
  );
}

/**
 * Resolve the actual TREE for a tool call.
 * @returns {Promise<object>} the parsed tree ({schemaVersion, source, root})
 */
export async function resolveTree(params = {}) {
  const desc = resolveSourceDescriptor(params);
  const { fetchImpl } = params;

  switch (desc.kind) {
    case "file":
      if (!desc.path) throw new Error('source {kind:"file"} requires `path`.');
      return loadTree(desc.path);
    case "live":
      return loadTree(await fetchLiveTree({ host: desc.host, port: desc.port, fetchImpl }));
    case "uiautomator": {
      let xml = desc.xml;
      if (!xml && desc.xmlPath) {
        try {
          xml = readFileSync(desc.xmlPath, "utf8");
        } catch (err) {
          if (err.code === "ENOENT") throw new Error(`uiautomator XML file not found: ${desc.xmlPath}`);
          throw new Error(`could not read uiautomator XML '${desc.xmlPath}': ${err.message}`);
        }
      }
      if (!xml) throw new Error('source {kind:"uiautomator"} requires `xml` (the page-source string) or `xmlPath`.');
      return convertUiautomatorXml(xml);
    }
    default:
      throw new Error(`unknown source kind '${desc.kind}'.`);
  }
}

/**
 * Resolve the design-system CATALOG for diff_against_design_system:
 * explicit catalogPath wins; a live source falls back to GET /inspect/design-system.
 * @returns {Promise<object>} { colors, dimens }
 */
export async function resolveCatalog(params = {}) {
  const { catalogPath, fetchImpl } = params;
  if (catalogPath) {
    let raw;
    try {
      raw = readFileSync(catalogPath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") throw new Error(`catalog file not found: ${catalogPath}`);
      throw new Error(`could not read catalog file '${catalogPath}': ${err.message}`);
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`catalog file '${catalogPath}' is not valid JSON: ${err.message}`);
    }
  }
  const desc = resolveSourceDescriptor(params);
  if (desc.kind === "live") {
    return fetchLiveCatalog({ host: desc.host, port: desc.port, fetchImpl });
  }
  throw new Error(
    "diff_against_design_system: `catalogPath` is required for non-live sources " +
      "(with a live source the catalog is fetched from /inspect/design-system automatically)."
  );
}

/**
 * Guard for token/drift tools: uiautomator trees carry no design tokens, so
 * asserting/diffing tokens on them is meaningless — fail loudly and clearly.
 */
export function requireInstrumentedTree(tree, toolName) {
  if (tree && tree.source === "uiautomator") {
    throw new Error(
      `${toolName} requires an instrumented source (tier 0 headless render or tier 1 live app): ` +
        "the uiautomator tree carries no design tokens (custom semantics keys do not cross the " +
        "accessibility bridge). Use source {kind:\"live\"} against a create-cmp debug build instead."
    );
  }
  return tree;
}
