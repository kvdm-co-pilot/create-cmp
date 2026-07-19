// console-tabs.mjs — pure (data) -> html generators for the console's section
// bodies: Design language (§3.1) + Components (§3.3), Architecture,
// Approvals, Specs, and Comments.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  designLanguageBodyHtml,
  componentsBodyHtml,
  approvalsTabHtml,
  specsTabHtml,
  architectureTabHtml,
  commentsTabHtml,
  commentControlHtml,
} from "../src/lib/console-tabs.mjs";

// --- Design language (§3.1: the designer's handoff spec) --------------------

test("designLanguageBodyHtml: unavailable -> honest empty-state explaining how to produce a catalog", () => {
  const html = designLanguageBodyHtml({ available: false });
  assert.match(html, /No design-system catalog available yet/);
  assert.match(html, /design-system\.json/);
  assert.match(html, /connect_live/);
});

test("designLanguageBodyHtml: color token table — swatch in the declared color, value, source disclosed", () => {
  const html = designLanguageBodyHtml({
    available: true,
    source: "previews",
    catalog: { colors: { Primary: "#0A2540" }, dimens: { PaddingPage: "16dp" } },
  });
  assert.match(html, /<h3>Color tokens<\/h3>/);
  assert.match(html, /Primary/);
  assert.match(html, /background:#0A2540/, "the swatch is actually rendered in the declared color");
  assert.match(html, /<code>#0A2540<\/code>/);
  assert.match(html, /composeApp\/build\/previews\/design-system\.json/, "source is disclosed");
});

test("designLanguageBodyHtml: available (live source) -> labelled distinctly; empty catalog -> honest inline notes", () => {
  const html = designLanguageBodyHtml({ available: true, source: "live", catalog: { colors: {}, dimens: {} } });
  assert.match(html, /inspect\/design-system/);
  assert.match(html, /no color tokens declared/);
  assert.match(html, /no dimens declared/);
});

test("designLanguageBodyHtml: usage counts render per token when the scan resolved, 0 stated plainly — never hidden", () => {
  const html = designLanguageBodyHtml(
    {
      available: true,
      source: "previews",
      catalog: { colors: { Primary: "#0A2540", Divider: "#E5E7EB" }, dimens: {} },
    },
    {
      usage: {
        available: true,
        scanRoot: "composeApp/src/commonMain/kotlin",
        colors: { object: "MyAppColors", file: "…/Theme.kt", counts: { Primary: 3, Divider: 0 } },
        dimens: null,
      },
    },
  );
  assert.match(html, /<th>Usage<\/th>/);
  assert.match(html, /3 uses in commonMain/);
  assert.match(html, /0 uses in commonMain/, "a dead token is stated as 0 uses, not hidden");
});

test("designLanguageBodyHtml: usage absence branches — unavailable scan states its reason; no declaring object states that; no scan wired stays silent", () => {
  const ds = { available: true, source: "previews", catalog: { colors: { Primary: "#0A2540" }, dimens: {} } };

  const unavailable = designLanguageBodyHtml(ds, { usage: { available: false, reason: "no .kt files found under composeApp/src/commonMain/kotlin" } });
  assert.match(unavailable, /Not derivable statically &mdash; no \.kt files found/);
  assert.doesNotMatch(unavailable, /<th>Usage<\/th>/, "no fabricated zero column");

  const noObject = designLanguageBodyHtml(ds, { usage: { available: true, colors: null, dimens: null } });
  assert.match(noObject, /Not derivable statically &mdash; no Kotlin object declaring these tokens/);

  const unwired = designLanguageBodyHtml(ds, {});
  assert.doesNotMatch(unwired, /<th>Usage<\/th>/);
  assert.doesNotMatch(unwired, /usage counts:/, "a caller that wired no scan gets silence, not a claim");
});

test("designLanguageBodyHtml: contrast matrix — On-convention pairs computed with ratio + AA/AAA verdicts, failures in the drift vocabulary", () => {
  const html = designLanguageBodyHtml({
    available: true,
    source: "previews",
    // OnPrimary/Primary is high contrast; OnSurfaceVariant/Surface (#767676-ish
    // gray on white) passes AA but fails AAA — both verdicts must be real.
    catalog: {
      colors: {
        Primary: "#0A2540",
        OnPrimary: "#FFFFFF",
        Surface: "#FFFFFF",
        OnSurface: "#1A1A1A",
        OnSurfaceVariant: "#6B7280",
      },
      dimens: {},
    },
  });
  assert.match(html, /<h3>Contrast &mdash; WCAG 2\.2<\/h3>/);
  assert.match(html, /<code>OnPrimary<\/code> on <code>Primary<\/code>/);
  assert.match(html, /<code>OnSurfaceVariant<\/code> on <code>Surface<\/code>/, "the secondary-text convention pair is derived");
  assert.match(html, /\d+(\.\d+)?:1/, "a computed ratio is rendered");
  assert.match(html, /wcag-pass/);
  assert.match(html, /wcag-fail/, "a failing verdict renders in the drift vocabulary");
  assert.match(html, /contrast-sample" style="background:#FFFFFF;color:#6B7280"/, "the sample chip uses the real pair colors");
});

test("designLanguageBodyHtml: contrast matrix — no On-convention pairs -> the standardized absence form, never a guessed pair", () => {
  const html = designLanguageBodyHtml({
    available: true,
    source: "previews",
    catalog: { colors: { Brand: "#123456", Divider: "#E5E7EB" }, dimens: {} },
  });
  assert.match(html, /Not derivable statically &mdash; the catalog names no On-convention pairs to check/);
  assert.doesNotMatch(html, /contrast-ratio/, "no fabricated rows");
});

test("designLanguageBodyHtml: spacing drawn to scale, radii/elevation in their own sub-tables, unclassifiable dimens in a plain table", () => {
  const html = designLanguageBodyHtml({
    available: true,
    source: "previews",
    catalog: {
      colors: {},
      dimens: {
        PaddingPage: "16dp",
        GapCard: "12dp",
        RadiusCard: "16dp",
        ElevationCard: "2dp",
        BottomNavHeight: "72dp",
      },
    },
  });
  assert.match(html, /<h3>Spacing scale<\/h3>/);
  assert.match(html, /scale-bar" style="width:48px"/, "GapCard 12dp -> 48px at 4px\/dp — drawn to scale");
  assert.match(html, /scale-bar" style="width:64px"/, "PaddingPage 16dp -> 64px");
  assert.match(html, /<h3>Corner radii<\/h3>/);
  assert.match(html, /RadiusCard/);
  assert.match(html, /<h3>Elevation<\/h3>/);
  assert.match(html, /ElevationCard/);
  assert.match(html, /<h3>Other dimensions<\/h3>/);
  assert.match(html, /BottomNavHeight/, "a token outside the naming convention lands in the plain table, never forced into a scale");
});

test("designLanguageBodyHtml: type ramp — the catalog carries no typography -> the standardized absence form, never a faked specimen", () => {
  const html = designLanguageBodyHtml({
    available: true,
    source: "previews",
    catalog: { colors: {}, dimens: {} },
  });
  assert.match(html, /<h3>Type ramp<\/h3>/);
  assert.match(html, /Not derivable statically &mdash; the design-system catalog carries no typography tokens/);
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

test("designLanguageBodyHtml: candidates strip is genesis-mode-only — absent entirely in steward mode or when status is omitted", () => {
  const variants = { available: true, variants: [{ name: "warmer", screens: [{ id: "home", png: "variants/warmer/home/screen.png" }], hasDesignSystem: true }] };
  const steward = designLanguageBodyHtml({ available: false }, { variants, artifactStatus: "approved" });
  assert.doesNotMatch(steward, /candidates-strip/, "steward mode omits the strip entirely");
  assert.doesNotMatch(steward, /Design-language candidates/);

  const omitted = designLanguageBodyHtml({ available: false }, { variants }); // no artifactStatus
  assert.doesNotMatch(omitted, /candidates-strip/, "an unspecified status is the safe (steward) default");
});

test("designLanguageBodyHtml: candidates strip in genesis mode — empty state when nothing stashed, rendered cards + Pick when stashed", () => {
  const emptyHtml = designLanguageBodyHtml({ available: false }, { variants: { available: false }, artifactStatus: "unreviewed" });
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
  const html = designLanguageBodyHtml({ available: false }, { variants, artifactStatus: "reopened" });
  assert.match(html, /class="candidates-strip"/);
  assert.match(html, /<h4>warmer<\/h4>/);
  assert.match(html, /src="\/previews\/variants\/warmer\/home\/screen\.png"/);
  assert.match(html, /data-variant="warmer"/);
  assert.match(html, /Pick &ldquo;warmer&rdquo;/);
  assert.match(html, /<h4>rounded-v2<\/h4>/);
  assert.match(html, /no screens stashed for this candidate/, "a variant with zero stashed screens is shown honestly");
});

test("designLanguageBodyHtml: candidate name is HTML/attribute escaped (variant names appear in HTML — esc() rigor)", () => {
  const variants = {
    available: true,
    variants: [{ name: 'warmer"><script>x', screens: [], hasDesignSystem: false }],
  };
  const html = designLanguageBodyHtml({ available: false }, { variants, artifactStatus: "unreviewed" });
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

// --- componentsBodyHtml (§3.3: the platform engineer's library reference) ---

test("componentsBodyHtml: unavailable -> honest empty-state with the scan's reason", () => {
  const html = componentsBodyHtml({ available: false, reason: "no presentation/components directory found" });
  assert.match(html, /No components scan available yet/);
  assert.match(html, /no presentation\/components directory found/);
});

test("componentsBodyHtml: dir present but zero components -> honest empty-inline note", () => {
  const html = componentsBodyHtml({ available: true, components: [] });
  assert.match(html, /no @Composable components found/);
});

function component(overrides = {}) {
  return {
    name: "ScreenColumn",
    file: "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/ScreenColumn.kt",
    params: ["screenTag: String"],
    paramsParsed: [{ raw: "screenTag: String", name: "screenTag", type: "String", default: null }],
    parseError: false,
    kdoc: null,
    kdocDescription: null,
    paramDocs: {},
    facts: {},
    usedIn: [],
    usedInScreens: [],
    ...overrides,
  };
}

test("componentsBodyHtml: one document entry per component — params table, used-in with screen badge; a parse error shows name + file + 'signature not parsed', never a guess", () => {
  const html = componentsBodyHtml({
    available: true,
    components: [
      component({
        name: "AppButton",
        file: "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/AppButton.kt",
        params: ["text: String", "onClick: () -> Unit"],
        paramsParsed: [
          { raw: "text: String", name: "text", type: "String", default: null },
          { raw: "onClick: () -> Unit", name: "onClick", type: "() -> Unit", default: null },
        ],
        usedIn: ["composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt"],
        usedInScreens: ["composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt"],
      }),
      component({
        name: "Broken",
        file: "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/Broken.kt",
        params: [],
        paramsParsed: [],
        parseError: true,
      }),
    ],
  });
  assert.match(html, /class="component-entry"/);
  assert.match(html, /AppButton/);
  assert.match(html, /class="params-table"/);
  assert.match(html, /<code>text<\/code>/);
  assert.match(html, /<code>\(\) -&gt; Unit<\/code>/);
  assert.match(html, /HomeScreen\.kt/);
  assert.match(html, /class="badge badge-open">screen/, "the screen used-in entry carries the screen badge");
  assert.match(html, /Broken/);
  assert.match(html, /signature not parsed &mdash; showing name and file only/);
  assert.doesNotMatch(html, /Broken[\s\S]*params-table/, "a parse-error entry never renders a guessed params table");
});

test("componentsBodyHtml: params table preserves declaration order and derives required/default per parameter", () => {
  const html = componentsBodyHtml({
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
  });
  const title = html.indexOf("<code>title</code>");
  const onClick = html.indexOf("<code>onClick</code>");
  const subtitle = html.indexOf("<code>subtitle</code>");
  assert.ok(title !== -1 && onClick !== -1 && subtitle !== -1);
  assert.ok(title < onClick && onClick < subtitle, "parameter order preserved exactly as declared");
  assert.match(html, /class="param-required">required/, "no default in the source -> stated required (a derived fact)");
  assert.match(html, /<code>null<\/code>/, "the declared default renders verbatim");
});

test("componentsBodyHtml: @param notes from the component's own KDoc fill the notes column; a param without one gets an empty cell, never invented prose", () => {
  const html = componentsBodyHtml({
    available: true,
    components: [
      component({
        name: "AppHeader",
        params: ["title: String", "modifier: Modifier = Modifier"],
        paramsParsed: [
          { raw: "title: String", name: "title", type: "String", default: null },
          { raw: "modifier: Modifier = Modifier", name: "modifier", type: "Modifier", default: "Modifier" },
        ],
        paramDocs: { title: "The screen heading, rendered in headlineMedium." },
      }),
    ],
  });
  assert.match(html, /class="param-note">The screen heading, rendered in headlineMedium\./);
  assert.match(html, /class="param-note"><\/td>/, "the undocumented param's notes cell is empty");
});

test("componentsBodyHtml: entry order is states -> usage notes -> signature -> state contract -> used-in (the library-docs reading order)", () => {
  const html = componentsBodyHtml(
    {
      available: true,
      components: [
        component({
          name: "EmptyState",
          kdoc: "Shown when a load succeeds with nothing to list.",
          kdocDescription: "Shown when a load succeeds with nothing to list.",
          facts: { derivedTags: ["empty"], tokensReferenced: ["Tokens.PaddingPage"] },
          usedIn: ["composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt"],
          usedInScreens: ["composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt"],
        }),
      ],
    },
    { stateVariants: { loading: [], empty: [{ id: "home@empty", title: "Home — empty", png: "home@empty/screen.png" }], error: [] } },
  );
  const states = html.indexOf("component-live-variants");
  const notes = html.indexOf("usage notes");
  const signature = html.indexOf("params-table");
  const contract = html.indexOf("state contract");
  const usedIn = html.indexOf("used in");
  assert.ok(states !== -1 && notes !== -1 && signature !== -1 && contract !== -1 && usedIn !== -1);
  assert.ok(states < notes && notes < signature && signature < contract && contract < usedIn,
    "visual states first, then the component's own words, then the API table, then contract and call sites");
});

test("componentsBodyHtml: state contract renders ONLY facts with positive evidence, never a negative claim", () => {
  const withFacts = componentsBodyHtml({
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
  });
  assert.match(withFacts, /state contract/);
  assert.match(withFacts, /owns testTags derived from <code>screenTag<\/code>/);
  assert.match(withFacts, /&lt;screenTag&gt;_screen/);
  assert.match(withFacts, /Tokens\.PaddingPage/);
  assert.match(withFacts, /self-reports resolved values to the inspector/);
  assert.doesNotMatch(withFacts, /does not|does NOT/i, "no negative claim is ever rendered");

  const noFacts = componentsBodyHtml({
    available: true,
    components: [component({ paramsParsed: [], facts: {} })],
  });
  assert.doesNotMatch(noFacts, /state contract/, "an empty facts set omits the whole subsection, not an empty header");
});

test("componentsBodyHtml: ContentUiState arms and the 48dp a11y floor render with their evidence", () => {
  const html = componentsBodyHtml({
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
  });
  assert.match(html, /renders <code>ContentUiState<\/code> arms:.*Loading.*Error.*Empty.*Content/s);
  assert.match(html, /enforces the 48dp a11y touch-target floor/);
  assert.match(html, /48\.dp/);
});

test("componentsBodyHtml: the KDoc DESCRIPTION is quoted verbatim as usage notes; @param tags stay in the table, not the quote; absent kdoc omits the section", () => {
  const withKdoc = componentsBodyHtml({
    available: true,
    components: [
      component({
        kdoc: "Deliberately not an M3 TopAppBar.\n@param screenTag the tag root",
        kdocDescription: "Deliberately not an M3 TopAppBar.",
        paramDocs: { screenTag: "the tag root" },
      }),
    ],
  });
  assert.match(withKdoc, /from the component's own doc comment/);
  assert.match(withKdoc, /Deliberately not an M3 TopAppBar\./);
  assert.doesNotMatch(withKdoc, /component-kdoc">[\s\S]*@param/, "@param tags are not re-quoted in the usage notes");
  assert.match(withKdoc, /class="param-note">the tag root/);

  const noKdoc = componentsBodyHtml({ available: true, components: [component({ kdoc: null })] });
  assert.doesNotMatch(noKdoc, /usage notes/, "no kdoc found -> no fabricated usage-notes section");
});

test("componentsBodyHtml: approval badge reflects the components artifact's live status", () => {
  const approved = componentsBodyHtml(
    { available: true, components: [component()] },
    { approval: { status: "approved", hash: "abc123def456", approvedAt: "2026-07-19T00:00:00.000Z" } },
  );
  assert.match(approved, /badge-approved/);
  assert.match(approved, /approved &middot; abc123de/);

  const unreviewed = componentsBodyHtml(
    { available: true, components: [component()] },
    { approval: { status: "unreviewed" } },
  );
  assert.match(unreviewed, /badge-unreviewed/);
  assert.match(unreviewed, /not yet approved/);

  const noApproval = componentsBodyHtml({ available: true, components: [component()] });
  assert.doesNotMatch(noApproval, /badge-approved|badge-unreviewed|badge-changed|badge-reopened/, "no approvals data -> no fabricated badge");
});

test("componentsBodyHtml: drift — artifact-level badge plus a per-entry mtime chip when drift data resolves the file", () => {
  const html = componentsBodyHtml(
    { available: true, components: [component({ file: "a/ScreenColumn.kt" })] },
    {
      approval: { status: "changed-since-approval", hash: "new", storedHash: "old", approvedAt: "2026-07-19T00:00:00.000Z" },
      drift: { available: true, byFile: { "a/ScreenColumn.kt": { modifiedSinceApproval: true, mtime: "2026-07-19T01:00:00.000Z" } } },
    },
  );
  assert.match(html, /drift &middot; artifact changed since approval/);
  assert.match(html, /likely changed \(mtime\)/);

  const unchangedFile = componentsBodyHtml(
    { available: true, components: [component({ file: "a/ScreenColumn.kt" })] },
    {
      approval: { status: "changed-since-approval", hash: "new", storedHash: "old", approvedAt: "2026-07-19T00:00:00.000Z" },
      drift: { available: true, byFile: { "a/ScreenColumn.kt": { modifiedSinceApproval: false, mtime: "2026-07-18T01:00:00.000Z" } } },
    },
  );
  assert.match(unchangedFile, /unchanged since approval \(mtime\)/);
});

test("componentsBodyHtml: used-in lists screens first and flags a screen that hand-rolls a state this component owns", () => {
  const html = componentsBodyHtml(
    {
      available: true,
      components: [
        component({
          name: "ContentStateContainer",
          usedIn: [
            "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/AlphaFirst.kt",
            "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt",
          ],
          usedInScreens: ["composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt"],
        }),
      ],
    },
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
  const screenIdx = html.indexOf("HomeScreen.kt");
  const otherIdx = html.indexOf("AlphaFirst.kt");
  assert.ok(screenIdx !== -1 && otherIdx !== -1);
  assert.ok(screenIdx < otherIdx, "the screen call site lists before the alphabetically-earlier non-screen one");
});

test("componentsBodyHtml: live variant thumbnails render when a matching @state preview exists; honest degrade when it doesn't", () => {
  const withThumb = componentsBodyHtml(
    { available: true, components: [component({ name: "EmptyState", facts: { derivedTags: ["empty"] } })] },
    { stateVariants: { loading: [], empty: [{ id: "home@empty", title: "Home — empty", png: "home@empty/screen.png" }], error: [] } },
  );
  assert.match(withThumb, /live &#64;empty render/);
  assert.match(withThumb, /home@empty\/screen\.png/);

  const noThumbYet = componentsBodyHtml(
    { available: true, components: [component({ name: "EmptyState", facts: { derivedTags: ["empty"] } })] },
    { stateVariants: { loading: [], empty: [], error: [] } },
  );
  assert.match(noThumbYet, /live &#64;empty render/);
  assert.match(noThumbYet, /Not derivable statically &mdash; no <code>@empty<\/code> preview-registry entry has rendered yet/);

  const noStateTags = componentsBodyHtml({
    available: true,
    components: [component({ facts: { derivedTags: ["screen"] } })],
  });
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

// --- architectureTabHtml: per-ARCH-clause receipt status (Wave C item 1) ----

const GOVERNED_CONTRACT_ARCH_AND_SHELL = {
  available: true,
  file: "app-base.spec.md",
  clauses: [
    { id: "ARCH-01", withdrawn: false, prose: "Layers stay separated." },
    { id: "SHELL-01", withdrawn: false, prose: "The first tab renders on launch." },
  ],
};

test("architectureTabHtml: no meta.lastReceipt supplied -> treated exactly like 'no receipt' (honest badge on ARCH-01), never silently omitted", () => {
  const html = architectureTabHtml({
    layerMap: { available: false },
    governedContract: GOVERNED_CONTRACT_ARCH_AND_SHELL,
    featureShape: { available: false },
  });
  assert.match(html, /class="receipt-badge receipt-none"[^>]*>no receipt yet &mdash; run node qa\/verify\.mjs</);
  assert.equal((html.match(/class="receipt-badge/g) || []).length, 1, "only the ARCH clause gets the badge, not SHELL-01");
});

test("architectureTabHtml: meta.lastReceipt unavailable -> ARCH-01 gets an honest 'no receipt yet' badge naming the fix; SHELL-01 gets none (different gate, not attributed by this receipt)", () => {
  const html = architectureTabHtml(
    {
      layerMap: { available: false },
      governedContract: GOVERNED_CONTRACT_ARCH_AND_SHELL,
      featureShape: { available: false },
    },
    { lastReceipt: { available: false, reason: "no receipt at qa/evidence/latest.json — run node qa/verify.mjs" } },
  );
  assert.match(html, /class="receipt-badge receipt-none"[^>]*>no receipt yet &mdash; run node qa\/verify\.mjs</);
  // Scope check: exactly one receipt badge (ARCH-01's), not one per clause.
  assert.equal((html.match(/class="receipt-badge/g) || []).length, 1);
});

test("architectureTabHtml: fresh receipt (stale:false) -> ARCH-01 shows the real conformance verdict + age, never a stale label", () => {
  const html = architectureTabHtml(
    {
      layerMap: { available: false },
      governedContract: GOVERNED_CONTRACT_ARCH_AND_SHELL,
      featureShape: { available: false },
    },
    {
      lastReceipt: {
        available: true,
        conformance: { verdict: "PASS", durationMs: 4210 },
        ageMs: 90 * 60 * 1000, // 90 minutes
        generatedAt: "2026-07-19T06:00:00.000Z",
        stale: false,
      },
    },
  );
  assert.match(html, /class="receipt-badge receipt-pass"[^>]*>conformance: PASS</);
  assert.match(html, /class="receipt-age">1h ago</);
  assert.doesNotMatch(html, /stale receipt/);
});

test("architectureTabHtml: stale receipt (inputsHash no longer matches the tree) -> labeled 'stale receipt', the old PASS is never presented as current", () => {
  const html = architectureTabHtml(
    {
      layerMap: { available: false },
      governedContract: GOVERNED_CONTRACT_ARCH_AND_SHELL,
      featureShape: { available: false },
    },
    {
      lastReceipt: {
        available: true,
        conformance: { verdict: "PASS", durationMs: 4210 },
        ageMs: 3 * 60 * 60 * 1000, // 3 hours
        generatedAt: "2026-07-19T06:00:00.000Z",
        stale: true,
      },
    },
  );
  assert.match(html, /class="receipt-badge receipt-stale"[^>]*>stale receipt</);
  assert.doesNotMatch(html, /class="receipt-badge receipt-pass"/, "a stale receipt must never render the pass-colored badge as if it were current");
  assert.match(html, /conformance was PASS 3h ago &mdash; source changed since/);
});

test("architectureTabHtml: receipt exists but freshness is unverifiable (stale:null, e.g. no qa/lib/inputs-hash.mjs) -> verdict shown with an explicit 'freshness unverified' note, not silently treated as fresh", () => {
  const html = architectureTabHtml(
    {
      layerMap: { available: false },
      governedContract: GOVERNED_CONTRACT_ARCH_AND_SHELL,
      featureShape: { available: false },
    },
    {
      lastReceipt: {
        available: true,
        conformance: { verdict: "PASS", durationMs: 4210 },
        ageMs: 60_000,
        generatedAt: "2026-07-19T06:00:00.000Z",
        stale: null,
        staleReason: "qa/lib/inputs-hash.mjs not found or failed to load — cannot recompute the current tree's hash",
      },
    },
  );
  assert.match(html, /freshness unverified/);
  assert.doesNotMatch(html, /stale receipt/, "stale:null is 'unknown', not the same as confirmed stale");
});

test("architectureTabHtml: receipt exists but has no conformance step (e.g. a scaffold-profile run) -> honest 'no conformance step' note, never an invented verdict", () => {
  const html = architectureTabHtml(
    {
      layerMap: { available: false },
      governedContract: GOVERNED_CONTRACT_ARCH_AND_SHELL,
      featureShape: { available: false },
    },
    { lastReceipt: { available: true, conformance: null, stale: null } },
  );
  assert.match(html, /class="receipt-badge receipt-none">last receipt has no conformance step &mdash; run node qa\/verify\.mjs</);
});

test("architectureTabHtml: FAIL conformance verdict renders the fail-colored badge", () => {
  const html = architectureTabHtml(
    {
      layerMap: { available: false },
      governedContract: GOVERNED_CONTRACT_ARCH_AND_SHELL,
      featureShape: { available: false },
    },
    {
      lastReceipt: {
        available: true,
        conformance: { verdict: "FAIL", reason: "ARCH-01 violated", durationMs: 900 },
        ageMs: 60_000,
        stale: false,
      },
    },
  );
  assert.match(html, /class="receipt-badge receipt-fail"[^>]*>conformance: FAIL</);
});

// --- architectureTabHtml: dependency-graph advisory label (Wave C item 2) ---

test("architectureTabHtml: dependency graph carries the 'advisory preview; the lane is the law' label whenever a scan renders — edges present, zero edges, and a resolved-violation graph all carry it", () => {
  const withEdges = architectureTabHtml({
    layerMap: { available: false },
    governedContract: { available: false },
    featureShape: { available: false },
    dependencyGraph: {
      available: true,
      appPackage: "com.acme.demo",
      buckets: ["presentation", "domain"],
      edges: [{ from: "presentation", to: "domain", count: 1, violation: false, clauseId: null, occurrences: [] }],
      violations: [],
      rulesApplied: true,
    },
  });
  assert.match(withEdges, /class="dep-advisory">Advisory preview; the lane is the law/);
  assert.match(withEdges, /Kotlin conformance gates.*authoritative/);

  const zeroEdges = architectureTabHtml({
    layerMap: { available: false },
    governedContract: { available: false },
    featureShape: { available: false },
    dependencyGraph: { available: true, appPackage: "com.acme.demo", buckets: [], edges: [], violations: [], rulesApplied: true },
  });
  assert.match(zeroEdges, /class="dep-advisory">Advisory preview; the lane is the law/);

  const unavailable = architectureTabHtml({
    layerMap: { available: false },
    governedContract: { available: false },
    featureShape: { available: false },
    dependencyGraph: { available: false, reason: "composeApp/src/commonMain/kotlin not found." },
  });
  assert.doesNotMatch(unavailable, /dep-advisory/, "no scan ran -> nothing to caveat as advisory");
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

// --- componentsBodyHtml: component stories (§3.3 — the story render at the
// top of every entry's visual strip) -----------------------------------------

test("componentsBodyHtml: the entry's visual strip is story-first — the component's own story render, labeled with its registry id, precedes live @state variants and the params table", () => {
  const html = componentsBodyHtml(
    {
      available: true,
      components: [
        component({
          name: "EmptyState",
          facts: { derivedTags: ["empty"] },
        }),
      ],
    },
    {
      componentStories: {
        "empty-state": { id: "component.empty-state", title: "EmptyState — component story", png: "component.empty-state/screen.png" },
      },
      stateVariants: { loading: [], empty: [{ id: "home@empty", title: "Home — empty", png: "home@empty/screen.png" }], error: [] },
      version: 4,
      changedVersions: {},
    },
  );
  assert.match(html, /class="component-story"/);
  assert.match(html, /story render &mdash; <code>component\.empty-state<\/code>/, "labeled with the registry id");
  assert.match(html, /src="\/previews\/component\.empty-state\/screen\.png\?v=4"/, "story PNG uses the screen cards' version cache-buster");
  const story = html.indexOf("component-story");
  const variants = html.indexOf("component-live-variants");
  const params = html.indexOf("params-table");
  assert.ok(story !== -1 && variants !== -1 && params !== -1);
  assert.ok(story < variants && variants < params, "story render first, then live variants, then the signature");
});

test("componentsBodyHtml: a component with no story render on disk states the absence (standardized form) — never a broken image", () => {
  const html = componentsBodyHtml(
    { available: true, components: [component({ name: "AppHeader" })] },
    { componentStories: {}, version: 2, changedVersions: {} },
  );
  assert.match(html, /no story render yet &mdash; run the preview render to produce <code>component\.app-header<\/code>/);
  assert.doesNotMatch(html, /<img[^>]*component\.app-header/, "no fabricated story thumbnail");
});

test("componentsBodyHtml: story renders show even with NO componentStories meta at all (older service) — as the absence line, not an error", () => {
  const html = componentsBodyHtml({ available: true, components: [component({ name: "AppHeader" })] });
  assert.match(html, /no story render yet/);
});

test("componentsBodyHtml: a story changed in this render carries the persistent changed-#N chip (same vocabulary as the Screens grid)", () => {
  const html = componentsBodyHtml(
    { available: true, components: [component({ name: "ListItemCard" })] },
    {
      componentStories: {
        "list-item-card": { id: "component.list-item-card", title: "ListItemCard — component story", png: "component.list-item-card/screen.png" },
      },
      version: 6,
      changedVersions: { "component.list-item-card": 6 },
    },
  );
  assert.match(html, /<span class="chg">changed #6<\/span>/);
});

test("componentsBodyHtml: a parse-error entry still shows its story render (render evidence is scan-independent)", () => {
  const html = componentsBodyHtml(
    {
      available: true,
      components: [component({ name: "Broken", parseError: true, params: [], paramsParsed: [] })],
    },
    {
      componentStories: {
        broken: { id: "component.broken", title: "Broken — component story", png: "component.broken/screen.png" },
      },
      version: 1,
      changedVersions: {},
    },
  );
  assert.match(html, /signature not parsed/);
  assert.match(html, /src="\/previews\/component\.broken\/screen\.png\?v=1"/);
});
