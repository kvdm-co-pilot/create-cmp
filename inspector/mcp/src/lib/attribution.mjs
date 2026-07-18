// attribution.mjs — crash-to-cause attribution: intersect a crash's stack frames with a set
// of recently-edited source files. Pure logic — callers supply `changedFiles` (typically from
// `git status --porcelain` + `git diff --name-only`, gathered by server.mjs's transport layer;
// the preview service's per-file change tracking is an equally valid source when it's running).
// No fs/git/child_process here, so this is fixture-testable without a repo or a device.
//
// Matching is by FILENAME (the last path segment), not full path — a crash frame's `fileName`
// (e.g. "HomeViewModel.kt") is compared against the basename of each changed file. `className`
// is a secondary signal (its simple name + ".kt"), used when a frame carries no fileName
// (stripped/obfuscated stack traces often carry no line info either).

function basename(p) {
  return String(p).split(/[\\/]/).pop();
}

/** "com.example.app.presentation.home.HomeViewModel$1" → "HomeViewModel.kt" (drop inner-class suffix). */
function classSimpleNameToFile(className) {
  if (!className || typeof className !== "string") return null;
  const simple = className.split(".").pop().split("$")[0];
  return simple ? `${simple}.kt` : null;
}

/**
 * @param {{exception?:string, message?:string, frames?:Array<{fileName?:string,className?:string}>}} crash
 * @param {string[]} changedFiles  recently-edited file paths, any form — matched by basename
 * @returns {{
 *   verdict: "likely-caused-by-recent-edit" | "no-recent-edit-implicated",
 *   evidence: Array<{frame:object, changedFile:string, matchedOn:"fileName"|"className"}>,
 *   changedFilesConsidered: string[]
 * }}
 */
export function attributeCrash(crash, changedFiles = []) {
  const changed = (changedFiles || []).filter(Boolean);
  // Last-write-wins on a basename collision — fine for this heuristic (multiple changed files
  // sharing a name is rare, and either is equally good evidence of "recently touched").
  const changedBasenames = new Map(changed.map((f) => [basename(f), f]));

  const evidence = [];
  for (const frame of (crash && crash.frames) || []) {
    if (frame && frame.fileName && changedBasenames.has(frame.fileName)) {
      evidence.push({ frame, changedFile: changedBasenames.get(frame.fileName), matchedOn: "fileName" });
      continue;
    }
    const derived = frame && classSimpleNameToFile(frame.className);
    if (derived && changedBasenames.has(derived)) {
      evidence.push({ frame, changedFile: changedBasenames.get(derived), matchedOn: "className" });
    }
  }

  return {
    verdict: evidence.length > 0 ? "likely-caused-by-recent-edit" : "no-recent-edit-implicated",
    evidence,
    changedFilesConsidered: changed,
  };
}
