// THE COLD ADOPTION, AS A COMMAND.
//
// Stage 0's second exit criterion — "a cold adoption authored from `harness
// init` output and the README alone" — was met by a human-driven run on
// 2026-09-07 that found a real wrong verdict (Go puts its tests beside the
// source; the seeded tier map only knew test directories). A criterion met once
// by hand is not a criterion: nothing re-runs it, nothing notices when it
// breaks, and its result decays into a sentence in a commit message.
//
// So it runs here. Each ecosystem goes from nothing to a green lane and the
// result is checked for the failure that matters most — a VACUOUS green, where
// the lane passes because it found nothing rather than because it proved
// something.
//
//   node scripts/cold-adoption.mjs           every ecosystem
//   node scripts/cold-adoption.mjs --keep    leave the scratch trees for inspection
//
// This repo is READ-ONLY here: the run is verified clean at both ends, because
// an adoption experiment that edits the engine is measuring itself.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO_ROOT, "bin", "create-cmp.mjs");

/**
 * Each ecosystem is unlike `cmp` AND unlike the others: a different comment
 * marker, a different test-file convention, a different source layout. A clause
 * declaring `[tier: …]` is included deliberately — that is the assertion the Go
 * run failed, and the one a vacuous green would skip.
 */
const ECOSYSTEMS = [
  {
    id: "go",
    files: {
      "go.mod": "module example.com/cartsvc\n\ngo 1.22\n",
      "internal/cart/cart.go": "package cart\n\ntype Cart struct{ Items []int }\n\nfunc (c *Cart) Total() int {\n\tsum := 0\n\tfor _, i := range c.Items {\n\t\tsum += i\n\t}\n\treturn sum\n}\n",
      // Beside the source, which is where Go puts a test and where a
      // directory-only tier map cannot see it.
      "internal/cart/cart_test.go":
        'package cart\n\nimport "testing"\n\n// SPEC: CART-01\nfunc TestTotal(t *testing.T) {\n\tif (&Cart{Items: []int{1, 2}}).Total() != 3 {\n\t\tt.Fatal("bad")\n\t}\n}\n\n// SPEC: CART-02\nfunc TestEmpty(t *testing.T) {\n\tif (&Cart{}).Total() != 0 {\n\t\tt.Fatal("bad")\n\t}\n}\n',
      "specs/cart.spec.md": "# Cart\n\n- **CART-01** the cart totals its line items\n- **CART-02** [tier: unit] an empty cart totals zero\n",
    },
    expect: { language: "Go", citations: 2 }, // init names the language, Linguist-style, since 2026-09-08
  },
  {
    id: "py",
    files: {
      "app/cart.py": "class Cart:\n    def __init__(self, items=None):\n        self.items = items or []\n\n    def total(self):\n        return sum(self.items)\n",
      "app/test_cart.py":
        "from app.cart import Cart\n\n\n# SPEC: CART-01\ndef test_total():\n    assert Cart([1, 2]).total() == 3\n\n\n# SPEC: CART-02\ndef test_empty():\n    assert Cart().total() == 0\n",
      "specs/cart.spec.md": "# Cart\n\n- **CART-01** the cart totals its line items\n- **CART-02** [tier: unit] an empty cart totals zero\n",
    },
    expect: { language: "Python", citations: 2 },
  },
];

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function git(cwd, ...args) {
  return run("git", ["-c", "user.email=cold@adoption", "-c", "user.name=cold", ...args], cwd);
}

/** The engine must not be edited by an experiment that measures it. */
function repoIsClean() {
  const r = run("git", ["status", "--porcelain"], REPO_ROOT);
  return r.status === 0 && (r.stdout ?? "").trim() === "";
}

function writeTree(root, files) {
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
}

/**
 * The anti-vacuity check, and the reason this script exists rather than a
 * `grep PASS`. A lane that finds no clauses and no citations passes just as
 * green as one that proved something — and would have passed on the Go tree
 * whose tiers were all null.
 */
