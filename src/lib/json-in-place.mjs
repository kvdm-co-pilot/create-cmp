// ADD TO A JSON FILE THE APP OWNS WITHOUT REWRITING IT (KD-197).
//
// `doctor --fix`'s walk-wiring heal used to parse `.claude/settings.json`, add the
// status line and the UserPromptSubmit hook, and write `JSON.stringify(settings, null,
// 2)` back — so an app's own indentation, key order and `\u2014` escapes were rewritten
// as a side effect of gaining a status line. The shipped-hook rewrite beside it
// (src/lib/shipped-hooks.mjs) edits one string token in the raw text instead. This is
// the same discipline for an ADD: every byte outside the insertion stays where it was,
// the inserted text follows the file's own indentation, line ending, key separator and
// escape style, and the result is checked against JSON.parse before anyone writes it.

/**
 * Every value in a JSON text: its key path, kind, [start, end) span, and — for an
 * object or array — the spans of its members. Throws on anything JSON.parse would.
 * @param {string} raw
 * @returns {Array<{path:Array<string|number>, kind:"object"|"array"|"string"|"literal", start:number, end:number,
 *   members?: Array<{key:string|number, start:number, keyEnd:number, valueStart:number, end:number}>}>}
 */
export function jsonValues(raw) {
  const out = [];
  let i = 0;
  const fail = (what) => {
    throw new SyntaxError(`${what} at offset ${i}`);
  };
  const ws = () => {
    while (i < raw.length && (raw[i] === " " || raw[i] === "\t" || raw[i] === "\n" || raw[i] === "\r")) i += 1;
  };
  const str = () => {
    const start = i;
    i += 1;
    while (i < raw.length) {
      if (raw[i] === "\\") {
        i += 2;
        continue;
      }
      if (raw[i] === '"') {
        i += 1;
        return { start, end: i, value: JSON.parse(raw.slice(start, i)) };
      }
      i += 1;
    }
    return fail("unterminated string");
  };
  const LITERAL = /true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const value = (p) => {
    ws();
    const c = raw[i];
    if (c === '"') {
      const s = str();
      out.push({ path: p, kind: "string", start: s.start, end: s.end });
      return;
    }
    if (c === "{" || c === "[") {
      const close = c === "{" ? "}" : "]";
      const node = { path: p, kind: c === "{" ? "object" : "array", start: i, end: -1, members: [] };
      out.push(node);
      i += 1;
      ws();
      if (raw[i] === close) {
        i += 1;
        node.end = i;
        return;
      }
      for (let n = 0; ; n += 1) {
        ws();
        const start = i;
        let key = n;
        let keyEnd = i;
        if (c === "{") {
          if (raw[i] !== '"') fail("expected a key");
          const k = str();
          key = k.value;
          keyEnd = k.end;
          ws();
          if (raw[i] !== ":") fail("expected ':'");
          i += 1;
          ws();
        }
        const valueStart = i;
        value([...p, key]);
        node.members.push({ key, start, keyEnd, valueStart, end: i });
        ws();
        if (raw[i] === ",") {
          i += 1;
          continue;
        }
        if (raw[i] === close) {
          i += 1;
          node.end = i;
          return;
        }
        fail(`expected ',' or '${close}'`);
      }
    }
    const start = i;
    LITERAL.lastIndex = i;
    const m = LITERAL.exec(raw);
    if (!m) fail("unexpected token");
    i += m[0].length;
    out.push({ path: p, kind: "literal", start, end: i });
  };
  value([]);
  ws();
  if (i !== raw.length) fail("trailing content");
  return out;
}

function sameJson(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
}

function at(obj, p) {
  let cur = obj;
  for (const k of p) cur = cur?.[k];
  return cur;
}

/**
 * Apply ADDITIONS to a JSON text in place.
 *
 *   { at: path, add: key, value }  a member added to the object at `path` (key absent)
 *   { at: path, push: [values] }   elements appended to the array at `path`
 *   { at: path, set: value }       the value at `path` replaced (it must exist)
 *
 * @param {string} raw
 * @param {Array<{at:Array<string|number>, add?:string, value?:unknown, push?:unknown[], set?:unknown}>} edits
 * @returns {string|null} the new text — identical to `raw` outside the insertions — or null
 *          when the text is not JSON, a path is ambiguous (a duplicate key) or not the kind
 *          the edit needs, or the result does not parse to what the edits describe. null
 *          means: write nothing, the file is the app's and it could not be accounted for.
 */
