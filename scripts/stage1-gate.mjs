// STAGE 1's EXIT, AS A COMMAND.
//
// §9 stated it as: "a backend repo installs the harness without create-cmp; a
// core fix reaches it by version bump." The second half was contradicted by
// ADR-0008 before anyone tried to evaluate it — the ADR says so itself, and
// says the wording "should be read that way or amended". Amended here.
//
// Under ADR-0008 the harness is ALWAYS vendored: pinning is how the bytes
// arrive, never how they are trusted, because the receipt binds the lane that
// issued the verdict and a lane living in node_modules is outside that binding.
// So a core fix cannot arrive the way a runtime dependency does. It arrives as
// RESOLVE → VENDOR → RE-LOCK, by one command, and the proof that it arrived is
// that the adopter's own tree changed — not that a package manager moved a
// number in a manifest.
//
// That distinction is the whole of criterion D, and it is why "version bump"
// was the wrong words for the right idea.
//
//   node scripts/stage1-gate.mjs
//
// Exit 0 when every criterion passes, 1 otherwise. Criteria that cannot be
// reached because an earlier one failed say so rather than reporting a pass.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HARNESS = path.join(REPO_ROOT, "packages", "harness");

function run(cmd, args, cwd, env) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, env: { ...process.env, ...env } });
}

