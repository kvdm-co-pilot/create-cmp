// The stamped app's Verify job is the check template/qa/ruleset.json makes
// REQUIRED on the default branch (template/README.md tells the adopter to install
// it). So every step in that job either answers about the adopter's code or
// cannot turn the job red. Slice 8A added `actions/attest-build-provenance`,
// guarded against forks only. Artifact attestations are a plan-gated GitHub
// feature: public repositories on every plan, private and internal ones on
// GitHub Enterprise Cloud only — docs/adr/0017-receipt-attested-by-ci.md
// ("Private repositories") says so itself, marks it UNVERIFIED, and says "the
// step needs a guard, not a removal". The template ships it unguarded, so an app
// in a private repository on Free/Pro/Team gets a red Verify on every push to
// main and every same-repository PR — a required check failing for a reason that
// is not in the app — while the local receipt it attests is green.
//
// The invariant, for the class and not the one action: every step that uses a
// plan-gated GitHub attestation action is either restricted to repositories
// that have the feature (its `if:` reads the repository's visibility) or cannot
// fail the job (`continue-on-error: true`).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAN_GATED = /uses:\s*actions\/attest(?:-build-provenance|-sbom)?@/;

/** The template workflow's steps, as the text of each `- ` item under a `steps:` list (comments dropped). */
function steps(yml) {
  const lines = yml.split("\n").filter((l) => !/^\s*#/.test(l));
  const out = [];
  let cur = null;
  let indent = -1;
  for (const l of lines) {
    const m = /^(\s*)- /.exec(l);
    if (m && (indent < 0 || m[1].length === indent)) {
      if (cur) out.push(cur.join("\n"));
      cur = [l];
      indent = m[1].length;
      continue;
    }
    if (cur && l.trim() && /^(\s*)/.exec(l)[1].length <= indent) {
      out.push(cur.join("\n"));
      cur = null;
      indent = -1;
      continue;
    }
    if (cur) cur.push(l);
  }
  if (cur) out.push(cur.join("\n"));
  return out;
}

test("every plan-gated attestation step in the stamped Verify job is guarded to repositories that have the feature, or cannot fail the job", () => {
  const yml = fs.readFileSync(path.join(ROOT, "template", ".github", "workflows", "verify.yml"), "utf8");
  const gated = steps(yml).filter((s) => PLAN_GATED.test(s));
  assert.ok(gated.length > 0, "the template's Verify job attests its receipt (slice 8A) — this test reads that step");
  const unguarded = gated.filter((s) => !/continue-on-error:\s*true/.test(s) && !/if:[^\n]*(?:repository\.visibility|repository\.private)/.test(s));
  assert.deepEqual(
    unguarded.map((s) => s.split("\n")[0].trim()),
    [],
    "a private repository on a non-Enterprise plan has no artifact attestations, so this step fails the required Verify check for a reason outside the app",
  );
});
