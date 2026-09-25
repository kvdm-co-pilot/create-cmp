// scripts/lib/fleet-firebase.mjs — the L2 run that covers Firebase (KD-45).
//
// Every L2 run proves the app the fleet scratch stamp makes, and that app has no
// Firebase in it: Firebase is added by `create-cmp add firebase`, not stamped.
// So the evidence ladder's L2 rung — "the artifact ran AS THE PROGRAM" — was
// earned by a program without the template's Firebase code in it.
//
// `fleet-check --with-firebase` is the run that executes it: the scratch app is
// stamped, `create-cmp add firebase --no-verify` runs on it, and the app's own
// lane runs inside the Firebase Emulator Suite. This module is what that run
// needs beyond an ordinary one:
//
//   firebasePreflight     no Firebase CLI, no PATH `java` or no CMP_AVD is a loud
//                         refusal — never a quiet fall back to a run without the add
//   readDeclaredRedirect  where the redirect points is read FROM THE STAMPED TREE:
//   emulatorPlanFor       the host from Gradle, the ports from FirebaseConfig.kt,
//   firebaseJsonFor       the project from google-services.json (KD-47: those are
//                         the one spelling of each; this adds none)
//   runLaneUnderEmulators the lane runs inside `firebase emulators:exec` on the
//                         app's own `demo-` project — no real project, no login —
//                         and the suite is stopped on every exit path
//   coverageFor           the record says what the run covered, and what it did
//   defaultCoverage       not, so a run without the flag is never read as Firebase
//
// iOS stays out of every run: parked by the owner (see IOS_REASON).

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";

/** The fleet-check flag that adds Firebase to the scratch app and runs it under the Emulator Suite. */
export const WITH_FIREBASE_FLAG = "--with-firebase";

/**
 * Why no fleet run covers iOS. Cited, not asserted: the parking is
 * `.github/workflows/ci.yml` (stamp-ios: "iOS CI is PARKED for now (founder
 * call, 2026-07-03)"), and KD-45's iOS half stays open on that decision.
 */
export const IOS_REASON =
  "every fleet profile stamps --no-ios: iOS is parked (founder call 2026-07-03, .github/workflows/ci.yml; " +
  "KD-45's iOS half), so nothing in this run built or launched iOS code";

// ── Preflight ───────────────────────────────────────────────────────────────

function commandRuns(cmd, args) {
  const probe = spawnSync(cmd, args, { stdio: "ignore", timeout: 60_000 });
  return probe.status === 0;
}

const NEEDS = [
  {
    command: "firebase",
    args: ["--version"],
    install: "the Firebase CLI — `npm install -g firebase-tools`. It starts the Emulator Suite the lane runs inside, and stops it.",
  },
  {
    command: "java",
    args: ["-version"],
    install:
      "a JDK whose `java` is on PATH. The Firebase CLI starts the Firestore emulator with `java` from PATH and does not read " +
      "JAVA_HOME, so a JAVA_HOME that satisfies Gradle is not enough here. The CLI states the minimum version it accepts when it refuses one.",
  },
];

const AVD_NEED = {
  env: "CMP_AVD",
  install:
    "set it to the Android Virtual Device the lane boots. The app reaches the suite at 10.0.2.2, which is this host's loopback " +
    "only from an Android emulator; on an attached phone the redirect reaches nothing and the app refuses to start (KD-211).",
};

/**
 * What a Firebase-covering run needs on this host that an ordinary one does not.
 * Every missing thing is reported at once — one round trip, not one per tool.
 * A missing command is `{command, install}`; a missing variable is `{env, install}`.
 *
 * @param {{ commandWorks?: (cmd: string, args: string[]) => boolean, env?: Record<string, string|undefined> }} [opts]
 * @returns {{ ok: boolean, missing: ({command: string, install: string} | {env: string, install: string})[], message?: string }}
 */
export function firebasePreflight({ commandWorks = commandRuns, env = process.env } = {}) {
  const missing = NEEDS.filter((n) => !commandWorks(n.command, n.args)).map(({ command, install }) => ({ command, install }));
  if (!String(env[AVD_NEED.env] ?? "").trim()) missing.push({ ...AVD_NEED });
  if (!missing.length) return { ok: true, missing: [] };
  const message =
    `fleet check: ${WITH_FIREBASE_FLAG} runs the lane inside the Firebase Emulator Suite, on an Android emulator, and this host cannot:\n` +
    missing
      .map((m) => (m.command ? `  - \`${m.command}\` did not run — install ${m.install}\n` : `  - ${m.env} is not set — ${m.install}\n`))
      .join("") +
    `Refused. ${WITH_FIREBASE_FLAG} never falls back to a run without \`create-cmp add firebase\`: that app has no Firebase ` +
    `in it, and the run would record a Firebase proof it never ran. A fleet check without the flag needs none of these.\n`;
  return { ok: false, missing, message };
}

