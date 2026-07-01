// Scaffold pipeline (CONTRACT §"Scaffold pipeline"):
//   (a) validate config against options.schema.json
//   (b) copy template/ → targetDir
//   (c) token-replace contents AND paths
//   (d) rename package source dirs com/example/app → __PACKAGE_PATH__ (atomic)
//   (e) toggle features (strip cmp:feature blocks + delete manifest paths)
//   (f) run the verify gate
//
// No LLM in this hot path — pure deterministic Node.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validate, formatErrors } from "./lib/schema.mjs";
import { buildTokenMap, replaceTokens, replacePathTokens, isBinaryPath, slugifyAppName } from "./lib/tokens.mjs";
import { renamePackageDirs } from "./lib/rename.mjs";
import {
  stripFeatureBlocks,
  disabledFeaturesFromConfig,
  deleteDisabledFeaturePaths,
} from "./lib/toggle.mjs";
import { copyDir, listFiles, listDirsDeepestFirst } from "./lib/fsutil.mjs";
import { runVerify, printVerifyVerdict } from "./lib/verify.mjs";
import { colors, step, ok, warn } from "./lib/log.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

/**
 * @param {object} opts
 * @param {string} [opts.schemaPath] override path to options.schema.json
 * @param {string} [opts.templateDir] override path to template/
 */
