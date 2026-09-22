// WHAT A TEST PRINTS GOES DOWN THE SAME PIPE AS THE RUNNER'S PROTOCOL.
//
// `node --test` spawns each file and parses that child's STDOUT as a framed
// message channel — `[0xFF 0x0F][4-byte BE length][payload]` per reporter event,
// with anything between frames surfaced as `test:stdout`. Node 24.18.0's parser
// reads the four bytes after a frame as the next length WITHOUT re-scanning for
// the header (`#processRawBuffer`, node:internal/test_runner/runner:469), so a
// line of ordinary text that follows a frame in ONE chunk is read as a length —
// and when its third byte is >= 0x80 (every `›`, `✓`, `→`, `—`, `·`, `✗`),
// `bufferHead[2] << 24` is negative, the "do I have the whole message yet"
// guard is vacuously false, and the runner aborts the file with
// `Unable to deserialize cloned data due to invalid or unsupported version`.
// The file is reported FAILING for something that is not in it. It is
// load-shaped because the coalescing is.
//
// test/helpers/runner-channel.mjs takes that text off the channel, and this file
// guards the two properties that make it safe to use, because getting either
// wrong is silent:
//
//   1. TEXT MUST NOT REACH THE CHANNEL. Otherwise the helper is decoration.
//   2. FRAMES MUST STILL REACH IT. The obvious implementation — replace
//      `process.stdout.write` with `() => true`, the `quiet()` pattern already
//      in this suite — also swallows any reporter frame flushed inside the
//      window, which loses test EVENTS. That failure is invisible: the file
//      still exits 0, and the run simply reports fewer tests than it ran.
//
// The third case is the classification rule itself: what counts as a frame is
// taken from v8's own serializer header, never spelled as two literal bytes, so
// it cannot drift from what the runner scans for.
import { test } from "node:test";
import assert from "node:assert/strict";
import v8 from "node:v8";

import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

/** A reporter frame, built the way node's own v8-serializer reporter builds one. */
function frameOf(item) {
  const s = new v8.Serializer();
  s.writeHeader();
  const headerLength = s.releaseBuffer().length;
  s.writeHeader();
  s.writeRawBytes(Buffer.allocUnsafe(4));
  s.writeHeader();
  s.writeValue(item);
  const m = s.releaseBuffer();
  const len = m.length - (4 + headerLength);
  m.set([(len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff], headerLength);
  return m;
}

/**
 * Stand in for the runner's channel and record what reaches it. Only what THIS
 * test wrote is inspected: a real reporter frame may land here too while the
 * stub is installed, and asserting on the exact list would make this file fail
 * under load for the same reason the parser does.
 */
async function throughTheChannel(fn) {
  const reached = [];
  const real = process.stdout.write;
  process.stdout.write = function stub(chunk) {
    reached.push(Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(String(chunk)));
    return true;
  };
  try {
    return { value: await fn(), reached };
  } finally {
    process.stdout.write = real;
  }
}

const carries = (reached, bytes) => reached.some((c) => c.equals(bytes));

test("a CLI's narration inside the wrapper never reaches the runner's channel — and the call's own value comes back", async () => {
  const line = Buffer.from("› Validating config…\n"); // third byte 0xBA: the shape that aborts the file
  const { value, reached } = await throughTheChannel(() =>
    offTheRunnerChannel(() => {
      process.stdout.write(line.toString());
      process.stdout.write("  ✓ done\n");
      return { verdict: "green" };
    }),
  );
  assert.deepEqual(value, { verdict: "green" }, "the wrapper returns what the wrapped call returned");
  assert.equal(carries(reached, line), false, "the narration must not be on the channel the runner parses");
  assert.equal(
    reached.some((c) => c.includes("✓ done")),
    false,
    "and neither must the rest of it",
  );
});

test("a reporter frame written inside the window still reaches the channel — a helper that swallows one loses a test EVENT", async () => {
  const frame = frameOf({ type: "test:diagnostic", data: { nesting: 0, message: "a frame from inside the window", file: import.meta.url } });
  const { reached } = await throughTheChannel(() =>
    offTheRunnerChannel(() => {
      process.stdout.write("› text first\n");
      process.stdout.write(frame);
    }),
  );
  assert.ok(
    carries(reached, frame),
    "the reporter's frame must pass through byte-for-byte: a no-op write swallows it and the run reports fewer tests than it ran",
  );
});

test("what counts as a frame is v8's own header, so it cannot drift from what the runner scans for", async () => {
  const probe = new v8.Serializer();
  probe.writeHeader();
  const header = probe.releaseBuffer();
  // A buffer that merely STARTS with the header is treated as protocol; the same
  // bytes as text are not. This is exactly the test node's runner makes
  // (`bufferHead.indexOf(v8Header)`), and it is why UTF-8 text can never be
  // mistaken for a frame: 0xFF is not a legal UTF-8 byte.
  const looksLikeAFrame = Buffer.concat([header, Buffer.from([0, 0, 0, 1, 0x42])]);
  const plainText = Buffer.from(header.toString("latin1")); // same glyphs, encoded as text
  const { reached } = await throughTheChannel(() =>
    offTheRunnerChannel(() => {
      process.stdout.write(looksLikeAFrame);
      process.stdout.write(plainText);
    }),
  );
  assert.ok(carries(reached, looksLikeAFrame), "a chunk beginning with the serializer header is protocol and passes");
  assert.equal(carries(reached, plainText), false, "the same characters as TEXT are output, and are held back");
});

test("the channel is restored even when the wrapped call throws", async () => {
  const before = process.stdout.write;
  await assert.rejects(
    () => offTheRunnerChannel(() => { throw new Error("the stamp refused"); }),
    /the stamp refused/,
  );
  assert.equal(process.stdout.write, before, "a wrapper that leaks its patch would silence every later write in the file");
});
