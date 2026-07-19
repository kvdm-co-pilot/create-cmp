// variants.mjs — the Design System tab's genesis candidates strip data
// (GENESIS-FLOW-DESIGN.md §2 "Design-language candidates (variants)"): a
// pure, read-only disk scan of composeApp/build/previews/variants/<name>/ —
// each variant is a PAST `snapshot_variant` stash (per-screen screen.png
// copies + design-system.json), never generated here. Same style as
// components.mjs/architecture.mjs/specs.mjs: (root) -> data, no DOM, honest
// empty state when nothing's been stashed yet (that's a normal genesis-mode
// moment, not an error).
//
// The WRITE side (copying the current render into a new/replaced variant
// dir) lives in preview-service.mjs's snapshotVariant(), not here — stashing
// needs the service's in-memory `cards` (the CURRENT render outputs), which
// this module has no access to and shouldn't reach for (it only ever reads
// what's already on disk).

import fs from "node:fs";
import path from "node:path";

/**
 * Every stashed variant, each with the screen ids it actually has a
 * screen.png for (never fabricated — a variant directory with no PNGs yet,
 * e.g. mid-write, reports an empty screens list rather than guessing) and
 * whether a design-system.json snapshot was stashed alongside it. Absent
 * variants/ dir, or one with zero subdirectories, both read as
 * {available: false} — "no candidates yet" is a genesis-mode empty state.
 * @param {string} root project root
 * @returns {{available: false} | {available: true, variants: Array<{name: string, screens: Array<{id: string, png: string}>, hasDesignSystem: boolean}>}}
 */
export function getVariantsData(root) {
  const variantsDir = path.join(root, "composeApp", "build", "previews", "variants");
  let entries;
  try {
    entries = fs.readdirSync(variantsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return { available: false };
  }
  if (entries.length === 0) return { available: false };

  const variants = entries
    .map((e) => e.name)
    .sort()
    .map((name) => {
      const dir = path.join(variantsDir, name);
      let screenDirs = [];
      try {
        screenDirs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
      } catch {
        screenDirs = [];
      }
      const screens = screenDirs
        .map((e) => e.name)
        .filter((id) => fs.existsSync(path.join(dir, id, "screen.png")))
        .sort()
        .map((id) => ({ id, png: `variants/${name}/${id}/screen.png` }));
      const hasDesignSystem = fs.existsSync(path.join(dir, "design-system.json"));
      return { name, screens, hasDesignSystem };
    });
  return { available: true, variants };
}
