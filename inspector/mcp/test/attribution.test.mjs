import { test } from "node:test";
import assert from "node:assert/strict";

import { attributeCrash } from "../src/lib/attribution.mjs";

const npeCrash = {
  timestamp: "2026-07-18T10:00:00.000Z",
  exception: "java.lang.NullPointerException",
  message: "Attempt to invoke virtual method on a null object reference",
  frames: [
    { className: "com.example.app.presentation.home.HomeViewModel", methodName: "onItemClick", fileName: "HomeViewModel.kt", lineNumber: 42 },
    { className: "com.example.app.presentation.home.HomeScreenKt", methodName: "HomeScreen", fileName: "HomeScreen.kt", lineNumber: 71 },
    { className: "android.app.Activity", methodName: "performCreate", fileName: "Activity.java", lineNumber: 8000 },
  ],
};

test("attributeCrash: a frame's fileName matching a recently-changed file is 'likely'", () => {
  const result = attributeCrash(npeCrash, ["composeApp/src/commonMain/kotlin/com/example/app/presentation/home/HomeViewModel.kt"]);
  assert.equal(result.verdict, "likely-caused-by-recent-edit");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].matchedOn, "fileName");
  assert.equal(result.evidence[0].frame.fileName, "HomeViewModel.kt");
  assert.match(result.evidence[0].changedFile, /HomeViewModel\.kt$/);
});

test("attributeCrash: no overlap between frames and changed files is 'no-recent-edit-implicated'", () => {
  const result = attributeCrash(npeCrash, ["composeApp/src/commonMain/kotlin/com/example/app/presentation/profile/ProfileScreen.kt"]);
  assert.equal(result.verdict, "no-recent-edit-implicated");
  assert.deepEqual(result.evidence, []);
});

test("attributeCrash: no changed files at all is 'no-recent-edit-implicated', never throws", () => {
  assert.equal(attributeCrash(npeCrash, []).verdict, "no-recent-edit-implicated");
  assert.equal(attributeCrash(npeCrash, undefined).verdict, "no-recent-edit-implicated");
});

test("attributeCrash: falls back to className-derived filename when frame.fileName is absent (obfuscated stack)", () => {
  const obfuscated = {
    frames: [{ className: "com.example.app.presentation.home.HomeViewModel", methodName: "a", fileName: null, lineNumber: -1 }],
  };
  const result = attributeCrash(obfuscated, ["composeApp/.../HomeViewModel.kt"]);
  assert.equal(result.verdict, "likely-caused-by-recent-edit");
  assert.equal(result.evidence[0].matchedOn, "className");
});

test("attributeCrash: multiple matching frames all show up as evidence", () => {
  const result = attributeCrash(npeCrash, [
    "composeApp/src/commonMain/kotlin/com/example/app/presentation/home/HomeViewModel.kt",
    "composeApp/src/commonMain/kotlin/com/example/app/presentation/home/HomeScreen.kt",
  ]);
  assert.equal(result.evidence.length, 2);
  assert.deepEqual(result.evidence.map((e) => e.frame.fileName).sort(), ["HomeScreen.kt", "HomeViewModel.kt"]);
});

test("attributeCrash: changedFilesConsidered echoes back exactly what was passed (minus falsy)", () => {
  const result = attributeCrash(npeCrash, ["a.kt", null, "b.kt", "", undefined]);
  assert.deepEqual(result.changedFilesConsidered, ["a.kt", "b.kt"]);
});

test("attributeCrash: a crash with no frames never throws", () => {
  assert.equal(attributeCrash({}, ["a.kt"]).verdict, "no-recent-edit-implicated");
  assert.equal(attributeCrash(null, ["a.kt"]).verdict, "no-recent-edit-implicated");
});

test("attributeCrash: inner-class frames (HomeViewModel$1) still match via the simple name", () => {
  const inner = { frames: [{ className: "com.example.app.presentation.home.HomeViewModel$1", fileName: null }] };
  const result = attributeCrash(inner, ["composeApp/.../HomeViewModel.kt"]);
  assert.equal(result.verdict, "likely-caused-by-recent-edit");
});
