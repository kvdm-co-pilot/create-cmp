// A LEAN APP'S OWN PROSE NAMES NO FILE THE LEAN STAMP REMOVED.
//
// 6bf4c53 fixed one instance: docs/ARCHITECTURE.md described Room, AppDatabase,
// ItemDao and data/local/ to an app stamped without them. The class is wider than that
// one doc. Every adopter-facing text file in a `--preset lean` app, meaning its docs,
// its root markdown and the comments in its own source, must name only files the app
// has. The removed set is DERIVED: the files a default stamp has that a lean stamp
// lacks, and the directories that vanish with them. So a toggle that later removes
// more files is held without editing this test.
//
// Two groups are not scanned. Files only the lean stamp carries (ADR 0005, which
// records the removal) are about the absence. `qa/` and `.claude/` are harness
// machinery shipped identically to every shape, and they handle both.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const SAME_APP = ["--name", "Acme", "--package", "com.acme.demo", "--no-ios", "--no-verify", "--yes"];

function walk(dir, rel = "") {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name === ".git" || e.name === "build" || e.name === ".gradle") continue;
      out.push(...walk(dir, r));
    } else out.push(r);
  }
  return out;
}

test("no adopter-facing file in a --preset lean app names a file or directory the lean stamp removed", () => {
  const box = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-lean-prose-"));
  try {
    for (const [name, extra] of [["full", []], ["lean", ["--preset", "lean"]]]) {
      const r = spawnSync(process.execPath, [BIN, path.join(box, name), ...SAME_APP, ...extra], { cwd: box, encoding: "utf8", timeout: 120_000 });
      assert.equal(r.status, 0, `${name}: ${r.stdout}${r.stderr}`);
    }
    const full = walk(path.join(box, "full"));
    const lean = new Set(walk(path.join(box, "lean")));
    // docs/adr/ is excluded: seeded ADRs are renumbered by shape (lean's 0005 pushes
    // the iOS-deferral ADR to 0006), which is a rename, not a removal.
    const removed = full.filter((f) => !lean.has(f) && !f.startsWith("docs/adr/"));
    assert.ok(removed.length > 0, "lean removed nothing, so this test would read nothing");

    // Each removed file by basename, and each directory left with no file at all,
    // by its last two segments (`data/local`), which is how prose names it.
    const leanDirs = new Set([...lean].map((f) => path.posix.dirname(f)));
    const gone = new Set(removed.map((f) => path.posix.dirname(f)).filter((d) => ![...leanDirs].some((l) => l === d || l.startsWith(`${d}/`))));
    const names = [...new Set(removed.map((f) => path.posix.basename(f)))];
    const dirs = [...new Set([...gone].map((d) => d.split("/").slice(-2).join("/")))];

    const fullSet = new Set(full);
    const scanned = [...lean].filter(
      (f) => fullSet.has(f) && !/^(qa|\.claude)\//.test(f) && /^(docs\/|composeApp\/src\/|[^/]+\.md$)/.test(f) && /\.(md|kt|kts)$/.test(f),
    );
    const hits = [];
    for (const f of scanned) {
      const lines = fs.readFileSync(path.join(box, "lean", f), "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const n of [...names, ...dirs]) if (line.includes(n)) hits.push(`${f}:${i + 1} names ${n}`);
      });
    }
    assert.deepEqual(hits, [], `a lean app's own text names what the lean stamp removed (${[...names, ...dirs].join(", ")}):\n  ${hits.join("\n  ")}`);
  } finally {
    fs.rmSync(box, { recursive: true, force: true });
  }
});
