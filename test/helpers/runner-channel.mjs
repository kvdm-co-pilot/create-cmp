// THE RUNNER'S STDOUT IS A PROTOCOL, NOT A CONSOLE — and ordinary text on it
// makes the parent runner abort the file.
//
// `node --test` runs every test file in a child process and reads that child's
// STDOUT as its message channel. Each reporter message is framed
// `[0xFF 0x0F][4-byte big-endian length][serialized payload]`, and anything
// between frames is surfaced as a `test:stdout` event. So a test that prints —
// directly, or by calling a CLI function that prints — is writing into the same
// channel as the protocol, which is legal only as long as the parent's parser
// finds its way back to the next frame.
//
// It does not always. Node 24.18.0's `FileTest.#processRawBuffer`
// (node:internal/test_runner/runner:469) consumes a frame and then reads the
// NEXT four bytes as a length WITHOUT re-scanning for the frame header, so when
// text follows a frame inside one `data` chunk, the text's own bytes are read as
// a length. Byte 2 of that text decides what happens:
//
//   third byte 0x20..0x7F (plain ASCII)  length ≥ 0x20000000 → "wait for more" → recovers
//   third byte ≥ 0x80 (a UTF-8 lead or   `bufferHead[2] << 24` is NEGATIVE in JS, the
//   continuation byte — `›`, `✓`, `→`,   `rawBufferSize < fullMessageSize` guard is
//   `—`, `·`, `✗`, `…`)                  vacuously false, and the deserializer is handed
//                                        bytes that are not a frame:
//
//     Error: Unable to deserialize cloned data due to invalid or unsupported version.
//         at #processRawBuffer (node:internal/test_runner/runner:469:20)
//         at FileTest.parseMessage (node:internal/test_runner/runner:376:29)
//
// That error is thrown in the PARENT, inside the child's `stdout` data handler,
// and the runner attributes it to the file whose stream it was parsing — so the
// file is reported as FAILING for a reason that is not in it. It is load-shaped
// because the coalescing is: an idle parent reads each write on its own, while a
// parent competing for a core reads one chunk holding a frame AND the text that
// followed it. Measured here on 2026-09-22, `test/scaffold.test.mjs` unchanged:
// 15/15 runs green idle, 2 of 30 runs red under 16 CPU burners, both with that
// error. It aborted an `npm publish` at `prepublishOnly` on 2026-09-19.
//
// This helper is the narrow fix: run `fn` with the CLI text taken off the
// channel, while the reporter's frames still go through untouched. Passing the
// frames is the whole difficulty — a helper that simply replaces
// `process.stdout.write` with a no-op (the `quiet()` pattern already in this
// suite) also swallows any reporter frame that is flushed during its window,
// which loses test events rather than text.
import v8 from "node:v8";

// The two bytes the runner itself scans for, taken from the serializer rather
// than spelled — the same way `runner.js` derives them.
const probe = new v8.Serializer();
probe.writeHeader();
const V8_HEADER = probe.releaseBuffer();

/** Is this chunk a reporter frame (and therefore the protocol, not output)? */
function isRunnerFrame(chunk) {
  return (
    (Buffer.isBuffer(chunk) || ArrayBuffer.isView(chunk)) &&
    chunk.length >= V8_HEADER.length &&
    chunk[0] === V8_HEADER[0] &&
    chunk[1] === V8_HEADER[1]
  );
}

/**
 * Await `fn` with everything it prints to stdout kept OFF the runner's channel.
 * Reporter frames are passed straight through; text is collected and, if the
 * caller asks for it, handed back.
 *
 * @template T
 * @param {() => T | Promise<T>} fn
 * @param {{ onText?: (text: string) => void }} [opts]
 * @returns {Promise<T>} whatever `fn` returned
 */
export async function offTheRunnerChannel(fn, { onText } = {}) {
  const real = process.stdout.write.bind(process.stdout);
  const text = [];
  process.stdout.write = function patched(chunk, encoding, cb) {
    if (isRunnerFrame(chunk)) return real(chunk, encoding, cb);
    text.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    const done = typeof encoding === "function" ? encoding : cb;
    if (typeof done === "function") process.nextTick(done);
    return true;
  };
  try {
    return await fn();
  } finally {
    process.stdout.write = real;
    if (onText) onText(text.join(""));
  }
}
