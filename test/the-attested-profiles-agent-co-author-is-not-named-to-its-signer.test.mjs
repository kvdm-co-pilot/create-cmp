// THE ONE DOCUMENT WRITTEN TO INFORM A PROVENANCE SIGNATURE DOES NOT NAME
// EVERY AUTHOR GIT REPORTS FOR THE THING BEING ATTESTED.
//
// `docs/attestations/README.md` argues the provenance half of criterion A to the
// only person who can close it. Under the heading "What is already proven, by
// running it rather than asserting it" it says, in bold:
//
//   **A human wrote it in that repo.** … Its three commits are … — all authored
//   by `Karel van der Merwe <karelvdmmisc@gmail.com>`.
//
// and it separates the candidate from `pantry-api` on exactly that ground —
// pantry-api's pack header says "AUTHORED BY AN AGENT … under ADR-0013", and
// scripts/stage2-gate.mjs:3-6 quotes §9: "Our own agents authoring one no longer
// counts — two have."
//
// All three of those commits carry `Co-Authored-By: Claude Opus 5
// <noreply@anthropic.com>`. The README's enumeration of their authorship reads
// `%an <%ae>` and stops there, so the identity that decides the §9 question is
// the one identity the signer is not shown. Measured, on the tree the attestation
// points at:
//
//   git log --format="%an|%(trailers:key=Co-Authored-By,valueonly)" -- qa/lib/profiles/fuelled-api
//   Karel van der Merwe|Claude Opus 5 <noreply@anthropic.com>   (x3)
//
// WHAT THIS TEST DOES NOT DECIDE. Whether an agent-co-authored profile satisfies
// §9 is Karel's call and is handed up as a decision, not settled here. This
// asserts only completeness: an authorship identity the record does not name is
// one the signer cannot weigh. Naming the co-author in the README turns it green;
// so does dropping the authorship argument. Both leave the decision with him.
//
// THE INVARIANT, NOT THE INSTANCE. Not "the README omits Claude Opus 5" — that
// goes green on one sentence and the next candidate profile re-opens it. The
// class is: for the artifact this repository attests, every authorship identity
// its own VCS reports is named in the attestation record. It is derived from the
// attestation (`artifact.location`, `profile.id`), so it follows the candidate
// when the candidate changes.
//
// It also pins the premise the rest of the record rests on: the vendored receipt
// is a COPY, and a copy that has drifted from the lane that minted it turns every
// measured claim in that README into prose. Nothing else in this repository
// compares the two.
//
// SKIPS, RATHER THAN LIES, WHEN THE ARTIFACT IS NOT HERE. `artifact.kind` is
// `"path"` and `fuelled-api` has no git remote — the README says so and calls it
// the weakest thing about the claim. So this can only run where that path exists,
// which is the machine the signature would be written on. Anywhere else it
// reports "not reachable from here", which is the true answer and is itself the
// measurement behind that caveat.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ATTESTATION_REL } from "../scripts/stage2-gate.mjs";
import { RECEIPT_REL_PATH } from "../packages/harness/src/lib/receipt-validate.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORD_REL = "docs/attestations/README.md";

function readJson(rel) {
  const abs = path.join(REPO_ROOT, ...rel.split("/"));
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

/** The tree the attestation points at, if it is a git repository reachable from here. */
function attestedTree() {
  const att = readJson(ATTESTATION_REL);
  const location = typeof att?.artifact?.location === "string" ? att.artifact.location.trim() : "";
  const profileId = typeof att?.profile?.id === "string" ? att.profile.id.trim() : "";
  if (!location || !profileId) return { why: `${ATTESTATION_REL} names no artifact.location and profile.id yet` };
  if (!path.isAbsolute(location) || !fs.existsSync(location)) return { why: `artifact.location ${JSON.stringify(location)} is not a path reachable from this machine` };
  if (!fs.existsSync(path.join(location, ".git"))) return { why: `${location} is not a git repository, so it reports no authorship` };
  return { root: location, profileId };
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

test("every author the attested profile's own history reports is named in the attestation record", (t) => {
  const tree = attestedTree();
  if (!tree.root) return t.skip(tree.why);

  const profileDir = path.join("qa", "lib", "profiles", tree.profileId);
  const log = git(tree.root, "log", "--format=%an <%ae>%n%(trailers:key=Co-Authored-By,valueonly,separator=%x0A)", "--", profileDir);

  const identities = new Set(
    log
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
  assert.ok(identities.size > 0, `no commit in ${tree.root} touches ${profileDir} — the attested profile has no history to read`);

  const record = fs.readFileSync(path.join(REPO_ROOT, ...RECORD_REL.split("/")), "utf8");

  // A name is enough; the email spelling is the record's own business.
  const missing = [...identities].filter((id) => {
    const name = id.replace(/\s*<[^>]*>\s*$/, "").trim();
    return !record.includes(name);
  });

  assert.deepEqual(
    missing,
    [],
    `${RECORD_REL} argues the provenance of ${tree.profileId} to its signer without naming ${missing.join(", ")} — ` +
      `git reports ${[...identities].join(", ")} as author or co-author of ${profileDir}, and §9 turns on which of them wrote it`,
  );
});

test("the vendored receipt is still the bytes the attested tree's lane minted", (t) => {
  const tree = attestedTree();
  if (!tree.root) return t.skip(tree.why);

  const att = readJson(ATTESTATION_REL);
  const vendoredRel = typeof att?.receipt === "string" ? att.receipt : null;
  if (!vendoredRel) return t.skip(`${ATTESTATION_REL} names no receipt`);

  const vendored = path.join(REPO_ROOT, ...vendoredRel.split("/"));
  const source = path.join(tree.root, ...RECEIPT_REL_PATH.split("/"));
  assert.ok(fs.existsSync(vendored), `${vendoredRel} is named by the attestation and is not there`);
  assert.ok(fs.existsSync(source), `${source} — the lane run the vendored receipt claims to be a copy of left nothing at ${RECEIPT_REL_PATH}`);

  assert.deepEqual(
    fs.readFileSync(vendored),
    fs.readFileSync(source),
    `${vendoredRel} has drifted from ${source}: it is a COPY, and every measured claim in ${RECORD_REL} is about the original`,
  );
});