// ── What the stamped app declares ───────────────────────────────────────────

const GRADLE_FILE = "composeApp/build.gradle.kts";

/**
 * `src` with every comment blanked to spaces, same length — so a regex over it
 * never reads a declaration out of prose, and offsets still line up.
 * Kotlin raw strings are not modelled (KD-51 is that trap in another reader);
 * the build type blocks this reads contain none.
 */
function maskComments(src) {
  const out = src.split("");
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      i++;
      while (i < src.length && src[i] !== '"' && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      i++;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") out[i++] = " ";
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i++) if (src[i] !== "\n") out[i] = " ";
    } else {
      i++;
    }
  }
  return out.join("");
}

/** Every `getByName("<name>") { … }` block: its name and its body. */
function namedBlocks(code) {
  const blocks = [];
  for (const m of code.matchAll(/getByName\("([^"]+)"\)\s*\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < code.length && depth; i++) {
      if (code[i] === '"') {
        i++;
        while (i < code.length && code[i] !== '"' && code[i] !== "\n") i += code[i] === "\\" ? 2 : 1;
      } else if (code[i] === "{") depth++;
      else if (code[i] === "}") depth--;
    }
    if (!depth) blocks.push({ name: m[1], body: code.slice(start, i - 1) });
  }
  return blocks;
}

const CREATE_CMP_JSON = "create-cmp.json";
const GOOGLE_SERVICES_FILE = "composeApp/google-services.json";
const DEMO_PREFIX = "demo-";

/** Where `create-cmp add firebase` declares the emulator ports, for the app's own package. */
function portsFileFor(pkg) {
  return ["composeApp", "src", "commonMain", "kotlin", ...pkg.split("."), "data", "remote", "FirebaseConfig.kt"].join("/");
}

function readText(appDir, rel, what) {
  const abs = path.join(appDir, rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`the stamped app has no ${rel} — nothing declares ${what}. Did \`create-cmp add firebase\` run on it?`);
  }
  return fs.readFileSync(abs, "utf8");
}

function readJson(appDir, rel, what) {
  const text = readText(appDir, rel, what);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${rel} in the stamped app is not JSON (${e.message}) — it cannot say ${what}`);
  }
}

function refuseUnlessDemo(project, where) {
  if (typeof project !== "string" || !project.startsWith(DEMO_PREFIX)) {
    throw new Error(
      `${where} names the Firebase project ${JSON.stringify(project ?? null)}, which is not a ${DEMO_PREFIX} id — the Emulator ` +
        `Suite runs as the app's own project, and only a ${DEMO_PREFIX} project is one the CLI never treats as real`,
    );
  }
  return project;
}

/**
 * Where the stamped app's Firebase redirect points, read from the stamped tree,
 * each fact from the one file that spells it:
 *
 *   host     the ONE build type in composeApp/build.gradle.kts that sets
 *            `USE_FIREBASE_EMULATORS` true, and the `FIREBASE_EMULATOR_HOST` it
 *            declares beside the flag
 *   ports    `const val FIREBASE_<SERVICE>_EMULATOR_PORT = n` in
 *            composeApp/src/commonMain/kotlin/<package>/data/remote/FirebaseConfig.kt,
 *            at the package create-cmp.json records
 *   project  composeApp/google-services.json's `project_info.project_id`,
 *            refused unless it is a `demo-` id
 *
 * Refuses rather than guesses: no redirecting build type, or more than one, a
 * redirect with no host, no port, or no demo- project is an error naming what
 * it found.
 *
 * @returns {{ file: string, buildType: string, host: string, ports: Record<string, number>, project: string, portsFile: string, projectFile: string }}
 */
