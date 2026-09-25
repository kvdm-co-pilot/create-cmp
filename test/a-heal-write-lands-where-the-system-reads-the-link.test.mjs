// A HEAL WRITE LANDS WHERE THE SYSTEM READS THE LINK — or it is refused and says so.
//
// `healWriter` resolves a symlinked target itself, so the atomic rename can land on the file the
// link names (KD-241). Two resolutions are in play and they are not the kernel's: `fs.realpathSync`
// (Node's JavaScript walk) and, for a dangling link, a hand-rolled `path.resolve(dir, readlink)`
// loop. Both collapse `..` LEXICALLY, and `path.resolve` drops a trailing slash. The kernel does
// neither: `lb/../x.json`, where `lb` is a link to another directory, names `x.json` beside THAT
// directory's target, not beside the link. So on such a link doctor --fix prints "wrote", the file
// the adopter's link actually reads is untouched, and a stray file appears in their tree — the
// heal is re-offered on the next run, forever. Where the lexical reading lands on the link ITSELF
// (`.claude/settings.json -> linked/../settings.json`), Node's `realpathSync` never returns, and
// doctor --fix hangs. So each write runs in a child with a deadline.
//
// THE INVARIANT, with the kernel as the oracle and not any reading of ours: after a heal write
// that reports it wrote, reading the TARGET path returns the content, the target is still the same
// link, and the only path that can have appeared in the tree is the one the kernel resolves the
// link to. A write that cannot honour that is refused and recorded on `.failed`, and the tree is
// left as it was. Add link shapes to the corpus; do not special-case one.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const DOCTOR = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "commands", "doctor.mjs")).href;

/** One heal write, in a child so a write that never returns fails the test instead of hanging it. */
function healWrite(target, content) {
  const src =
    `const { healWriter } = await import(${JSON.stringify(DOCTOR)});` +
    "const [target, content] = process.argv.slice(1);" +
    "const w = healWriter(); const out = process.stdout.write.bind(process.stdout); process.stdout.write = () => true;" +
    "const wrote = w(target, content, 'the walk into settings.json');" +
    "out(JSON.stringify({ wrote, failed: w.failed.length }));";
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", src, target, content], { encoding: "utf8", timeout: 5_000 });
  if (r.error?.code === "ETIMEDOUT") return { hung: true };
  return JSON.parse(r.stdout);
}

const HEALED = '{\n  "statusLine": { "type": "command" }\n}\n';

/** Every path under `dir`, links not followed, with what an lstat can tell apart. */
function tree(dir) {
  const out = new Map();
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) out.set(p, `link:${fs.readlinkSync(p)}`);
      else if (st.isDirectory()) (out.set(p, "dir"), walk(p));
      else out.set(p, `file:${fs.readFileSync(p, "utf8")}`);
    }
  };
  walk(dir);
  return out;
}

// Each plants the tree under `dir` and returns the link text for `.claude/settings.json`.
const LINKS = {
  "a live link through a linked directory and back out with .., to its own name": (dir) => {
    fs.mkdirSync(path.join(dir, "dotfiles", "claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, "dotfiles", "settings.json"), "{}\n");
    fs.symlinkSync(path.join(dir, "dotfiles", "claude"), path.join(dir, ".claude", "linked"));
    return "linked/../settings.json";
  },
  "a live link through a linked directory and back out with ..": (dir) => {
    fs.mkdirSync(path.join(dir, "dotfiles", "claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, "dotfiles", "shared.json"), "{}\n");
    fs.symlinkSync(path.join(dir, "dotfiles", "claude"), path.join(dir, ".claude", "linked"));
    return "linked/../shared.json";
  },
  "a dangling link through a linked directory and back out with ..": (dir) => {
    fs.mkdirSync(path.join(dir, "dotfiles", "claude"), { recursive: true });
    fs.symlinkSync(path.join(dir, "dotfiles", "claude"), path.join(dir, ".claude", "linked"));
    return "linked/../shared.json";
  },
  "a dangling link whose text ends in a slash": (dir) => {
    fs.mkdirSync(path.join(dir, "dotfiles"));
    return "../dotfiles/settings.json/";
  },
  "a dangling chain whose second hop is relative to a linked directory": (dir) => {
    fs.mkdirSync(path.join(dir, "dotfiles", "claude"), { recursive: true });
    fs.symlinkSync(path.join(dir, "dotfiles", "claude"), path.join(dir, "linked"));
    fs.symlinkSync("../settings.json", path.join(dir, "dotfiles", "claude", "hop.json"));
    return "../linked/hop.json";
  },
};

for (const [kind, plant] of Object.entries(LINKS)) {
  test(`a heal write through ${kind} lands where the system reads the link, or is refused`, () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-heal-read-")));
    try {
      fs.mkdirSync(path.join(dir, ".claude"));
      const link = path.join(dir, ".claude", "settings.json");
      const linkText = plant(dir);
      fs.symlinkSync(linkText, link);
      const before = tree(dir);

      const r = healWrite(link, HEALED);
      assert.ok(!r.hung, `${kind}: the heal write never returned — doctor --fix hangs on this link`);
      const wrote = r.wrote;
      const after = tree(dir);
      if (wrote !== true) {
        assert.equal(r.failed, 1, `${kind}: the write neither wrote nor reported a refusal`);
        assert.deepEqual(after, before, `${kind}: a refused write changed the tree`);
        return;
      }
      assert.ok(fs.lstatSync(link).isSymbolicLink(), `${kind}: the link became a plain file`);
      assert.equal(fs.readlinkSync(link), linkText, `${kind}: the link now names somewhere else`);
      let read;
      try {
        read = fs.readFileSync(link, "utf8");
      } catch (err) {
        read = `<${err.code}>`;
      }
      assert.equal(read, HEALED, `${kind}: doctor said it wrote, but reading the link does not return what it wrote`);
      const landed = fs.realpathSync.native(link);
      const appeared = [...after.keys()].filter((p) => !before.has(p) && p !== landed);
      assert.deepEqual(appeared, [], `${kind}: the write left a file the link does not name`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
