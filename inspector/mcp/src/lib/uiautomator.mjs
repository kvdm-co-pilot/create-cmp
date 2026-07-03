// uiautomator.mjs — Tier 2 fallback: convert an Appium/uiautomator2
// `getPageSource` XML hierarchy into the inspector tree contract
// (schemaVersion 1, source "uiautomator").
//
// Honest about what this tier is: geometry + text + interaction state for ANY
// app, zero instrumentation — but NO design tokens ever (custom semantics keys
// do not cross the accessibility bridge), only a11y-pruned merged nodes, and
// physical screen coordinates (normalized root-relative here). Token/drift
// tools reject uiautomator trees with a clear error.
//
// Mapping:
//   bounds="[x1,y1][x2,y2]" → {x,y,width,height}, root-origin-normalized
//   resource-id             → testTag (tail after '/', meaningful when the app
//                             sets testTagsAsResourceId)
//   text                    → text        ("" → null)
//   content-desc            → contentDescription ("" → null)
//   class                   → role        (tail after the last '.')
//   clickable/enabled       → clickable / disabled
//   designToken             → always null
//
// Zero dependencies: uiautomator XML is machine-generated (well-formed, all
// attributes double-quoted), so a small stack-based tag tokenizer is enough.

/**
 * Convert uiautomator page-source XML to the tree contract.
 * @param {string} xml the raw XML string (Appium getPageSource output)
 * @returns {object} { schemaVersion, source: "uiautomator", root }
 */
export function convertUiautomatorXml(xml) {
  if (typeof xml !== "string" || xml.trim() === "") {
    throw new Error("uiautomator: empty XML input.");
  }
  const rootEl = parseXml(xml);
  // Appium wraps everything in <hierarchy>; the real UI root is its first child.
  const uiRoot =
    rootEl.name === "hierarchy" && rootEl.children.length > 0 ? rootEl.children[0] : rootEl;

  const rootBounds = parseBounds(uiRoot.attrs.bounds ?? "[0,0][0,0]");
  const root = toNode(uiRoot, rootBounds.x, rootBounds.y);
  return { schemaVersion: 1, source: "uiautomator", root };
}

function toNode(el, originX, originY) {
  const b = parseBounds(el.attrs.bounds ?? "[0,0][0,0]");
  return {
    testTag: resourceIdTail(el.attrs["resource-id"]),
    text: emptyToNull(el.attrs.text),
    contentDescription: emptyToNull(el.attrs["content-desc"]),
    role: classTail(el.attrs.class),
    clickable: el.attrs.clickable === "true",
    disabled: el.attrs.enabled === "false",
    bounds: {
      x: b.x - originX,
      y: b.y - originY,
      width: b.width,
      height: b.height,
    },
    designToken: null,
    children: el.children.map((c) => toNode(c, originX, originY)),
  };
}

/** `[x1,y1][x2,y2]` → {x, y, width, height}. Throws on malformed input. */
export function parseBounds(str) {
  const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(String(str).trim());
  if (!m) {
    throw new Error(`uiautomator: malformed bounds attribute '${str}' (expected "[x1,y1][x2,y2]").`);
  }
  const [x1, y1, x2, y2] = m.slice(1).map(Number);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function resourceIdTail(id) {
  if (!id) return null;
  const tail = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  return tail === "" ? null : tail;
}

function classTail(cls) {
  if (!cls) return null;
  const tail = cls.includes(".") ? cls.slice(cls.lastIndexOf(".") + 1) : cls;
  return tail === "" ? null : tail;
}

function emptyToNull(v) {
  return v === undefined || v === null || v === "" ? null : v;
}

// ---------------------------------------------------------------------------
// Minimal XML parser for machine-generated uiautomator dumps.
// Handles: prolog, self-closing and paired elements, double-quoted attributes,
// XML entities. Does NOT handle CDATA/comments/single-quoted attrs — the
// uiautomator serializer emits none of those.
// ---------------------------------------------------------------------------

function parseXml(xml) {
  const tagRe = /<\?[^>]*\?>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g;
  const stack = [];
  let root = null;
  let m;
  while ((m = tagRe.exec(xml)) !== null) {
    if (m[0].startsWith("<?")) continue; // prolog
    if (m[1] !== undefined) {
      // closing tag
      const closed = stack.pop();
      if (!closed || closed.name !== m[1]) {
        throw new Error(`uiautomator: malformed XML — unexpected </${m[1]}>.`);
      }
      continue;
    }
    const el = { name: m[2], attrs: parseAttrs(m[3] || ""), children: [] };
    if (stack.length > 0) stack[stack.length - 1].children.push(el);
    else if (root === null) root = el;
    else throw new Error("uiautomator: malformed XML — multiple root elements.");
    if (m[4] !== "/") stack.push(el); // paired tag: descend
  }
  if (root === null) throw new Error("uiautomator: no XML element found in input.");
  if (stack.length > 0) {
    throw new Error(`uiautomator: malformed XML — unclosed <${stack[stack.length - 1].name}>.`);
  }
  return root;
}

function parseAttrs(str) {
  const attrs = {};
  const re = /([\w:.-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    attrs[m[1]] = decodeEntities(m[2]);
  }
  return attrs;
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}
