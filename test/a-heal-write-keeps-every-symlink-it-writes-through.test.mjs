// A HEAL WRITE KEEPS EVERY SYMLINK IT WRITES THROUGH — live or dangling.
//
// KD-241 moved `healWriter` from `fs.writeFileSync(target)` to a temporary file renamed over
// the target, and resolves a symlinked target with `fs.realpathSync` so the rename lands on the
// file the link points at. `realpathSync` refuses a DANGLING link (ENOENT), which the new code
// reads as "no file yet" — and then renames the temporary file over the LINK ITSELF. The
// truncating write it replaced followed the link and created the file it names; the atomic one
// destroys the adopter's link (a .claude/settings.json kept in a dotfiles checkout, say) and
// leaves a plain file in its place. doctor.mjs's own comment promises "a symlinked target
// keeps its link".
//
// THE INVARIANT: whatever kind of symlink the target is, after a successful heal write the
// target is still that symlink, and the content is at the path the link names.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";

import { healWriter } from "../src/commands/doctor.mjs";

const HEALED = '{\n  "statusLine": { "type": "command" }\n}\n';

const LINKS = {
  "a live absolute link": (dir, dest) => (fs.writeFileSync(dest, "{}\n"), dest),
  "a live relative link": (dir, dest) => (fs.writeFileSync(dest, "{}\n"), path.relative(path.join(dir, ".claude"), dest)),
  "a dangling absolute link": (dir, dest) => dest,
  "a dangling relative link": (dir, dest) => path.relative(path.join(dir, ".claude"), dest),
};

for (const [kind, plant] of Object.entries(LINKS)) {
  test(`a heal write through ${kind} keeps the link and writes where it points`, () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-heal-link-")));
    try {
      fs.mkdirSync(path.join(dir, "dotfiles"));
      fs.mkdirSync(path.join(dir, ".claude"));
      const dest = path.join(dir, "dotfiles", "settings.json");
      const link = path.join(dir, ".claude", "settings.json");
      const linkText = plant(dir, dest);
      fs.symlinkSync(linkText, link);

      const write = healWriter();
      const out = mock.method(process.stdout, "write", () => true);
      let wrote;
      try {
        wrote = write(link, HEALED, "the walk into settings.json");
      } finally {
        out.mock.restore();
      }

      assert.equal(wrote, true, "the heal write did not succeed");
      assert.ok(fs.lstatSync(link).isSymbolicLink(), `${kind}: the heal replaced the adopter's symlink with a plain file`);
      assert.equal(fs.readlinkSync(link), linkText, `${kind}: the link now names somewhere else`);
      assert.equal(fs.readFileSync(dest, "utf8"), HEALED, `${kind}: the content is not where the link points`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
