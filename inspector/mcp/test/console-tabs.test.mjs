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

test("designSystemTabHtml: Components section renders name/file/signature/used-in, flags a parse error honestly", () => {
  const html = designSystemTabHtml(
    { available: true, source: "previews", catalog: { colors: {}, dimens: {} } },
    {
      available: true,
      components: [
        {
          name: "AppButton",
          file: "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/AppButton.kt",
          params: ["text: String", "onClick: () -> Unit"],
          paramsParsed: [
            { raw: "text: String", name: "text", type: "String", default: null },
            { raw: "onClick: () -> Unit", name: "onClick", type: "() -> Unit", default: null },
          ],
          parseError: false,
          kdoc: null,
          facts: {},
          usedIn: ["composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt"],
          usedInScreens: ["composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt"],
        },
        {
          name: "Broken",
          file: "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/Broken.kt",
          params: [],
          paramsParsed: [],
          parseError: true,
          kdoc: null,
          facts: {},
          usedIn: [],
          usedInScreens: [],
        },
      ],
    },
  );
  assert.match(html, /AppButton/);
  assert.match(html, /text: String/);
  assert.match(html, /onClick: \(\) -&gt; Unit/);
  assert.match(html, /HomeScreen\.kt/);
  assert.match(html, /class="badge badge-open">screen/, "the screen used-in entry carries the screen badge");
  assert.match(html, /Broken/);
  assert.match(html, /signature could not be parsed cleanly/);
});

test("designSystemTabHtml: Components section — dir present but zero components -> honest empty-inline note", () => {
  const html = designSystemTabHtml({ available: false }, { available: true, components: [] });
  assert.match(html, /no @Composable components found/);
});

// --- CV-1 W3b: authored form + derived truth + drift surface ---------------

function component(overrides = {}) {
  return {
    name: "ScreenColumn",
    file: "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/ScreenColumn.kt",
    params: ["screenTag: String"],
    paramsParsed: [{ raw: "screenTag: String", name: "screenTag", type: "String", default: null }],
    parseError: false,
    kdoc: null,
    facts: {},
    usedIn: [],
    usedInScreens: [],
    ...overrides,
  };
}