export function loadSchema(opts = {}) {
  const schemaPath = opts.schemaPath || path.join(REPO_ROOT, "options.schema.json");
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

/**
 * Validate the engine config. Throws a descriptive error on failure.
 * @param {object} config
 * @param {object} [opts]
 */
export function validateConfig(config, opts = {}) {
  const schema = loadSchema(opts);
  const { valid, errors } = validate(config, schema);
  if (!valid) {
    const err = new Error(`Invalid config:\n${formatErrors(errors)}`);
    err.validationErrors = errors;
    throw err;
  }
  return true;
}

/**
 * Load template/manifest.json.
 * @param {string} templateDir
 */
export function loadManifest(templateDir) {
  const p = path.join(templateDir, "manifest.json");
  if (!fs.existsSync(p)) {
    throw new Error(`template manifest not found at ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * Apply token replacement to every text file's CONTENT under projectDir.
 */
function replaceContents(projectDir, tokenMap, manifestRel) {
  for (const file of listFiles(projectDir)) {
    // Never rewrite the manifest we copied in (and we delete it at the end).
    if (manifestRel && path.resolve(file) === path.resolve(path.join(projectDir, manifestRel))) {
      continue;
    }
    if (isBinaryPath(file)) continue;
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const replaced = replaceTokens(content, tokenMap);
    if (replaced !== content) {
      fs.writeFileSync(file, replaced);
    }
  }
}

/**
 * Rename directories whose names contain tokens (PATH replacement), deepest
 * first so nested renames don't invalidate parent paths. Note: the package
 * source dirs are renamed separately/atomically by renamePackageDirs against
 * the literal com/example/app segment — here we only handle token-bearing
 * path segments like __APP_NAME__ in a folder name.
 */
function replaceDirPaths(projectDir, tokenMap) {
  for (const dir of listDirsDeepestFirst(projectDir)) {
    const base = path.basename(dir);
    const renamedBase = replacePathTokens(base, tokenMap);
    if (renamedBase !== base) {
      const target = path.join(path.dirname(dir), renamedBase);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (fs.existsSync(target)) {
        // Merge into existing target.
        for (const e of fs.readdirSync(dir)) {
          fs.renameSync(path.join(dir, e), path.join(target, e));
        }
        fs.rmdirSync(dir);
      } else {
        fs.renameSync(dir, target);
      }
    }
  }
}

/**
 * Rename token-bearing FILE names (path replacement for files).
 */
function replaceFilePaths(projectDir, tokenMap) {
  for (const file of listFiles(projectDir)) {
    const base = path.basename(file);
    const renamedBase = replacePathTokens(base, tokenMap);
    if (renamedBase !== base) {
      const target = path.join(path.dirname(file), renamedBase);
      fs.renameSync(file, target);
    }
  }
}

/**
 * Strip cmp:feature marker blocks for disabled features from every text file.
 * Always runs (even with an empty disabled set) so that ENABLED features' marker
 * comment lines are also removed — the shipped output must carry no marker noise.
 */
function stripDisabledBlocks(projectDir, disabled) {
  for (const file of listFiles(projectDir)) {
    if (isBinaryPath(file)) continue;
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!content.includes("cmp:feature")) continue;
    const { content: out, changed } = stripFeatureBlocks(content, disabled);
    if (changed) fs.writeFileSync(file, out);
  }
}

/**
 * Resolve the Android SDK location from the environment or the conventional
 * install path, then write `local.properties` (sdk.dir) into the project so
 * Gradle can locate the SDK. No-op if the file already exists (respect a
 * user-provided one) or if no SDK dir can be found and env vars are unset.
 * @param {string} projectDir
 */
function writeLocalProperties(projectDir) {
  const target = path.join(projectDir, "local.properties");
  if (fs.existsSync(target)) return;

  const envHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const conventional = path.join(os.homedir(), "Library", "Android", "sdk");
  let sdkDir = null;
  if (envHome && fs.existsSync(envHome)) {
    sdkDir = envHome;
  } else if (fs.existsSync(conventional)) {
    sdkDir = conventional;
  } else if (fs.existsSync(path.join(os.homedir(), "Android", "Sdk"))) {
    sdkDir = path.join(os.homedir(), "Android", "Sdk"); // Linux default
  }
  // If env vars are set, Gradle resolves the SDK on its own; only write the
  // file when we actually located a directory.
  if (!sdkDir) return;
  fs.writeFileSync(target, `sdk.dir=${sdkDir}\n`);
}

/**
 * Replace the (already token-substituted) app display name with a slugified,
 * identifier-safe form in the few files that demand it: Gradle's
 * rootProject.name and the appium npm package name. Idempotent and a no-op when
 * the name is already slug-safe.
 * @param {string} projectDir
 * @param {string} appName raw display name (may contain spaces)
 */
function applyAppNameSlug(projectDir, appName) {
  const slug = slugifyAppName(appName);
  if (slug === appName) return; // already safe — nothing to do

  // settings.gradle.kts: rootProject.name = "Demo App" -> "Demo-App"
  const settings = path.join(projectDir, "settings.gradle.kts");
  if (fs.existsSync(settings)) {
    const src = fs.readFileSync(settings, "utf8");
    const out = src.replace(
      /(rootProject\.name\s*=\s*")([^"]*)(")/,
      (_m, a, _name, c) => `${a}${slug}${c}`
    );
    if (out !== src) fs.writeFileSync(settings, out);
  }

  // qa/appium/package.json: "name": "Demo App-appium" -> "demo-app-appium"
  const pkg = path.join(projectDir, "qa", "appium", "package.json");
  if (fs.existsSync(pkg)) {
    try {
      const json = JSON.parse(fs.readFileSync(pkg, "utf8"));
      if (typeof json.name === "string" && json.name.includes(appName)) {
        json.name = json.name.split(appName).join(slug).toLowerCase();
        fs.writeFileSync(pkg, `${JSON.stringify(json, null, 2)}\n`);
      }
    } catch {
      // leave as-is on parse failure
    }
  }
}

/**
 * Run the full scaffold pipeline.
 * @param {object} config engine config object (CONTRACT)
 * @param {object} [opts]
 * @param {string} [opts.templateDir]
 * @param {string} [opts.schemaPath]
 * @param {boolean} [opts.verify=true]
 * @param {boolean} [opts.dryRunVerify=false]
 * @param {boolean} [opts.force=false] allow non-empty targetDir
 * @returns {Promise<{projectDir:string, verdict:(object|null), manifest:object}>}
 */
export async function scaffold(config, opts = {}) {
  const templateDir = opts.templateDir || path.join(REPO_ROOT, "template");
  const doVerify = opts.verify !== false;

  // (a) validate
  step("Validating config…");
  validateConfig(config, { schemaPath: opts.schemaPath });

  if (!fs.existsSync(templateDir)) {
    throw new Error(`template directory not found at ${templateDir}`);
  }
  const manifest = loadManifest(templateDir);

  const projectDir = path.resolve(config.targetDir);
  if (fs.existsSync(projectDir)) {
    const entries = fs.readdirSync(projectDir).filter((e) => e !== "." && e !== "..");
    if (entries.length > 0 && !opts.force) {
      throw new Error(
        `target directory ${projectDir} is not empty (pass force to overwrite)`
      );
    }
  }

  // (b) copy template → targetDir
  step(`Copying template → ${colors.cyan(projectDir)}`);
  copyDir(templateDir, projectDir);

  const tokenMap = buildTokenMap(config);

  // (c) token-replace contents AND paths
  step("Replacing tokens (file contents)…");
  replaceContents(projectDir, tokenMap, "manifest.json");

  // (d) rename package source dirs (ATOMIC) — do this BEFORE generic path
  //     token replace so the literal com/example/app is intact.
  step("Renaming package source directories…");
  const packageRoots = manifest.packageSourceRoots || [];
  const packagePath = config.package.replace(/\./g, "/");
  renamePackageDirs(projectDir, packageRoots, packagePath, {
    log: (m) => process.stdout.write(`${m}\n`),
  });

  // (c, paths) token-replace remaining token-bearing dir + file names
  step("Replacing tokens (paths)…");
  replaceDirPaths(projectDir, tokenMap);
  replaceFilePaths(projectDir, tokenMap);

  // (c.1) Slugify the app name where a space-free identifier is required.
  // The display name (__APP_NAME__) may contain spaces (Android label, iOS
  // CFBundleDisplayName), but Gradle rootProject.name and the npm package name
  // must not. See manifest stampPipeline step 5.
  applyAppNameSlug(projectDir, config.appName);

  // (e) toggle features. Always strip marker comments (even for enabled
  // features) so no marker noise ships; delete paths only for disabled ones.
  const disabled = disabledFeaturesFromConfig(config);
  step(
    disabled.size > 0
      ? `Toggling features off: ${[...disabled].join(", ")}`
      : "Cleaning feature markers…"
  );
  stripDisabledBlocks(projectDir, disabled);
  if (disabled.size > 0) {
    deleteDisabledFeaturePaths(projectDir, manifest, disabled, (m) =>
      process.stdout.write(`${m}\n`)
    );
  }

  // Write local.properties (sdk.dir) so the Gradle build can find the Android
  // SDK even when ANDROID_HOME/ANDROID_SDK_ROOT aren't exported (manifest
  // stampPipeline step 7). Skip silently if no SDK is found and env vars are
  // unset — the verify step will surface the real error.
  writeLocalProperties(projectDir);

  // Drop engine-only artifacts from the stamped output (the manifest and any
  // template extraction notes — engine-only handoff files that are not part of
  // a generated app).
  for (const artifact of ["manifest.json", "EXTRACTION-NOTES.md"]) {
    const abs = path.join(projectDir, artifact);
    if (fs.existsSync(abs)) fs.rmSync(abs);
  }

  ok("Scaffold complete.");

  // (f) verify gate
  let verdict = null;
  if (doVerify) {
    step("Running verify gate (north-star: prove GREEN)…");
    verdict = await runVerify({
      projectDir,
      manifest,
      config,
      dryRun: !!opts.dryRunVerify,
    });
    printVerifyVerdict(verdict);
  } else {
    warn("Verify skipped (--no-verify): GREEN build is NOT proven.");
  }

  return { projectDir, verdict, manifest };
}