function bindingReport(root) {
  const probe = `
import { resolveSpecModel } from "./qa/lib/spec-model.mjs";
import { scanSpecClauses, scanCitations, clauseTierCoverage } from "./qa/lib/spec-coverage.mjs";
const m = resolveSpecModel(process.cwd()).model;
const clauses = scanSpecClauses(process.cwd(), m);
const tags = scanCitations(process.cwd(), m);
const cov = clauseTierCoverage(clauses, tags, m);
process.stdout.write(JSON.stringify({
  clauses: [...clauses.keys()],
  citations: tags.map((t) => ({ id: t.id, file: t.file, tier: t.tier })),
  uncited: (cov.uncited ?? []).map((c) => c.id),
  unmetTier: (cov.unmetTier ?? []).map((c) => c.id),
  grammarIsDefault: m.grammar.isDefault,
}));
`;
  const r = run(process.execPath, ["--input-type=module", "-e", probe], root);
  if (r.status !== 0) return { error: (r.stderr || "").split("\n").slice(0, 3).join(" ") };
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { error: `unparsable probe output: ${r.stdout.slice(0, 120)}` };
  }
}

function adopt(eco, keep) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cold-${eco.id}-`));
  const fail = (why, detail) => ({ id: eco.id, ok: false, why, detail, root: keep ? root : null });
  try {
    writeTree(root, eco.files);
    git(root, "init", "-q", ".");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "cold");

    const init = run(process.execPath, [CLI, "harness", "init", "--target-dir", root], REPO_ROOT);
    if (init.status !== 0) return fail("harness init failed", (init.stderr || init.stdout).slice(0, 400));
    if (eco.expect.language && !init.stdout.includes(eco.expect.language)) {
      return fail("init did not detect the language", `expected ${eco.expect.language} in its output`);
    }

    // Rule 0, exactly as init instructs: commit, then prove the lane returns.
    git(root, "add", "-A");
    git(root, "commit", "-qm", "install the verify lane");
    const fc = run(process.execPath, ["qa/framework-check.mjs"], root);
    if (fc.status !== 0 || !/framework check: PASS/.test(fc.stdout)) {
      return fail("framework-check did not PASS", (fc.stdout + fc.stderr).slice(-400));
    }

    const lane = run(process.execPath, ["qa/verify.mjs"], root);
    if (lane.status !== 0 || !/verify lane: PASS/.test(lane.stdout)) {
      return fail("the lane did not PASS", (lane.stdout + lane.stderr).slice(-400));
    }

    // Green is not enough. Green over NOTHING is the failure this catches.
    const b = bindingReport(root);
    if (b.error) return fail("could not read what the lane bound", b.error);
    if (b.clauses.length === 0) return fail("VACUOUS: the lane passed having found no clauses");
    if (b.citations.length < eco.expect.citations) {
      return fail("VACUOUS: citations did not bind", `expected ${eco.expect.citations}, bound ${b.citations.length}`);
    }
    if (b.uncited.length) return fail("a clause went uncited", b.uncited.join(", "));
    if (b.unmetTier.length) return fail("a tiered clause was not met by a real test", b.unmetTier.join(", "));
    if (b.citations.some((c) => !c.tier || c.tier === "other")) {
      return fail("a citation landed on no declared tier", JSON.stringify(b.citations));
    }
    if (b.grammarIsDefault) return fail("the profile fell back to the core grammar instead of declaring its own");

    return { id: eco.id, ok: true, bound: b.citations.length, tiers: [...new Set(b.citations.map((c) => c.tier))], root: keep ? root : null };
  } finally {
    if (!keep) fs.rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const keep = process.argv.includes("--keep");
  if (!repoIsClean()) {
    process.stderr.write("cold adoption: REFUSED — this repo has uncommitted changes.\n  An adoption experiment that can edit the engine is measuring itself.\n");
    process.exit(2);
  }
  process.stdout.write("cold adoption — nothing to a proven lane, in each ecosystem\n\n");
  const results = ECOSYSTEMS.map((e) => adopt(e, keep));
  for (const r of results) {
    process.stdout.write(
      r.ok
        ? `  ✓ ${r.id.padEnd(4)} init → framework-check PASS → lane PASS · ${r.bound} citations bound, tiers ${r.tiers.join("+")}\n`
        : `  ✗ ${r.id.padEnd(4)} ${r.why}${r.detail ? `\n         ${r.detail}` : ""}${r.root ? `\n         kept: ${r.root}` : ""}\n`,
    );
  }
  if (!repoIsClean()) {
    process.stderr.write("\ncold adoption: REFUSED — the run left changes in this repo. It must be read-only.\n");
    process.exit(2);
  }
  const bad = results.filter((r) => !r.ok);
  process.stdout.write(bad.length ? `\ncold adoption: FAIL — ${bad.length}/${results.length}\n` : `\ncold adoption: PASS — ${results.length}/${results.length}, engine untouched\n`);
  process.exit(bad.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
export { ECOSYSTEMS, adopt };