test("designSystemTabHtml: Components section — signature block shows every param, one per line, in scanned order", () => {
  const html = designSystemTabHtml(
    { available: false },
    {
      available: true,
      components: [
        component({
          name: "ListItemCard",
          params: ["title: String", "onClick: () -> Unit", "subtitle: String? = null"],
          paramsParsed: [
            { raw: "title: String", name: "title", type: "String", default: null },
            { raw: "onClick: () -> Unit", name: "onClick", type: "() -> Unit", default: null },
            { raw: "subtitle: String? = null", name: "subtitle", type: "String?", default: "null" },
          ],
        }),
      ],
    },
  );
  assert.match(html, /fun ListItemCard\(/);
  assert.match(html, /title: String,/);
  assert.match(html, /subtitle: String\? = null,/);
});

test("designSystemTabHtml: Components section — state contract renders ONLY facts with positive evidence, never a negative claim", () => {
  const withFacts = designSystemTabHtml(
    { available: false },
    {
      available: true,
      components: [
        component({
          facts: {
            derivedTags: ["screen"],
            contentUiStateArms: [],
            a11yFloorEvidence: [],
            insetsApis: [],
            tokensReferenced: ["Tokens.PaddingPage"],
            selfReportsDesignToken: true,
          },
        }),
      ],
    },
  );
  assert.match(withFacts, /state contract/);
  assert.match(withFacts, /owns testTags derived from <code>screenTag<\/code>/);
  assert.match(withFacts, /&lt;screenTag&gt;_screen/);
  assert.match(withFacts, /Tokens\.PaddingPage/);
  assert.match(withFacts, /self-reports resolved values to the inspector/);
  assert.doesNotMatch(withFacts, /does not|does NOT/i, "no negative claim is ever rendered");

  const noFacts = designSystemTabHtml(
    { available: false },
    { available: true, components: [component({ paramsParsed: [], facts: {} })] },
  );
  assert.doesNotMatch(noFacts, /state contract/, "an empty facts set omits the whole subsection, not an empty header");
});

test("designSystemTabHtml: Components section — ContentUiState arms and the 48dp a11y floor render with their evidence", () => {
  const html = designSystemTabHtml(
    { available: false },
    {
      available: true,
      components: [
        component({
          name: "ContentStateContainer",
          paramsParsed: [{ raw: "screenTag: String", name: "screenTag", type: "String", default: null }],
          facts: {
            derivedTags: [],
            contentUiStateArms: ["Loading", "Error", "Empty", "Content"],
            a11yFloorEvidence: ["48.dp"],
            insetsApis: [],
            tokensReferenced: [],
            selfReportsDesignToken: false,
          },
        }),
      ],
    },
  );
  assert.match(html, /renders <code>ContentUiState<\/code> arms:.*Loading.*Error.*Empty.*Content/s);
  assert.match(html, /enforces the 48dp a11y touch-target floor/);
  assert.match(html, /48\.dp/);
});

test("designSystemTabHtml: Components section — kdoc is quoted verbatim and labeled as the component's own doc comment; absent kdoc omits the section", () => {
  const withKdoc = designSystemTabHtml(
    { available: false },
    { available: true, components: [component({ kdoc: "Deliberately not an M3 TopAppBar." })] },
  );
  assert.match(withKdoc, /from the component's own doc comment/);
  assert.match(withKdoc, /Deliberately not an M3 TopAppBar\./);

  const noKdoc = designSystemTabHtml({ available: false }, { available: true, components: [component({ kdoc: null })] });
  assert.doesNotMatch(noKdoc, /usage notes/, "no kdoc found -> no fabricated usage-notes section");
});

test("designSystemTabHtml: Components section — approval badge reflects the components artifact's live status", () => {
  const approved = designSystemTabHtml(
    { available: false },
    { available: true, components: [component()] },
    undefined,
    undefined,
    { approval: { status: "approved", hash: "abc123def456", approvedAt: "2026-07-19T00:00:00.000Z" } },
  );
  assert.match(approved, /badge-approved/);
  assert.match(approved, /approved &middot; abc123de/);

  const unreviewed = designSystemTabHtml(
    { available: false },
    { available: true, components: [component()] },
    undefined,
    undefined,
    { approval: { status: "unreviewed" } },
  );
  assert.match(unreviewed, /badge-unreviewed/);
  assert.match(unreviewed, /not yet approved/);

  const noApproval = designSystemTabHtml({ available: false }, { available: true, components: [component()] });
  assert.doesNotMatch(noApproval, /badge-approved|badge-unreviewed|badge-changed|badge-reopened/, "no approvals data -> no fabricated badge");
});

test("designSystemTabHtml: Components section — drift: artifact-level badge plus a per-card mtime chip when drift data resolves the file", () => {
  const html = designSystemTabHtml(
    { available: false },
    { available: true, components: [component({ file: "a/ScreenColumn.kt" })] },
    undefined,
    undefined,
    {
      approval: { status: "changed-since-approval", hash: "new", storedHash: "old", approvedAt: "2026-07-19T00:00:00.000Z" },
      drift: { available: true, byFile: { "a/ScreenColumn.kt": { modifiedSinceApproval: true, mtime: "2026-07-19T01:00:00.000Z" } } },
    },
  );
  assert.match(html, /drift &middot; artifact changed since approval/);
  assert.match(html, /likely changed \(mtime\)/);

  const unchangedFile = designSystemTabHtml(
    { available: false },
    { available: true, components: [component({ file: "a/ScreenColumn.kt" })] },
    undefined,
    undefined,
    {
      approval: { status: "changed-since-approval", hash: "new", storedHash: "old", approvedAt: "2026-07-19T00:00:00.000Z" },
      drift: { available: true, byFile: { "a/ScreenColumn.kt": { modifiedSinceApproval: false, mtime: "2026-07-18T01:00:00.000Z" } } },
    },
  );
  assert.match(unchangedFile, /unchanged since approval \(mtime\)/);
});

test("designSystemTabHtml: Components section — used-in flags a screen that hand-rolls a state this component owns", () => {
  const html = designSystemTabHtml(
    { available: false },
    {
      available: true,
      components: [
        component({
          name: "ContentStateContainer",
          usedIn: ["composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt"],
          usedInScreens: ["composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt"],
        }),
      ],
    },
    undefined,
    undefined,
    {
      violations: {
        available: true,
        violations: [
          {
            file: "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt",
            indicators: [{ name: "CircularProgressIndicator", lines: [12] }],
          },
        ],
      },
    },
  );
  assert.match(html, /hand-rolled state/);
  assert.match(html, /hand-rolls CircularProgressIndicator/);
});

test("designSystemTabHtml: Components section — live variant thumbnails render when a matching @state preview exists; honest degrade when it doesn't", () => {
  const withThumb = designSystemTabHtml(
    { available: false },
    { available: true, components: [component({ name: "EmptyState", facts: { derivedTags: ["empty"] } })] },
    undefined,
    undefined,
    { stateVariants: { loading: [], empty: [{ id: "home@empty", title: "Home — empty", png: "home@empty/screen.png" }], error: [] } },
  );
  assert.match(withThumb, /live &#64;empty render/);
  assert.match(withThumb, /home@empty\/screen\.png/);

  const noThumbYet = designSystemTabHtml(
    { available: false },
    { available: true, components: [component({ name: "EmptyState", facts: { derivedTags: ["empty"] } })] },
    undefined,
    undefined,
    { stateVariants: { loading: [], empty: [], error: [] } },
  );
  assert.match(noThumbYet, /live &#64;empty render/);
  assert.match(noThumbYet, /not derivable statically/);

  const noStateTags = designSystemTabHtml(
    { available: false },
    { available: true, components: [component({ facts: { derivedTags: ["screen"] } })] },
  );
  assert.doesNotMatch(noStateTags, /live &#64;/, "a component with no state-suffix tags shows no live-variant section at all");
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

test("architectureTabHtml: mirrors the doc's own section numbering (1/3/4/5/6/7/8), even with no doc/dependency data", () => {
  const html = architectureTabHtml({
    layerMap: { available: false },
    governedContract: { available: false },
    featureShape: { available: false },
  });
  assert.match(html, /1\. Purpose &amp; quality goals/);
  assert.match(html, /3\. System context/);
  assert.match(html, /4\. Platform &amp; deployment view/);
  assert.match(html, /5\. Building blocks/);
  assert.match(html, /6\. Runtime view/);
  assert.match(html, /7\. Crosscutting policies/);
  assert.match(html, /8\. Decisions/);
  assert.match(html, /Feature shape/);
});

test("architectureTabHtml: doc-derived quality-attribute table, system-context table, platform table, and ADR table render verbatim", () => {
  const html = architectureTabHtml({
    layerMap: { available: false },
    governedContract: { available: false },
    featureShape: { available: false },
    doc: {
      available: true,
      qualityAttributes: {
        available: true,
        headers: ["Quality", "Scenario", "Backing"],
        rows: [["Maintainability", "A violation is named as a clause", "`[enforced: ARCH-01]`"]],
      },
      systemContext: {
        available: true,
        heading: "3. System context",
        intro: "This app talks to Firebase.",
        table: { headers: ["Integration", "What"], rows: [["Firebase", "Auth"]] },
      },
      platformView: {
        available: true,
        headers: ["Source set", "Role"],
        rows: [["commonMain", "Shared UI"]],
        expectActual: null,
      },
      runtimeView: { available: true, heading: "6. Runtime view", body: "**Cold start.** The app boots." },
      crosscuttingPolicies: { available: true, heading: "7. Crosscutting policies", body: "### Error handling `[enforced: ARCH-06]`\n\n- typed results only" },
      decisions: {
        available: true,
        headers: ["ADR", "Title", "Status"],
        rows: [["[0001](./adr/0001-x.md)", "Adopt the harness", "accepted"]],
      },
    },
  });
  assert.match(html, /Maintainability/);
  assert.match(html, /<code>\[enforced: ARCH-01\]<\/code>/);
  assert.match(html, /This app talks to Firebase/);
  assert.match(html, /Firebase.*Auth|Auth.*Firebase/s);
  assert.match(html, /commonMain/);
  assert.match(html, /<strong>Cold start\.<\/strong>/);
  assert.match(html, /<h4>Error handling <code>\[enforced: ARCH-06\]<\/code><\/h4>/);
  assert.match(html, /typed results only/);
  assert.match(html, /Adopt the harness/);
  assert.doesNotMatch(html, /adr\/0001-x\.md/, "markdown links render as plain text, never a dead href");
});

test("architectureTabHtml: doc unavailable -> every doc-derived sub-section shows an honest reason, layer/contract/feature-shape sections are unaffected", () => {
  const html = architectureTabHtml({
    layerMap: { available: false, reason: "no 'presentation' directory found" },
    governedContract: { available: false, reason: "specs/app-base.spec.md not found" },
    featureShape: { available: false, reason: "no home-feature files found on disk" },
    doc: { available: false, reason: "docs/ARCHITECTURE.md not found" },
  });
  assert.match(html, /docs\/ARCHITECTURE\.md not found/);
  assert.match(html, /No layer map available/);
  assert.match(html, /No governed contract available/);
  assert.match(html, /No feature shape available/);
});

test("architectureTabHtml: dependency graph — observed edges render, a violation gets a red chip + file:line, an honest 'unchecked' note when no rules resolved", () => {
  const withViolation = architectureTabHtml({
    layerMap: { available: false },
    governedContract: { available: false },
    featureShape: { available: false },
    dependencyGraph: {
      available: true,
      appPackage: "com.acme.demo",
      buckets: ["data", "domain", "presentation"],
      edges: [
        { from: "presentation", to: "domain", count: 2, violation: false, clauseId: null, occurrences: [] },
        {
          from: "data",
          to: "presentation",
          count: 1,
          violation: true,
          clauseId: "ARCH-09",
          occurrences: [{ file: "composeApp/src/commonMain/kotlin/com/acme/demo/data/remote/ItemRepositoryImpl.kt", line: 5, imported: "com.acme.demo.presentation.theme.Theme" }],
        },
      ],
      violations: [
        {
          from: "data",
          to: "presentation",
          clauseId: "ARCH-09",
          file: "composeApp/src/commonMain/kotlin/com/acme/demo/data/remote/ItemRepositoryImpl.kt",
          line: 5,
          imported: "com.acme.demo.presentation.theme.Theme",
        },
      ],
      rulesApplied: true,
    },
  });
  assert.match(withViolation, /presentation.*&rarr;.*domain/s);
  assert.match(withViolation, /class="dep-edge dep-violation"/);
  assert.match(withViolation, /violates ARCH-09/);
  assert.match(withViolation, /ItemRepositoryImpl\.kt:5/);

  const unchecked = architectureTabHtml({
    layerMap: { available: false },
    governedContract: { available: false },
    featureShape: { available: false },
    dependencyGraph: {
      available: true,
      appPackage: "com.acme.demo",
      buckets: ["presentation", "domain"],
      edges: [{ from: "presentation", to: "domain", count: 1, violation: false, clauseId: null, occurrences: [] }],
      violations: [],
      rulesApplied: false,
    },
  });
  assert.match(unchecked, /unchecked, not clean/);
});

test("architectureTabHtml: the architecture artifact's own approval badge + genesis/steward banner render at the top when meta.approval is supplied", () => {
  const approved = architectureTabHtml(
    { layerMap: { available: false }, governedContract: { available: false }, featureShape: { available: false } },
    { approval: { id: "architecture", status: "approved", hash: "abc123def456", approvedAt: "2026-07-19T09:00:00.000Z" } },
  );
  assert.match(approved, /class="arch-top-status"/);
  assert.match(approved, /badge-approved/);
  assert.match(approved, /banner-steward/);

  const drifted = architectureTabHtml(
    { layerMap: { available: false }, governedContract: { available: false }, featureShape: { available: false } },
    { approval: { id: "architecture", status: "changed-since-approval", hash: "newhash01", storedHash: "oldhash01" } },
  );
  assert.match(drifted, /drift &middot; architecture artifact changed since approval/);

  const reopened = architectureTabHtml(
    { layerMap: { available: false }, governedContract: { available: false }, featureShape: { available: false } },
    { approval: { id: "architecture", status: "reopened" } },
  );
  assert.match(reopened, /reopened for redesign/);
  assert.match(reopened, /banner-genesis/);

  const noMeta = architectureTabHtml({
    layerMap: { available: false },
    governedContract: { available: false },
    featureShape: { available: false },
  });
  assert.doesNotMatch(noMeta, /class="arch-top-status"/, "no approval record supplied -> no top-status banner at all");
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
