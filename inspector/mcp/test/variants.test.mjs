// variants.mjs — the Design System tab's genesis candidates strip data
// (GENESIS-FLOW-DESIGN.md §2): a pure disk scan of
// composeApp/build/previews/variants/<name>/, never fabricating a screen a
// variant doesn't actually have a screen.png for.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getVariantsData } from "../src/lib/variants.mjs";

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cmp-variants-"));
}

test("getVariantsData: {available:false} when there's no previews/ dir at all", () => {
  const root = makeRoot();
  try {
    assert.deepEqual(getVariantsData(root), { available: false });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getVariantsData: {available:false} when previews/ exists but variants/ doesn't", () => {
  const root = makeRoot();
  try {
    fs.mkdirSync(path.join(root, "composeApp", "build", "previews"), { recursive: true });
    assert.deepEqual(getVariantsData(root), { available: false });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getVariantsData: {available:false} when variants/ exists but is empty — no candidates yet is honest, not an error", () => {
  const root = makeRoot();
  try {
    fs.mkdirSync(path.join(root, "composeApp", "build", "previews", "variants"), { recursive: true });
    assert.deepEqual(getVariantsData(root), { available: false });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getVariantsData: one variant, two screens with PNGs, design-system.json stashed", () => {
  const root = makeRoot();
  try {
    const variantDir = path.join(root, "composeApp", "build", "previews", "variants", "warmer");
    fs.mkdirSync(path.join(variantDir, "home"), { recursive: true });
    fs.mkdirSync(path.join(variantDir, "shell"), { recursive: true });
    fs.writeFileSync(path.join(variantDir, "home", "screen.png"), Buffer.from([0x89, 0x50]));
    fs.writeFileSync(path.join(variantDir, "shell", "screen.png"), Buffer.from([0x89, 0x50]));
    fs.writeFileSync(path.join(variantDir, "design-system.json"), "{}");

    const data = getVariantsData(root);
    assert.equal(data.available, true);
    assert.equal(data.variants.length, 1);
    const v = data.variants[0];
    assert.equal(v.name, "warmer");
    assert.equal(v.hasDesignSystem, true);
    assert.deepEqual(
      v.screens,
      [
        { id: "home", png: "variants/warmer/home/screen.png" },
        { id: "shell", png: "variants/warmer/shell/screen.png" },
      ],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getVariantsData: a screen dir with no screen.png yet is never fabricated into the list; hasDesignSystem false when absent", () => {
  const root = makeRoot();
  try {
    const variantDir = path.join(root, "composeApp", "build", "previews", "variants", "rounded");
    fs.mkdirSync(path.join(variantDir, "home"), { recursive: true }); // no screen.png written

    const data = getVariantsData(root);
    assert.equal(data.available, true);
    const v = data.variants[0];
    assert.deepEqual(v.screens, []);
    assert.equal(v.hasDesignSystem, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getVariantsData: multiple variants sorted by name", () => {
  const root = makeRoot();
  try {
    const variantsDir = path.join(root, "composeApp", "build", "previews", "variants");
    for (const name of ["rounded-v2", "cool", "warmer"]) {
      fs.mkdirSync(path.join(variantsDir, name), { recursive: true });
    }
    const data = getVariantsData(root);
    assert.deepEqual(
      data.variants.map((v) => v.name),
      ["cool", "rounded-v2", "warmer"],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
