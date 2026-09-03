// A `// SPEC:` citation must sit on a test (payment-blueprint F8).
//
// scanCitations counted the tag wherever it appeared under the scan roots: in a
// block comment, on a class declaration, in a helper with no test in it. That
// makes a red specCoverage curable by adding one comment line and zero
// assertions — the single escape the gate exists to close. It also weakened the
// [tier: device] gate, since a device-tier citation could be a bare comment in
// an androidInstrumentedTest file containing no test at all.
//
// The drift is real, not theoretical: payment-blueprint found a citation that
// had slid onto a class declaration, where it vouched for a whole file while
// testing nothing. That case is the planted failure below.
//
// MIGRATION for an existing app: citations already attached to a test keep
// counting unchanged. Any that are NOT — on a class, in a comment block, in a
// helper — stop counting, so specCoverage may go red naming clauses that are
// suddenly uncited. Each is a real gap the old rule was hiding: move the tag
// onto the test that covers the clause, or mark the clause draft until one
// exists. Maestro/YAML flows are unaffected — a flow file is its own test.

import { test } from "node:test";
import assert from "node:assert/strict";

import { citationIsBound, BINDING_WINDOW } from "../packages/harness/src/lib/spec-coverage.mjs";

const at = (src) => {
  const lines = src.split("\n");
  return { lines, index: lines.findIndex((l) => l.includes("SPEC:")) };
};

test("a citation directly above @Test is bound", () => {
  const { lines, index } = at(`
    // SPEC: HM-01
    @Test
    fun \`the home screen lists today's items\`() {}
  `);
  assert.equal(citationIsBound(lines, index), true);
});

test("a citation above an annotation stack still reaches its test", () => {
  const { lines, index } = at(`
    // SPEC: HM-02
    @Test
    @DisplayName("the home screen lists today's items")
    @Tag("slow")
    fun \`listing\`() {}
  `);
  assert.equal(citationIsBound(lines, index), true);
});

test("THE REAL DRIFT: a citation on a class declaration is NOT bound", () => {
  // payment-blueprint's actual case — the tag vouched for the whole file.
  const { lines, index } = at(`
    // SPEC: PP-07
    class PaymentWorkerTest {
      private val clock = FixedClock()
      private val repo = MockPaymentRepository()
      private val gateway = StubGateway()
      @Test
      fun \`processes a pending payment\`() {}
    }
  `);
  assert.equal(citationIsBound(lines, index), false, "a class is not a test");
});

test("a citation in a helper with no test is not bound", () => {
  const { lines, index } = at(`
    // SPEC: HM-03
    private fun buildWallet() = Wallet(id = "w1")
  `);
  assert.equal(citationIsBound(lines, index), false);
});

test("a lone citation with nothing after it is not bound", () => {
  const { lines, index } = at(`// SPEC: HM-04\n`);
  assert.equal(citationIsBound(lines, index), false);
});

test("a test further than the window away is not bound", () => {
  const filler = Array.from({ length: BINDING_WINDOW + 2 }, (_, i) => `    val x${i} = ${i}`).join("\n");
  const { lines, index } = at(`
    // SPEC: HM-05
${filler}
    @Test
    fun \`too far\`() {}
  `);
  assert.equal(citationIsBound(lines, index), false, `a test beyond ${BINDING_WINDOW} lines is not what the tag claims`);
});

test("blank lines and comments between tag and test do not consume the window", () => {
  const { lines, index } = at(`
    // SPEC: HM-06

    // explaining why this case matters

    @Test
    fun \`still bound\`() {}
  `);
  assert.equal(citationIsBound(lines, index), true);
});

test("node:test and it() forms bind too", () => {
  for (const decl of ['test("x", () => {});', 'it("x", () => {});']) {
    const { lines, index } = at(`// SPEC: BP-01\n${decl}\n`);
    assert.equal(citationIsBound(lines, index), true, decl);
  }
});
