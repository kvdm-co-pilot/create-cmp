import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { convertUiautomatorXml, parseBounds } from "../src/lib/uiautomator.mjs";
import { walk, findByTestTag } from "../src/lib/tree.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const XML = readFileSync(join(here, "..", "fixtures", "uiautomator-page.xml"), "utf8");

test("converts the fixture page source to the contract shape", () => {
  const tree = convertUiautomatorXml(XML);
  assert.equal(tree.schemaVersion, 1);
  assert.equal(tree.source, "uiautomator");
  assert.ok(tree.root && typeof tree.root === "object");
  // Every node carries the contract fields; designToken is ALWAYS null.
  for (const { node } of walk(tree)) {
    assert.ok(node.bounds && typeof node.bounds.x === "number");
    assert.ok(Array.isArray(node.children));
    assert.equal(node.designToken, null);
  }
});

test("bounds are parsed and normalized root-relative (status bar offset removed)", () => {
  const tree = convertUiautomatorXml(XML);
  // Root was [0,63][1080,2337] → origin subtracted.
  assert.deepEqual(tree.root.bounds, { x: 0, y: 0, width: 1080, height: 2274 });
  // home_title was [44,107][214,166] → y normalized by the root's 63px origin.
  const title = findByTestTag(tree, "home_title").node;
  assert.deepEqual(title.bounds, { x: 44, y: 44, width: 170, height: 59 });
});

test("resource-id tail → testTag; empty resource-id → null", () => {
  const tree = convertUiautomatorXml(XML);
  assert.ok(findByTestTag(tree, "home_screen"));
  assert.ok(findByTestTag(tree, "retry_button"));
  const title = findByTestTag(tree, "home_title").node;
  assert.equal(title.text, "Home");
  // the card has no resource-id → null testTag, but content-desc mapped
  const card = [...walk(tree)].find(({ node }) => node.contentDescription === "First item card");
  assert.ok(card);
  assert.equal(card.node.testTag, null);
});

test("class tail → role; clickable/enabled → clickable/disabled", () => {
  const tree = convertUiautomatorXml(XML);
  const retry = findByTestTag(tree, "retry_button").node;
  assert.equal(retry.role, "Button");
  assert.equal(retry.clickable, true);
  assert.equal(retry.disabled, true); // enabled="false"
  const title = findByTestTag(tree, "home_title").node;
  assert.equal(title.role, "TextView");
  assert.equal(title.clickable, false);
  assert.equal(title.disabled, false);
});

test("XML entities in text are decoded", () => {
  const tree = convertUiautomatorXml(XML);
  const label = [...walk(tree)].find(({ node }) => node.text && node.text.includes("&"));
  assert.equal(label.node.text, "Item One & Friends");
});

test("empty text / content-desc map to null", () => {
  const tree = convertUiautomatorXml(XML);
  assert.equal(tree.root.text, null);
  assert.equal(tree.root.contentDescription, null);
});

test("parseBounds rejects malformed input clearly", () => {
  assert.throws(() => parseBounds("[0,0][10]"), /malformed bounds/);
  assert.throws(() => parseBounds("nonsense"), /malformed bounds/);
  assert.deepEqual(parseBounds("[10,20][110,220]"), { x: 10, y: 20, width: 100, height: 200 });
});

test("empty / malformed XML fails with a clear error", () => {
  assert.throws(() => convertUiautomatorXml(""), /empty XML/);
  assert.throws(() => convertUiautomatorXml("<hierarchy><node></hierarchy>"), /malformed XML/);
});