export function readDeclaredRedirect(appDir) {
  const code = maskComments(readText(appDir, GRADLE_FILE, "where its Firebase redirect points"));
  const on = /buildConfigField\(\s*"boolean"\s*,\s*"USE_FIREBASE_EMULATORS"\s*,\s*"true"\s*\)/;
  const redirecting = namedBlocks(code).filter((b) => on.test(b.body));
  if (!redirecting.length) {
    throw new Error(
      `no build type in ${GRADLE_FILE} sets USE_FIREBASE_EMULATORS to true — the stamped app declares no emulator ` +
        "redirect, so there is nothing for this run's Emulator Suite to serve",
    );
  }
  if (redirecting.length > 1) {
    throw new Error(
      `more than one build type (${redirecting.map((b) => b.name).join(", ")}) in ${GRADLE_FILE} sets USE_FIREBASE_EMULATORS ` +
        "to true — which one the lane installs is not this script's to guess",
    );
  }
  const [block] = redirecting;
  const host = /buildConfigField\(\s*"String"\s*,\s*"FIREBASE_EMULATOR_HOST"\s*,\s*"\\"([^"\\]*)\\""\s*\)/.exec(block.body)?.[1];
  if (!host) {
    throw new Error(
      `the ${block.name} build type in ${GRADLE_FILE} turns the emulator redirect on but declares no FIREBASE_EMULATOR_HOST — ` +
        "the suite cannot be pointed at what the app does not say",
    );
  }

  const pkg = readJson(appDir, CREATE_CMP_JSON, "the app's package, where its emulator ports are declared").package;
  if (typeof pkg !== "string" || !/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/.test(pkg)) {
    throw new Error(`${CREATE_CMP_JSON} records no usable package (${JSON.stringify(pkg ?? null)}) — the emulator ports cannot be found`);
  }
  const portsFile = portsFileFor(pkg);
  const config = maskComments(readText(appDir, portsFile, "the emulator ports its redirect uses"));
  const ports = {};
  for (const m of config.matchAll(/^[ \t]*const\s+val\s+FIREBASE_([A-Z_]+)_EMULATOR_PORT\s*(?::\s*Int\s*)?=\s*(\d+)[ \t]*$/gm)) {
    ports[m[1].toLowerCase()] = Number(m[2]);
  }
  if (!Object.keys(ports).length) {
    throw new Error(
      `${portsFile} declares no \`const val FIREBASE_<SERVICE>_EMULATOR_PORT\` — the suite cannot serve ports the app does not say`,
    );
  }

  const project = refuseUnlessDemo(
    readJson(appDir, GOOGLE_SERVICES_FILE, "the Firebase project the app asks for").project_info?.project_id,
    GOOGLE_SERVICES_FILE,
  );
  return { file: GRADLE_FILE, buildType: block.name, host, ports, project, portsFile, projectFile: GOOGLE_SERVICES_FILE };
}

// The Android emulator's fixed alias for the host machine's loopback. The fleet
// lane boots an Android emulator, so this is the only redirect host this run can
// serve: the suite binds the loopback the alias leads to.
const ANDROID_HOST_ALIAS = "10.0.2.2";
const HOST_LOOPBACK = "127.0.0.1";

// Emulators the Firebase CLI starts from a port alone, for a `demo-` project.
const PORT_SERVED = new Set(["auth", "firestore", "storage", "database"]);
// Emulators that serve CODE: the CLI starts them only for a codebase firebase.json names.
const CODEBASE_SERVED = {
  functions:
    "the Functions emulator serves a codebase (firebase.json `functions.source`), not a port, and the stamped app ships " +
    "none — its redirect is still configured at startup; nothing answers on it",
};

/**
 * What this run serves, from what the stamped app declares.
 *
 * The project is the app's OWN `demo-` id, so the suite answers the project the
 * app asks for with no override. For a `demo-` id the Firebase CLI makes no
 * production call — no real project, no login (firebase-tools lib/emulator/
 * controller.js, `isDemoProject`). That it starts with no network at all is not
 * verified here.
 */
export function emulatorPlanFor(redirect) {
  if (redirect.host !== ANDROID_HOST_ALIAS) {
    throw new Error(
      `the stamped app redirects Firebase to ${redirect.host}, but the fleet lane runs it on an Android emulator, where only ` +
        `${ANDROID_HOST_ALIAS} reaches this host's loopback — the suite would listen where the app is not looking`,
    );
  }
  const project = refuseUnlessDemo(redirect.project, redirect.projectFile ?? GOOGLE_SERVICES_FILE);
  const served = [];
  const unserved = [];
  for (const [service, port] of Object.entries(redirect.ports)) {
    if (CODEBASE_SERVED[service]) unserved.push({ service, port, reason: CODEBASE_SERVED[service] });
    else if (PORT_SERVED.has(service)) served.push({ service, port });
    else unserved.push({ service, port, reason: `the Firebase CLI has no "${service}" emulator to serve it` });
  }
  const sources = [`${redirect.file} (${redirect.buildType})`, redirect.portsFile, redirect.projectFile].filter(Boolean);
  return {
    project,
    host: HOST_LOOPBACK,
    appHost: redirect.host,
    declaredIn: sources.join("; "),
    served,
    unserved,
  };
}

/**
 * The firebase.json the suite starts from: the served ports and nothing else.
 * No `singleProjectMode` override — the suite runs as the project the app
 * names. No UI: nothing here looks at it, and it would hold a port of its own.
 */
export function firebaseJsonFor(plan) {
  const emulators = {};
  for (const { service, port } of plan.served) emulators[service] = { host: plan.host, port };
  emulators.ui = { enabled: false };
  return { emulators };
}

// ── What the record says the run covered ────────────────────────────────────

/** What a Firebase run proves and does not: KD-210, in one sentence. */
const TRAFFIC_REASON =
  "nothing in the template's commonMain calls a Firebase client and the lane's smoke walk is four screens, so the suite " +
  "serves no request: this run proves compile, init and the redirect at startup, not traffic through it (KD-210)";

/**
 * The Firebase record's statement of coverage, from the plan the suite actually
 * served and the `e2eSmoke` step the lane actually ran — the step that installs
 * the DEBUG build, where the redirect runs.
 *
 * @param {{ plan: object, e2eSmoke?: { name?: string, verdict?: string } | null }} args
 */
export function coverageFor({ plan, e2eSmoke }) {
  return {
    firebase: true,
    add: "create-cmp add firebase --no-verify",
    emulators: {
      project: plan.project,
      host: plan.host,
      appHost: plan.appHost,
      declaredIn: plan.declaredIn,
      served: Object.fromEntries(plan.served.map((s) => [s.service, s.port])),
      unserved: plan.unserved,
    },
    redirect: { buildType: "debug", provenBy: "e2eSmoke", verdict: e2eSmoke?.verdict ?? null },
    trafficThroughRedirect: false,
    trafficReason: TRAFFIC_REASON,
    ios: false,
    iosReason: IOS_REASON,
  };
}

/** The default run's statement of coverage: it never executed Firebase, and says which run does. */
export function defaultCoverage() {
  return {
    firebase: false,
    firebaseReason:
      "this run proved the app the fleet stamp makes, and `create-cmp add firebase` was not run on it, so nothing here " +
      `executed the template's Firebase code. \`fleet-check ${WITH_FIREBASE_FLAG}\` is the run that adds it and executes it ` +
      "inside the Firebase Emulator Suite (KD-45).",
  };
}

// ── Running the lane inside the suite ───────────────────────────────────────

/** Written by the lane script as its first act — the CLI runs the script only once the suite is up. */
export const LANE_STARTED_MARKER = "lane-started";

const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/** Does anything accept a connection on host:port? */
export function portAnswers(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (v) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

const holderHint = (port) => `find the holder with \`lsof -nP -iTCP:${port} -sTCP:LISTEN\``;

/**
 * Run the lane inside `firebase emulators:exec`, and stop the suite on every
 * exit path.
 *
 * The CLI owns the normal teardown: it runs the script, then shuts every
 * emulator down whatever the script's status (commandUtils.js `emulatorExec`,
 * `finally { cleanShutdown() }`). What this adds is what the CLI cannot do for
 * itself: refuse ports someone else already holds; start it in its own process
 * group, so one signal reaches the CLI and the lane together; forward exactly
 * one signal (the CLI treats a second as "stop right now" and skips its clean
 * shutdown, leaving the detached Firestore JVM up); escalate to SIGKILL only past
 * a budget; and CHECK afterwards that every served port was released.
 *
 * `registry` receives `{ pid, interrupt(sig), abandon() }` while the suite
 * runs — the caller's signal handler awaits `interrupt`, its exit handler calls
 * `abandon` (synchronous: an exit handler cannot await).
 *
 * @returns {Promise<{ status: number|null, laneStarted: boolean, failures: string[] }>}
 */
export async function runLaneUnderEmulators({
  plan,
  workDir,
  appDir,
  laneArgv,
  spawnImpl = spawn,
  probePort = portAnswers,
  killGroup = (pid, sig) => process.kill(-pid, sig),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  registry = new Set(),
  graceMs = 10_000,
  budgetMs = 60_000,
  log = (line) => process.stderr.write(`${line}\n`),
  env = process.env,
}) {
  const held = async () => {
    const out = [];
    for (const s of plan.served) if (await probePort(plan.host, s.port)) out.push(s);
    return out;
  };
  const describe = (list) => list.map((s) => `${s.service} ${plan.host}:${s.port}`).join(", ");

  // Before: a port already answering is someone else's. Starting over it would
  // fail in the CLI at best, and at worst hand the app a server nobody here
  // started — and the "released afterwards" check below would blame this run.
  const busy = await held();
  if (busy.length) {
    return {
      status: null,
      laneStarted: false,
      failures: [
        `emulator port(s) already in use before the run: ${describe(busy)} — the stamped app would talk to whatever ` +
          `holds them, so the suite was not started (${holderHint(busy[0].port)}; it is not this run's to stop)`,
      ],
    };
  }

  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(path.join(workDir, "firebase.json"), `${JSON.stringify(firebaseJsonFor(plan), null, 2)}\n`);
  const marker = path.join(workDir, LANE_STARTED_MARKER);
  fs.rmSync(marker, { force: true });
  // `exec` so the lane replaces the shell: a signal to the group reaches it as itself.
  const script = `: > ${shq(marker)} && cd ${shq(appDir)} && exec ${laneArgv.map(shq).join(" ")}`;
  const argv = ["emulators:exec", "--project", plan.project, "--only", plan.served.map((s) => s.service).join(","), script];

  const child = spawnImpl("firebase", argv, { cwd: workDir, env, stdio: ["ignore", "inherit", "inherit"], detached: true });
  const exited = new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal, error: null }));
    child.once("error", (error) => resolve({ code: null, signal: null, error }));
  });
  let finished = false;
  exited.then(() => {
    finished = true;
  });
  const send = (sig) => {
    try {
      killGroup(child.pid, sig);
    } catch {
      /* already gone */
    }
  };
  const within = (ms) =>
    Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), ms).unref?.())]);
  const releasedOrHeld = async () => {
    const tries = Math.max(1, Math.ceil(graceMs / 250));
    let still = [];
    for (let i = 0; i < tries; i++) {
      still = await held();
      if (!still.length) return [];
      if (i < tries - 1) await sleep(250);
    }
    return still;
  };

  let signalled = false;
  let interruption = null;
  const entry = {
    pid: child.pid,
    interrupt(sig) {
      if (interruption) return interruption;
      interruption = (async () => {
        if (!finished && !signalled) {
          signalled = true;
          send(sig);
        }
        if (!(await within(budgetMs))) {
          log(`fleet-check: the Firebase Emulator Suite did not stop within ${budgetMs / 1000}s of ${sig} — killing its process group`);
          send("SIGKILL");
          await within(budgetMs);
        }
        const still = await releasedOrHeld();
        for (const s of still) {
          log(`fleet-check: ${s.service} is still holding ${plan.host}:${s.port} after the suite was stopped — ${holderHint(s.port)}`);
        }
        return still;
      })();
      return interruption;
    },
    abandon() {
      if (finished || signalled) return;
      signalled = true;
      send("SIGINT");
    },
  };
  registry.add(entry);

  const outcome = await exited;
  if (interruption) await interruption;
  registry.delete(entry);

  const laneStarted = fs.existsSync(marker);
  const failures = [];
  if (outcome.error) {
    failures.push(`the Firebase CLI could not be started: ${outcome.error.message} — so the lane never ran`);
  } else if (!laneStarted) {
    failures.push(
      `the Firebase Emulator Suite did not start (firebase exited ${outcome.code ?? outcome.signal}), so the lane never ran — ` +
        `the CLI's own output above says why; its logs are in ${workDir}`,
    );
  }
  const still = await releasedOrHeld();
  if (still.length) {
    failures.push(
      `emulator port(s) still answering after the suite exited: ${describe(still)} — teardown did not complete ` +
        `(${holderHint(still[0].port)})`,
    );
  }
  return { status: outcome.code, laneStarted, failures };
}
