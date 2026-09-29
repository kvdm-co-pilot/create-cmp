// proof-gate.mjs derives every bound it holds from declaredBudgetMs(): "Past it
// the hook is KILLED and its decision is never delivered", and
// test/a-device-run-proves-a-tree-the-merge-will-not-keep.test.mjs pins that the
// four bounds sum to it (1000 + 3000 + 2500 + 3500 = 10000, "NO slack").
//
// Slice 5 put scripts/hooks/fail-closed.sh in front of the gate, and the
// launcher kills the gate at ITS OWN deadline — the third argument, default 9 s —
// before Claude Code's registered 10 s. declaredBudgetMs() still reads the
// registered timeout, so the gate plans against 10 s while the process that
// actually kills it does so at 9 s: a gate that spends its full, legitimately
// budgeted purse (a slow origin, then the stamp) is killed mid-answer and the
// launcher turns that into "gate could not run (rc=137) — refusing" — a false
// refusal of a merge the gate would have answered, and the arithmetic test above
// no longer measures the budget that binds.
//
// The invariant: the budget the gate plans against is the SMALLEST deadline that
// can kill it — the registered timeout, or the launcher's own, whichever is less.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { declaredBudgetMs } from "../scripts/hooks/proof-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the budget proof-gate plans against is no larger than the deadline its fail-closed launcher kills it at", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude", "settings.json"), "utf8"));
  const entry = settings.hooks.PreToolUse.flatMap((e) => e.hooks ?? []).find((h) => String(h.command).includes("scripts/hooks/proof-gate.mjs"));
  assert.ok(entry, "the PreToolUse gate is registered");
  const launcher = fs.readFileSync(path.join(ROOT, "scripts", "hooks", "fail-closed.sh"), "utf8");
  const fallback = Number(/^limit=\$\{3:-(\d+)\}/m.exec(launcher)?.[1]);
  assert.ok(Number.isFinite(fallback), "fail-closed.sh declares its default deadline as limit=${3:-N}");
  // Arguments after the launcher's path: <gate> [prefilter] [deadline].
  const args = [...entry.command.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
  const at = args.findIndex((a) => a.endsWith("fail-closed.sh"));
  const launcherSeconds = at >= 0 && args[at + 3] !== undefined ? Number(args[at + 3]) : fallback;
  const killsAtMs = Math.min(entry.timeout * 1000, at >= 0 ? launcherSeconds * 1000 : Infinity);
  assert.ok(
    declaredBudgetMs() <= killsAtMs,
    `proof-gate plans against ${declaredBudgetMs()}ms, but ${at >= 0 ? `fail-closed.sh kills it at ${launcherSeconds * 1000}ms` : "it is killed sooner"} — a gate using the purse it was given is refused as "could not run"`,
  );
});