/** A foreign backend repo: no Compose, no create-cmp, nothing of ours. */
function backendRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stage1-adopter-"));
  fs.mkdirSync(path.join(root, "internal", "cart"), { recursive: true });
  fs.mkdirSync(path.join(root, "specs"), { recursive: true });
  fs.writeFileSync(path.join(root, "go.mod"), "module example.com/cartsvc\n\ngo 1.22\n");
  fs.writeFileSync(path.join(root, "internal", "cart", "cart.go"), "package cart\n\ntype Cart struct{ Items []int }\n");
  fs.writeFileSync(
    path.join(root, "internal", "cart", "cart_test.go"),
    'package cart\n\nimport "testing"\n\n// SPEC: CART-01\nfunc TestTotal(t *testing.T) { _ = &Cart{} }\n',
  );
  fs.writeFileSync(path.join(root, "specs", "cart.spec.md"), "# Cart\n\n- **CART-01** the cart totals its line items\n");
  run("git", ["init", "-q", "."], root);
  run("git", ["-c", "user.email=a@b", "-c", "user.name=a", "add", "-A"], root);
  run("git", ["-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "cold"], root);
  return root;
}

/** `npm pack` the harness at `version`, returning the tarball path. */
function packHarness(dir, version = null) {
  const pkgPath = path.join(HARNESS, "package.json");
  const original = fs.readFileSync(pkgPath, "utf8");
  try {
    if (version) {
      const j = JSON.parse(original);
      j.version = version;
      fs.writeFileSync(pkgPath, `${JSON.stringify(j, null, 2)}\n`);
    }
    const r = run("npm", ["pack", "--pack-destination", dir], HARNESS);
    if (r.status !== 0) return null;
    const name = (r.stdout ?? "").trim().split("\n").pop();
    return name ? path.join(dir, name) : null;
  } finally {
    // The repo is READ-ONLY to this gate: whatever it borrows, it returns.
    fs.writeFileSync(pkgPath, original);
  }
}

/** Is `create-cmp` reachable from here? Criterion A means: it must not need to be. */
function installHarnessAlone(root, tarball) {
  run("npm", ["init", "-y"], root);
  const r = run("npm", ["install", tarball, "--omit=dev"], root);
  return r.status === 0 ? null : ((r.stderr || r.stdout) ?? "").trim().split("\n").slice(-2).join(" ");
}

/** The command an adopter would run, if the package exposed one. */
function harnessBin(root) {
  const dir = path.join(root, "node_modules", ".bin");
  if (!fs.existsSync(dir)) return null;
  const found = fs.readdirSync(dir).filter((n) => /prooflane|harness/.test(n));
  return found.length ? path.join(dir, found[0]) : null;
}

function criteria() {
  const out = [];
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "stage1-"));
  const adopter = backendRepo();
  try {
    // A — the package installs alone and offers a command.
    const tarball = packHarness(scratch);
    if (!tarball) {
      out.push({ what: "the harness installs into a foreign repo with no create-cmp", ok: false, detail: "npm pack failed" });
      return out;
    }
    const installErr = installHarnessAlone(adopter, tarball);
    const bin = installErr ? null : harnessBin(adopter);
    out.push({
      what: "the harness installs into a foreign repo with no create-cmp, and exposes a command",
      ok: Boolean(bin),
      detail: installErr
        ? `install failed: ${installErr}`
        : bin
          ? `${path.basename(bin)}`
          : "installed, but the package declares no `bin` — an adopter has nothing to run. The installer lives in packages/harness/install/ and is reached through packages/harness/bin/prooflane.mjs; if that is gone, a backend needs create-cmp again, which is the very thing Stage 1 says it should not",
    });

    // Everything below needs A. Say so rather than reporting a pass.
    const blocked = (what) => out.push({ what, ok: false, detail: "not reached — the harness exposes no command to run (criterion A)" });
    if (!bin) {
      blocked("that command installs a lane that reaches a green verify, non-vacuously");
      blocked("a core fix published at a higher version reaches the adopter by ONE command");
      blocked("the fix arrives IN THE TREE — vendored bytes and lock digests move, not just a manifest number");
      return out;
    }

    // B — the lane it installs is real.
    const init = run(bin, ["init"], adopter);
    const lane = init.status === 0 ? run(process.execPath, ["qa/verify.mjs"], adopter) : null;
    const laneOk = Boolean(lane && lane.status === 0 && /verify lane: PASS/.test(lane.stdout ?? ""));
    out.push({
      what: "that command installs a lane that reaches a green verify, non-vacuously",
      ok: laneOk,
      detail: laneOk ? "init → lane PASS" : `init or lane failed: ${((init.stderr || init.stdout) ?? "").slice(-200)}`,
    });
    if (!laneOk) {
      out.push({ what: "a core fix published at a higher version reaches the adopter by ONE command", ok: false, detail: "not reached — no lane to upgrade" });
      out.push({ what: "the fix arrives IN THE TREE — vendored bytes and lock digests move", ok: false, detail: "not reached" });
      return out;
    }

    // C and D — the amendment, made executable. A core fix arrives as
    // resolve → vendor → re-lock. The proof is the adopter's TREE, not a
    // number in a manifest: read the lock before and after.
    const lockPath = path.join(adopter, "qa", "harness.lock.json");
    const before = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, "utf8")) : null;
    const bumped = packHarness(scratch, "99.0.0");
    const upgraded = bumped ? run("npm", ["install", bumped, "--omit=dev"], adopter) : null;
    const cmd = upgraded && upgraded.status === 0 ? run(bin, ["upgrade"], adopter) : null;
    const after = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, "utf8")) : null;
    const versionMoved = Boolean(before && after && before.version !== after.version);
    out.push({
      what: "a core fix published at a higher version reaches the adopter by ONE command",
      ok: Boolean(cmd && cmd.status === 0 && versionMoved),
      detail: versionMoved ? `${before.version} → ${after.version}` : "the lock's version did not move",
    });
    const digestsMoved = Boolean(before && after && JSON.stringify(before.files) !== JSON.stringify(after.files));
    out.push({
      what: "the fix arrives IN THE TREE — vendored bytes and lock digests move, not just a manifest number",
      ok: digestsMoved,
      detail: digestsMoved
        ? "per-file digests changed: the adopter's own qa/ was rewritten"
        : "the lock's per-file digests are unchanged — the fix did not reach the tree, which is the failure ADR-0008 forbids",
    });
    return out;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(adopter, { recursive: true, force: true });
  }
}

function main() {
  process.stdout.write("stage 1 — distribution (NORTH-STAR §9)\n\n");
  const results = criteria();
  for (const c of results) process.stdout.write(`  ${c.ok ? "✓" : "✗"} ${c.what}\n        ${c.detail}\n`);
  const failed = results.filter((c) => !c.ok);
  process.stdout.write(failed.length ? `\nstage 1: NOT EXITED — ${failed.length}/${results.length} criteria unmet\n` : "\nstage 1: EXITED\n");
  process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
export { criteria, backendRepo };
