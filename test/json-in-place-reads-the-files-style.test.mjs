// JSON-IN-PLACE READS THE FILE'S STYLE, NOT A NEAR MISS OF IT (KD-240).
//
// `editJsonInPlace` exists to keep an app's own spelling of its JSON (KD-197). Two of its
// reads were slightly wrong:
//  (a) the escape style was read from `/\\u[0-9a-fA-F]{4}/` over the raw text, which also
//      matches a string holding a literal backslash followed by `u` and four hex digits
//      (`"C:\\ucafe"`), so such a file had its inserted non-ASCII escaped;
//  (b) a value rendered on one line was `JSON.stringify(v)`, so the colons inside it had
//      no space after them whatever the file's own key separator was, and its commas none
//      whatever the file's own item separator was.
// In every case the edit's meaning is unchanged: JSON.parse of the result deep-equals the
// value the edit describes.

import assert from "node:assert/strict";
import test from "node:test";

import { editJsonInPlace } from "../src/lib/json-in-place.mjs";

const edited = (raw, edits, expected) => {
  const out = editJsonInPlace(raw, edits);
  assert.notEqual(out, null, "the editor declined an edit it can make");
  assert.deepEqual(JSON.parse(out), expected);
  return out;
};

// KD-240 (a)
test("a literal backslash-u in a string is not read as the file escaping its non-ASCII", () => {
  const raw = '{\n  "path": "C:\\\\ucafe"\n}\n'; // the file holds "C:\\ucafe": an escaped backslash, then `ucafe`
  const out = edited(raw, [{ at: [], add: "name", value: "café" }], { path: "C:\\ucafe", name: "café" });
  assert.match(out, /"name": "café"/, `inserted non-ASCII was escaped in a file that escapes none:\n${out}`);
});

test("a real \\uXXXX escape still makes an insertion escape its non-ASCII, after any run of escaped backslashes", () => {
  for (const [raw, dash] of [
    ['{\n  "dash": "\\u2014"\n}\n', "\u2014"], // a real escape
    ['{\n  "dash": "\\\\\\u2014"\n}\n', "\\\u2014"], // an escaped backslash, then a real escape
  ]) {
    const out = edited(raw, [{ at: [], add: "name", value: "café" }], { dash, name: "café" });
    assert.match(out, /"name": "caf\\u00e9"/, `a file that escapes its non-ASCII got it raw:\n${out}`);
  }
});

// KD-240 (b)
test("in a one-line file, the colons inside an inserted value follow the file's key separator", () => {
  const value = { type: "command", command: "node a:b.mjs", nested: [{ k: 1 }] };
  const out = edited('{"a": 1}', [{ at: [], add: "statusLine", value }], { a: 1, statusLine: value });
  assert.match(
    out,
    /"statusLine": \{"type": "command",\s*"command": "node a:b\.mjs",\s*"nested": \[\{"k": 1\}\]\}/,
    `the inserted value's inner colons ignore the file's ": ":\n${out}`
  );
});

test("in a one-line file with no space after its colons, an inserted value has none either", () => {
  const value = { type: "command", command: "node a: b.mjs" };
  const out = edited('{"a":1}', [{ at: [], add: "statusLine", value }], { a: 1, statusLine: value });
  assert.match(out, /"statusLine":\{"type":"command",\s*"command":"node a: b\.mjs"\}/, out);
});

// KD-240 (b), the comma: the class is every separator inside a value rendered on one line.
test("in a one-line file, the commas inside an inserted value follow the file's item separator", () => {
  const value = { type: "command", command: "node a,b.mjs", nested: [1, 2, { k: 1, j: 2 }] };
  const spaced = edited(
    '{"a": 1, "b": {}}',
    [
      { at: [], add: "statusLine", value },
      { at: ["b"], add: "x", value: 1 },
      { at: ["b"], add: "y", value: 2 },
    ],
    { a: 1, b: { x: 1, y: 2 }, statusLine: value }
  );
  assert.equal(
    spaced,
    '{"a": 1, "b": {"x": 1, "y": 2}, "statusLine": {"type": "command", "command": "node a,b.mjs", "nested": [1, 2, {"k": 1, "j": 2}]}}',
    `an inserted value's inner commas ignore the file's ", ":\n${spaced}`
  );
  const tight = edited('{"a":1,"b":2}', [{ at: [], add: "statusLine", value }], { a: 1, b: 2, statusLine: value });
  assert.equal(tight, '{"a":1,"b":2,"statusLine":{"type":"command","command":"node a,b.mjs","nested":[1,2,{"k":1,"j":2}]}}');
});
