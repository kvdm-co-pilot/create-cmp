// console-tabs.mjs — pure (data) -> html generators for the Design System,
// Architecture, Approvals, Specs, and Comments gallery tabs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  designSystemTabHtml,
  approvalsTabHtml,
  specsTabHtml,
  architectureTabHtml,
  commentsTabHtml,
  commentControlHtml,
} from "../src/lib/console-tabs.mjs";

test("designSystemTabHtml: unavailable -> honest empty-state explaining how to produce a catalog", () => {
  const html = designSystemTabHtml({ available: false });
  assert.match(html, /No design-system catalog available yet/);
  assert.match(html, /design-system\.json/);
  assert.match(html, /connect_live/);
});

test("designSystemTabHtml: available (previews source) -> swatch grid + dimens table, never fabricated", () => {
  const html = designSystemTabHtml({
    available: true,
    source: "previews",
    catalog: { colors: { Primary: "#0A2540" }, dimens: { PaddingPage: "16dp" } },
  });
  assert.match(html, /Primary/);
  assert.match(html, /#0A2540/);
  assert.match(html, /background:#0A2540/, "the swatch is actually rendered in the declared color");
  assert.match(html, /PaddingPage/);
  assert.match(html, /16dp/);
  assert.match(html, /composeApp\/build\/previews\/design-system\.json/, "source is disclosed");
});

test("designSystemTabHtml: available (live source) -> labelled distinctly; empty catalog -> honest inline notes", () => {
  const html = designSystemTabHtml({ available: true, source: "live", catalog: { colors: {}, dimens: {} } });
  assert.match(html, /inspect\/design-system/);
  assert.match(html, /no colors declared/);
  assert.match(html, /no dimens declared/);
});

test("approvalsTabHtml: unavailable -> honest not-available state, with and without a library error", () => {
  const noReason = approvalsTabHtml({ available: false });
  assert.match(noReason, /not available in this project/);
  assert.match(noReason, /older scaffold/);

  const withReason = approvalsTabHtml({ available: false, error: "kaboom" });
  assert.match(withReason, /kaboom/);
});

test("approvalsTabHtml: no governed artifacts resolved yet", () => {
  const html = approvalsTabHtml({ available: true, statuses: [] });
  assert.match(html, /No governed artifacts resolved in this project yet/);
});

test("approvalsTabHtml: §1 order numbers, status badges, short hash, and an Approve button per resolvable artifact", () => {
  const html = approvalsTabHtml({
    available: true,
    statuses: [
      {
        id: "design-system",
        label: "Design system",
        status: "approved",
        hash: "abcdef0123456789",
        storedHash: "abcdef0123456789",
        approvedAt: "2026-07-18T09:00:00.000Z",
        fileCount: 2,
        missing: [],
        resolvable: true,
      },
      {
        id: "architecture",
        label: "Architecture",
        status: "unreviewed",
        hash: "1111111100000000",
        storedHash: null,
        approvedAt: null,
        fileCount: 1,
        missing: [],
        resolvable: true,
      },
      {
        id: "exemplar-feature",
        label: "Exemplar feature",
        status: "changed-since-approval",
        hash: "222222220000",
        storedHash: "333333330000",
        approvedAt: "2026-07-01T00:00:00.000Z",
        fileCount: 9,
        missing: [],
        resolvable: true,
      },
      {
        id: "feature-spec:tags",
        label: "Feature spec (tags)",
        status: "unreviewed",
        hash: null,
        storedHash: null,
        approvedAt: null,
        fileCount: 0,
        missing: ["specs/tags.spec.md"],
        resolvable: false,
      },
    ],
  });
  // §1 ordered-walk numbering (GENESIS-FLOW-DESIGN.md §1's registry table).
  assert.match(html, /<td class="order-num">1<\/td>/, "design-system is #1");
  assert.match(html, /<td class="order-num">2<\/td>/, "architecture is #2");
  assert.match(html, /<td class="order-num">4<\/td>/, "exemplar-feature is #4");
  assert.match(html, /<td class="order-num">6<\/td>/, "feature-spec:* is #6");
  // Status badges.
  assert.match(html, /badge-approved/);
  assert.match(html, /badge-unreviewed/);
  assert.match(html, /badge-changed/);
  // Short hash + re-approve wording on an already-approved artifact.
  assert.match(html, /abcdef01/);
  assert.match(html, /Re-approve/);
  // The unresolvable artifact's button is disabled and carries the CLI's marking.
  assert.match(html, /data-artifact="feature-spec:tags"[^>]*disabled/);
  assert.match(html, /unresolvable \(0 of expected files resolved\) — not approvable/);
  assert.match(html, /missing: specs\/tags\.spec\.md/);
  // A resolvable artifact's button is NOT disabled.
  assert.doesNotMatch(html, /data-artifact="design-system"[^>]*disabled/);
  // §3 Reopen control: only on the approved row (design-system), never on the
  // others (unreviewed/changed-since-approval — reopening either is meaningless).
  assert.match(html, /<button class="reopen-btn" data-artifact="design-system">Reopen<\/button>/);
  assert.doesNotMatch(html, /data-artifact="architecture">Reopen/);
  assert.doesNotMatch(html, /data-artifact="exemplar-feature">Reopen/);
  // §2 genesis/steward banners: unreviewed -> genesis guide text; approved -> steward.
  assert.match(html, /banner-genesis">.*layer map and structural decisions/);
  assert.match(html, /banner-steward">.*frozen — drift is detected automatically/);
});

// --- §2/§3 GENESIS-FLOW-DESIGN.md additions: reopened, unshaped, banners ----

test("approvalsTabHtml: reopened status gets its own badge, distinct from unreviewed, and a genesis banner", () => {
  const html = approvalsTabHtml({
    available: true,
    statuses: [
      {
        id: "design-system",
        label: "Design system",
        status: "reopened",
        hash: "abcdef0123456789",
        storedHash: "abcdef0123456789",
        approvedAt: "2026-07-18T09:00:00.000Z",
        reopenedAt: "2026-07-19T09:00:00.000Z",
        fileCount: 2,
        missing: [],
        resolvable: true,
      },
    ],
  });
  assert.match(html, /badge-reopened">reopened/, "reopened has its own badge class + label");
  assert.doesNotMatch(html, /badge-unreviewed">reopened/, "never collapsed into the unreviewed badge");
  // Reopened behaves like unreviewed for the Approve button (it's back in genesis).
  assert.match(html, /<button class="approve-btn" data-artifact="design-system">Approve<\/button>/);
  // No Reopen button on an already-reopened row (only approved rows get one).
  assert.doesNotMatch(html, /reopen-btn/);
  // Genesis banner, same as unreviewed.
  assert.match(html, /banner-genesis">.*palette, type, and shape/);
});

test("approvalsTabHtml: mode 'defaults-accepted' renders as approved-but-unshaped, distinct from a shaped approval", () => {
  const shaped = approvalsTabHtml({
    available: true,
    statuses: [
      {
        id: "design-system",
        label: "Design system",
        status: "approved",
        hash: "abcdef0123456789",
        storedHash: "abcdef0123456789",
        approvedAt: "2026-07-18T09:00:00.000Z",
        fileCount: 2,
        missing: [],
        resolvable: true,
      },
    ],
  });
  assert.doesNotMatch(shaped, /defaults accepted/);
  assert.match(shaped, /banner-steward">.*frozen — drift is detected automatically/);
  assert.doesNotMatch(shaped, /banner-unshaped/);

  const unshaped = approvalsTabHtml({
    available: true,
    statuses: [
      {
        id: "design-system",
        label: "Design system",
        status: "approved",
        mode: "defaults-accepted",
        hash: "abcdef0123456789",
        storedHash: "abcdef0123456789",
        approvedAt: "2026-07-18T09:00:00.000Z",
        fileCount: 2,
        missing: [],
        resolvable: true,
      },
    ],
  });
  assert.match(unshaped, /approved · defaults accepted — unshaped/);
  assert.match(unshaped, /badge-approved badge-unshaped/);
  assert.match(unshaped, /banner-unshaped">.*approved with defaults — unshaped/);
  // Still gets a Reopen button — it IS approved, just unshaped.
  assert.match(unshaped, /reopen-btn" data-artifact="design-system"/);
});

test("approvalsTabHtml: tolerates an older project lib that lacks reopened/mode — absent field never fabricates a state", () => {
  // Exactly the shape getApprovalStatuses returns from a pre-reopen-wave
  // qa/lib/approvals.mjs: no `mode`, and `status` can never BE "reopened"
  // (that value doesn't exist in the older library's vocabulary at all).
  const html = approvalsTabHtml({
    available: true,
    statuses: [
      {
        id: "design-system",
        label: "Design system",
        status: "approved",
        hash: "abcdef0123456789",
        storedHash: "abcdef0123456789",
        approvedAt: "2026-07-18T09:00:00.000Z",
        fileCount: 2,
        missing: [],
        resolvable: true,
      },
    ],
  });
  assert.doesNotMatch(html, /defaults accepted/, "no mode field -> never fabricate the unshaped note");
  assert.doesNotMatch(html, /badge-unshaped/);
  assert.match(html, /badge-approved">approved/, "plain approved label, unmodified");
});

test("designSystemTabHtml: candidates strip is genesis-mode-only — absent entirely in steward mode or when status is omitted", () => {
  const variants = { available: true, variants: [{ name: "warmer", screens: [{ id: "home", png: "variants/warmer/home/screen.png" }], hasDesignSystem: true }] };
  const steward = designSystemTabHtml({ available: false }, undefined, variants, "approved");
  assert.doesNotMatch(steward, /candidates-strip/, "steward mode omits the strip entirely");
  assert.doesNotMatch(steward, /Design-language candidates/);

  const omitted = designSystemTabHtml({ available: false }, undefined, variants); // no artifactStatus arg
  assert.doesNotMatch(omitted, /candidates-strip/, "an unspecified status is the safe (steward) default");
});

test("designSystemTabHtml: candidates strip in genesis mode — empty state when nothing stashed, rendered cards + Pick when stashed", () => {
  const emptyHtml = designSystemTabHtml({ available: false }, undefined, { available: false }, "unreviewed");
  assert.match(emptyHtml, /Design-language candidates/);
  assert.match(emptyHtml, /No design-language candidates stashed yet/);
  assert.match(emptyHtml, /snapshot_variant/);

  const variants = {
    available: true,
    variants: [
      { name: "warmer", screens: [{ id: "home", png: "variants/warmer/home/screen.png" }], hasDesignSystem: true },
      { name: "rounded-v2", screens: [], hasDesignSystem: false },
    ],
  };
  const html = designSystemTabHtml({ available: false }, undefined, variants, "reopened");
  assert.match(html, /class="candidates-strip"/);
  assert.match(html, /<h4>warmer<\/h4>/);
  assert.match(html, /src="\/previews\/variants\/warmer\/home\/screen\.png"/);
  assert.match(html, /data-variant="warmer"/);
  assert.match(html, /Pick &ldquo;warmer&rdquo;/);
  assert.match(html, /<h4>rounded-v2<\/h4>/);
  assert.match(html, /no screens stashed for this candidate/, "a variant with zero stashed screens is shown honestly");
});

test("designSystemTabHtml: candidate name is HTML/attribute escaped (variant names appear in HTML — esc() rigor)", () => {
  const variants = {
    available: true,
    variants: [{ name: 'warmer"><script>x', screens: [], hasDesignSystem: false }],
  };
  const html = designSystemTabHtml({ available: false }, undefined, variants, "unreviewed");
  assert.doesNotMatch(html, /<script>x/, "raw script tag never appears unescaped");
  assert.match(html, /&lt;script&gt;/);
});

test("specsTabHtml: unavailable -> honest empty-state", () => {
  assert.match(specsTabHtml({ available: false }), /No specs\/ directory found/);
});

test("specsTabHtml: clause list with coverage badges, strikes through withdrawn prose", () => {
  const html = specsTabHtml({
    available: true,
    files: [
      {
        file: "home.spec.md",
        clauses: [
          { id: "HOME-01", withdrawn: false, prose: "Given X, Then Y", cited: true },
          { id: "HOME-02", withdrawn: false, prose: "Given A, Then B", cited: false },
          { id: "HOME-03", withdrawn: true, prose: "old behavior", cited: null },
        ],
      },
    ],
  });
  assert.match(html, /home\.spec\.md/);
  assert.match(html, /HOME-01/);
  assert.match(html, /cov-yes">covered/);
  assert.match(html, /cov-no">no citing test/);
  assert.match(html, /cov-na">withdrawn/);
  assert.match(html, /<s>old behavior<\/s>/, "withdrawn prose is struck through");
  assert.match(html, /class="clause withdrawn"/);
});

// --- commentControlHtml (§7.3) ----------------------------------------------

test("commentControlHtml: target JSON is embedded and HTML/attribute escaped (quotes included)", () => {
  const html = commentControlHtml({ type: "screen", screen: 'home"><script>x' });
  assert.match(html, /class="comment-btn"/);
  assert.match(html, /class="comment-popover" hidden/);
  // The dangerous characters must be neutralized — no raw '>' breaking out of the attribute,
  // no unescaped '"' terminating it early.
  assert.doesNotMatch(html, /data-target="[^"]*"><script>/);
  assert.match(html, /&quot;/, "double quotes inside the JSON are escaped for attribute safety");
});

test("commentControlHtml: testTagInput adds an optional testTag field; omitted by default", () => {
  const withInput = commentControlHtml({ type: "screen", screen: "home" }, { testTagInput: true });
  assert.match(withInput, /class="comment-testtag"/);
  const without = commentControlHtml({ type: "screen", screen: "home" });
  assert.doesNotMatch(without, /class="comment-testtag"/);
});

// --- designSystemTabHtml Components section (§7.2) -------------------------

test("designSystemTabHtml: Components section unavailable -> honest empty-state, independent of the token catalog's own availability", () => {
  const html = designSystemTabHtml({ available: false }, { available: false, reason: "no presentation/components directory found" });
  assert.match(html, /No design-system catalog available yet/, "the token-catalog empty state still renders");
  assert.match(html, /<h3>Components<\/h3>/);
  assert.match(html, /No components scan available yet/);
  assert.match(html, /no presentation\/components directory found/);
});

test("designSystemTabHtml: Components section renders name/file/params/used-in, flags a parse error honestly", () => {
  const html = designSystemTabHtml(
    { available: true, source: "previews", catalog: { colors: {}, dimens: {} } },
    {
      available: true,
      components: [
        {
          name: "AppButton",
          file: "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/AppButton.kt",
          params: ["text: String", "onClick: () -> Unit"],
          parseError: false,
          usedIn: ["composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt"],
        },
        {
          name: "Broken",
          file: "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/Broken.kt",
          params: [],
          parseError: true,
          usedIn: [],
        },
      ],
    },
  );
  assert.match(html, /AppButton/);
  assert.match(html, /text: String/);
  assert.match(html, /onClick: \(\) -&gt; Unit/);
  assert.match(html, /HomeScreen\.kt/);
  assert.match(html, /Broken/);
  assert.match(html, /signature could not be parsed cleanly/);
});

test("designSystemTabHtml: Components section — dir present but zero components -> honest empty-inline note", () => {
  const html = designSystemTabHtml({ available: false }, { available: true, components: [] });
  assert.match(html, /no @Composable components found/);
});

// --- architectureTabHtml (§7.1) ---------------------------------------------

test("architectureTabHtml: every section unavailable -> three independent honest empty-states", () => {
  const html = architectureTabHtml({
    layerMap: { available: false, reason: "no 'presentation' directory found" },
    governedContract: { available: false, reason: "specs/app-base.spec.md not found" },
    featureShape: { available: false, reason: "no home-feature files found on disk" },
  });
  assert.match(html, /No layer map available/);
  assert.match(html, /no 'presentation' directory found/);
  assert.match(html, /No governed contract available/);
  assert.match(html, /specs\/app-base\.spec\.md not found/);
  assert.match(html, /No feature shape available/);
  assert.match(html, /no home-feature files found on disk/);
});

test("architectureTabHtml: layer map renders each layer's package + real files, an empty layer honestly, and a comment control per node", () => {
  const html = architectureTabHtml({
    layerMap: {
      available: true,
      appPackage: "com.acme.demo",
      layers: [
        { id: "presentation", label: "presentation (…)", present: true, files: ["theme/Theme.kt", "home/HomeScreen.kt"] },
        { id: "domain", label: "domain (…)", present: true, files: ["model/Item.kt"] },
        { id: "data", label: "data (…)", present: false, files: [] },
        { id: "di", label: "di (…)", present: true, files: ["AppModule.kt"] },
      ],
      otherPackages: [{ name: "core", files: ["format/Formatter.kt"] }],
    },
    governedContract: { available: false },
    featureShape: { available: false },
  });
  assert.match(html, /com\.acme\.demo/);
  assert.match(html, /theme\/Theme\.kt/);
  assert.match(html, /home\/HomeScreen\.kt/);
  assert.match(html, /class="layer-box layer-empty"/, "the absent data layer is flagged, not hidden");
  assert.match(html, /directory not present/);
  assert.match(html, /other top-level packages/);
  assert.match(html, /core/);
  assert.match(html, /class="comment-ctl"/, "architecture tree nodes carry a 💬 control");
});

test("architectureTabHtml: governed-contract clauses render with comment controls, feature shape lists real files", () => {
  const html = architectureTabHtml({
    layerMap: { available: false },
    governedContract: {
      available: true,
      file: "app-base.spec.md",
      clauses: [{ id: "ARCH-01", withdrawn: false, prose: "Layers stay separated." }],
    },
    featureShape: {
      available: true,
      files: [
        "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt",
        "specs/home.spec.md",
      ],
    },
  });
  assert.match(html, /ARCH-01/);
  assert.match(html, /Layers stay separated/);
  assert.match(html, /specs\/home\.spec\.md/);
  assert.match(html, /qa\/scaffold-feature\.mjs/);
});

// --- commentsTabHtml (§7.3) --------------------------------------------------

test("commentsTabHtml: unavailable -> honest not-available state, with and without a library error", () => {
  const noReason = commentsTabHtml({ available: false });
  assert.match(noReason, /not available in this project/);
  assert.match(noReason, /older scaffold/);

  const withReason = commentsTabHtml({ available: false, error: "kaboom" });
  assert.match(withReason, /kaboom/);
});

test("commentsTabHtml: no comments yet -> honest empty state", () => {
  const html = commentsTabHtml({ available: true, comments: [] });
  assert.match(html, /No comments yet/);
});

test("commentsTabHtml: ledger renders target/text/author/status, escapes user text, shows the resolution note when resolved", () => {
  const html = commentsTabHtml({
    available: true,
    comments: [
      {
        id: "c1",
        target: { type: "screen", screen: "home" },
        text: "the CTA is too close <script>",
        author: "human-console",
        createdAt: "2026-07-19T09:00:00.000Z",
        status: "open",
      },
      {
        id: "c2",
        target: { type: "spec-line", file: "specs/home.spec.md", clauseId: "HOME-01" },
        text: "clarify this clause",
        author: "human-console",
        createdAt: "2026-07-19T08:00:00.000Z",
        status: "resolved",
        resolvedAt: "2026-07-19T08:30:00.000Z",
        resolvedBy: "agent",
        resolutionNote: "reworded the clause",
      },
    ],
  });
  assert.match(html, /c1/);
  assert.match(html, /screen <code>home<\/code>/);
  assert.match(html, /the CTA is too close &lt;script&gt;/, "comment text is escaped");
  assert.match(html, /badge-open/);
  assert.match(html, /spec <code>specs\/home\.spec\.md<\/code>/);
  assert.match(html, /clause <code>HOME-01<\/code>/);
  assert.match(html, /badge-resolved/);
  assert.match(html, /resolved by agent/);
  assert.match(html, /reworded the clause/);
});