export function editJsonInPlace(raw, edits) {
  return tryEditJsonInPlace(raw, edits).content ?? null;
}

/**
 * `JSON.stringify(v)` output with each key's colon spelled `keySep` and each comma between
 * items spelled `itemSep`. In that output the only colons and commas outside strings are
 * those separators, so a scan that skips strings (and the character after each backslash
 * inside them) finds exactly those.
 */
function withSeps(json, keySep, itemSep) {
  if ((keySep === ":" && itemSep === ",") || json === undefined) return json;
  let out = "";
  let inString = false;
  for (let i = 0; i < json.length; i += 1) {
    const c = json[i];
    if (inString) {
      out += c;
      if (c === "\\") out += json[++i];
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else out += c === ":" ? keySep : c === "," ? itemSep : c;
  }
  return out;
}

/** A key path as a reader would name it. */
function where(p) {
  return p.length === 0 ? "the top level" : JSON.stringify(p.join("."));
}

/**
 * `editJsonInPlace`, saying WHY when it declines — a caller that writes nothing on a
 * decline owes its user the reason, and only the editor knows it.
 * @returns {{content:string}|{reason:string}} `reason` completes "the file could not be edited in place: …"
 */
export function tryEditJsonInPlace(raw, edits) {
  let parsed;
  let values;
  try {
    parsed = JSON.parse(raw);
    values = jsonValues(raw);
  } catch (err) {
    return { reason: `it is not JSON (${String(err?.message ?? err).split("\n")[0]})` };
  }
  const byPath = new Map();
  for (const v of values) {
    const k = JSON.stringify(v.path);
    // A duplicate key: which one counts is JSON.parse's call, not ours.
    if (byPath.has(k)) return { reason: `the key ${where(v.path)} appears twice, and which one counts is JSON.parse's call` };
    byPath.set(k, v);
  }

  // The file's own style, read rather than assumed.
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const multiline = raw.includes("\n");
  // A real `\uXXXX` escape only: its backslash is preceded by an even run of backslashes
  // (zero included). `"C:\\ucafe"` is an escaped backslash followed by `ucafe`, and a
  // file holding it escapes nothing (KD-240).
  const escapes = /(?<!\\)(?:\\\\)*\\u[0-9a-fA-F]{4}/.test(raw);
  const lineIndent = (pos) => {
    const from = raw.lastIndexOf("\n", pos - 1) + 1;
    return /^[ \t]*/.exec(raw.slice(from))[0];
  };
  const unitOfFile = (() => {
    const m = /\n([ \t]+)\S/.exec(raw);
    return m ? m[1] : "  ";
  })();
  /** Are this container's members laid out one per line (true), or on the bracket's own line? */
  const laidOut = (node) => {
    const first = node.members?.[0];
    return first ? raw.slice(node.start + 1, first.start).includes("\n") : multiline;
  };
  const unitAt = (node) => {
    const base = lineIndent(node.start);
    const first = node.members?.[0];
    if (first && laidOut(node)) {
      const inner = lineIndent(first.start);
      if (inner.startsWith(base) && inner.length > base.length) return inner.slice(base.length);
    }
    return unitOfFile;
  };
  /** A value as the file would spell it: laid out at `indent` in `unit` steps, or on one line. */
  const text = (v, { indent = "", unit = unitOfFile, compact = false } = {}) => {
    // On one line, the colons and commas inside the value are spelled like the file's own (KD-240).
    let s = multiline && !compact ? JSON.stringify(v, null, unit).split("\n").join(eol + indent) : withSeps(JSON.stringify(v), keySep, itemSep);
    if (escapes) s = s.replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
    return s;
  };
  const keySep = (() => {
    for (const v of values) {
      for (const m of v.members ?? []) if (typeof m.key === "string") return raw.slice(m.keyEnd, m.valueStart);
    }
    return multiline ? ": " : ":";
  })();
  /** The file's own comma between two items on one line, as `keySep` is its colon (KD-240). */
  const itemSep = (() => {
    for (const v of values) {
      const [a, b] = v.members ?? [];
      if (a && b && !raw.slice(a.end, b.start).includes("\n")) return raw.slice(a.end, b.start);
    }
    return multiline ? ", " : ",";
  })();

  // Group the insertions by the container they go into, so two members added to one
  // object land in one place, in the order given.
  const splices = [];
  const expected = structuredClone(parsed);
  const additions = new Map(); // container path key -> { node, items: [{key?, value}] }
  for (const e of edits) {
    const node = byPath.get(JSON.stringify(e.at));
    if (!node) return { reason: `${where(e.at)} is not in the file` };
    if ("set" in e) {
      if (e.at.length === 0) return { reason: "the whole file cannot be replaced in place" };
      const parent = byPath.get(JSON.stringify(e.at.slice(0, -1)));
      splices.push({
        start: node.start,
        end: node.end,
        text: text(e.set, { indent: lineIndent(node.start), unit: unitAt(parent), compact: !laidOut(parent) }),
      });
      at(expected, e.at.slice(0, -1))[e.at[e.at.length - 1]] = structuredClone(e.set);
      continue;
    }
    const isAdd = "add" in e;
    if (node.kind !== (isAdd ? "object" : "array")) return { reason: `${where(e.at)} is not an ${isAdd ? "object" : "array"}` };
    const target = at(expected, e.at);
    const slot = additions.get(JSON.stringify(e.at)) ?? { node, items: [] };
    if (isAdd) {
      if (Object.hasOwn(target, e.add)) return { reason: `${where([...e.at, e.add])} is already there` };
      target[e.add] = structuredClone(e.value);
      slot.items.push({ key: e.add, value: e.value });
    } else {
      for (const v of e.push) {
        target.push(structuredClone(v));
        slot.items.push({ value: v });
      }
    }
    additions.set(JSON.stringify(e.at), slot);
  }

  for (const { node, items } of additions.values()) {
    const unit = unitAt(node);
    const entry = (item, indent, compact = false) =>
      (item.key === undefined ? "" : `${JSON.stringify(item.key)}${keySep}`) + text(item.value, { indent, unit, compact });
    const open = raw[node.start];
    const close = raw[node.end - 1];
    if (node.members.length === 0) {
      // `{}` / `[]`: the two brackets are the only bytes there are to keep.
      const base = lineIndent(node.start);
      const inner = base + unit;
      const body = multiline
        ? items.map((it) => eol + inner + entry(it, inner)).join(",") + eol + base
        : items.map((it) => entry(it, "", true)).join(itemSep);
      splices.push({ start: node.start, end: node.end, text: open + body + close });
      continue;
    }
    const first = node.members[0];
    const last = node.members[node.members.length - 1];
    let insert;
    if (laidOut(node)) {
      const indent = lineIndent(first.start);
      insert = items.map((it) => `,${eol}${indent}${entry(it, indent)}`).join("");
    } else {
      // Members on the bracket's own line: keep them there, in the file's own separator.
      const between = node.members.length > 1 ? raw.slice(node.members[0].end, node.members[1].start) : multiline ? ", " : ",";
      if (between.includes("\n")) {
        // Only the FIRST member shares the bracket's line (`{ "a": 1,\n  "b": 2\n}`): the
        // rest are one per line, so an added member continues their layout.
        const indent = lineIndent(last.start);
        insert = items.map((it) => `,${eol}${indent}${entry(it, indent)}`).join("");
      } else insert = items.map((it) => `${between}${entry(it, "", true)}`).join("");
    }
    splices.push({ start: last.end, end: last.end, text: insert });
  }

  splices.sort((a, b) => a.start - b.start);
  for (let k = 1; k < splices.length; k += 1) {
    if (splices[k].start < splices[k - 1].end) return { reason: "two of the edits overlap" };
  }
  let content = "";
  let cursor = 0;
  for (const s of splices) {
    content += raw.slice(cursor, s.start) + s.text;
    cursor = s.end;
  }
  content += raw.slice(cursor);

  let reparsed;
  try {
    reparsed = JSON.parse(content);
  } catch {
    return { reason: "the edited text would not parse" };
  }
  return sameJson(reparsed, expected)
    ? { content }
    : { reason: "the edited text would not parse to what the edit describes" };
}

/**
 * The value `edits` (the shapes `editJsonInPlace` takes) describe, applied to a parsed
 * value rather than to text — what a caller writes whole when the text could not be
 * edited in place. The input is not modified.
 */
export function applyJsonEdits(value, edits) {
  const out = structuredClone(value);
  for (const e of edits) {
    if ("set" in e) at(out, e.at.slice(0, -1))[e.at[e.at.length - 1]] = structuredClone(e.set);
    else if ("add" in e) at(out, e.at)[e.add] = structuredClone(e.value);
    else at(out, e.at).push(...structuredClone(e.push));
  }
  return out;
}
