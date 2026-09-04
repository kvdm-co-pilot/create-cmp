// A bare temp root that the harness will GOVERN: the vendored qa/lib tree and
// the manifest naming its profile — what every stamped app carries, without
// stamping one (no Gradle, no template walk; milliseconds).
//
// Since Stage 0 PR 4/5 the spec scanner's model and the approvals registry come
// from the profile the manifest names, and a root without them is refused by
// name rather than scanned with a guessed layout. Tests that used to write two
// files into a temp dir and call the registry now call this first.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TEMPLATE_QA = path.join(REPO_ROOT, "template", "qa");

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) copyTree(src, dst);
    else if (e.isFile()) fs.copyFileSync(src, dst);
  }
}

/**
 * Install `qa/lib/**` and `qa/harness-manifest.json` from the template into `root`.
 * @param {string} root
 * @returns {string} root
 */
export function installHarnessLib(root) {
  copyTree(path.join(TEMPLATE_QA, "lib"), path.join(root, "qa", "lib"));
  const manifest = path.join(root, "qa", "harness-manifest.json");
  if (!fs.existsSync(manifest)) fs.copyFileSync(path.join(TEMPLATE_QA, "harness-manifest.json"), manifest);
  return root;
}
