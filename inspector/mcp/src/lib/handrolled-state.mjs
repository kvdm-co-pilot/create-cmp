// handrolled-state.mjs — a console-side mirror of the ARCH-11 gate CONCEPT
// proposed in docs/proposals/component-system-deep-dive.md §6.4 ("screens
// must not hand-roll a loading state"): any presentation/** file OUTSIDE
// presentation/components/ that references CircularProgressIndicator or
// LinearProgressIndicator directly should be going through the components
// registry (ContentStateContainer / ContentStateDefaults) instead.
//
// This is NOT the enforcing gate — that landed as ARCH-11 in the generated
// project's own ArchitectureConformanceTest, template-side, which this
// package never forks (inspector/mcp/** owns the console, not template/qa/**). It's a lightweight, honestly-labeled PREVIEW
// of the same rule, so a violation is visible in the console before a build
// even runs. Absence of the Kotlin gate in an older/newer scaffold doesn't
// change what this file reports — it derives entirely from source text on
// disk, never from any gate's pass/fail record.

import fs from "node:fs";
import path from "node:path";
import { findPresentationDirs, walkKtFiles } from "./components.mjs";

const INDICATORS = ["CircularProgressIndicator", "LinearProgressIndicator"];

function isUnderComponentsDir(absFile) {
  return absFile.split(path.sep).includes("components");
}

/**
 * Every presentation/** file (components/ excluded) that references a raw
 * M3 progress indicator directly, with the matched indicator name(s) and
 * 1-based line numbers for each — never just a boolean, so the console can
 * point at exactly where.
 * @param {string} root project root
 * @returns {{available: false, reason: string} | {available: true, violations: Array<{file: string, indicators: Array<{name: string, lines: number[]}>}>}}
 */
export function getHandRolledStateViolations(root) {
  const kotlinRoot = path.join(root, "composeApp", "src", "commonMain", "kotlin");
  const presentationDirs = findPresentationDirs(kotlinRoot);
  if (presentationDirs.length === 0) {
    return {
      available: false,
      reason: `no 'presentation' directory found under ${path.relative(root, kotlinRoot).split(path.sep).join("/")}`,
    };
  }
  const files = presentationDirs.flatMap(walkKtFiles).filter((f) => !isUnderComponentsDir(f));
  const violations = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const indicators = [];
    for (const name of INDICATORS) {
      const re = new RegExp(`\\b${name}\\b`, "g");
      const lines = [];
      let m;
      while ((m = re.exec(text))) {
        lines.push(text.slice(0, m.index).split("\n").length);
      }
      if (lines.length) indicators.push({ name, lines });
    }
    if (indicators.length) {
      violations.push({ file: path.relative(root, file).split(path.sep).join("/"), indicators });
    }
  }
  violations.sort((a, b) => a.file.localeCompare(b.file));
  return { available: true, violations };
}
