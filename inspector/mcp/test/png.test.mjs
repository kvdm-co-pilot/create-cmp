import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

import { parsePngHeader, readPngMeta } from "../src/lib/png.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const tinyPng = join(here, "..", "fixtures", "tiny-2x2.png");

test("readPngMeta returns path + dimensions + size, never bytes", () => {
  const meta = readPngMeta(tinyPng);
  assert.equal(meta.width, 2);
  assert.equal(meta.height, 2);
  assert.equal(meta.sizeBytes, 79);
  assert.ok(meta.path.endsWith("tiny-2x2.png"));
  // the path-only contract: exactly these keys, no pixel payload
  assert.deepEqual(Object.keys(meta).sort(), ["height", "path", "sizeBytes", "width"]);
});

test("parsePngHeader reads IHDR dimensions from the raw header", () => {
  const buf = readFileSync(tinyPng);
  assert.deepEqual(parsePngHeader(buf), { width: 2, height: 2 });
});

test("non-PNG input fails with a clear error", () => {
  assert.throws(() => parsePngHeader(Buffer.from("definitely not a png, but long enough...")), /missing the 8-byte PNG signature/);
  assert.throws(() => parsePngHeader(Buffer.from("short")), /too small/);
});

test("missing file fails with a clear error, not an fs stack", () => {
  assert.throws(() => readPngMeta("/nonexistent/nope.png"), /PNG file not found/);
});
