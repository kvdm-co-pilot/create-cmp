// png.mjs — PNG header metadata WITHOUT decoding or exposing pixels.
//
// The founder's architecture rule: pixels flow to the HUMAN, structure flows to
// the AI. Tools therefore return a PNG's path + metadata (parsed from the first
// 24 header bytes) and NEVER its bytes/base64. Pure logic + one thin fs reader.

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const PNG_SIGNATURE = "89504e470d0a1a0a";

/**
 * Parse a PNG's dimensions from its header (8-byte signature + IHDR chunk).
 * Throws a clear error if the buffer is not a PNG.
 *
 * @param {Buffer} buf  at least the first 24 bytes of the file.
 * @returns {{width:number, height:number}}
 */
export function parsePngHeader(buf) {
  if (!buf || buf.length < 24) {
    throw new Error(`not a PNG: file is too small (${buf ? buf.length : 0} bytes, need >= 24).`);
  }
  if (buf.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
    throw new Error("not a PNG: missing the 8-byte PNG signature.");
  }
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error("not a valid PNG: first chunk is not IHDR.");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Read a PNG file's metadata — path, dimensions, size. Never returns pixel data.
 *
 * @param {string} path
 * @returns {{path:string, width:number, height:number, sizeBytes:number}}
 */
export function readPngMeta(path) {
  const abs = resolve(path);
  let buf;
  try {
    buf = readFileSync(abs);
  } catch (err) {
    if (err.code === "ENOENT") throw new Error(`PNG file not found: ${abs}`);
    throw new Error(`could not read PNG file '${abs}': ${err.message}`);
  }
  const { width, height } = parsePngHeader(buf);
  return { path: abs, width, height, sizeBytes: statSync(abs).size };
}
