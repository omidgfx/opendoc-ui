#!/usr/bin/env python3
"""Generate OpenDoc UI marketing subpages from a shared shell."""
import pathlib

SITE = pathlib.Path(__file__).parent

NAV_ITEMS = [("index.html","Home"),("features.html","Features"),("guide.html","Guide"),
             ("compatibility.html","Compatibility"),("deploy.html","Deploy"),
             ("developers.html","Developers"),("faq.html","FAQ")]

def shell(fname, title, desc, body):
    nav = "\n".join(
        f'        <a href="{h}"{" class=\"active\"" if h == fname else ""}>{t}</a>'
        for h, t in NAV_ITEMS)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{title}</title>
<meta name="description" content="{desc}"/>
<link rel="icon" type="image/svg+xml" href="assets/logo.svg"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/regular/style.css"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/fill/style.css"/>
<link rel="stylesheet" href="assets/css/site.css?v=5"/>
<script>
(function(){{try{{var t=localStorage.getItem('opendoc-site-theme')||'system';
var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.setAttribute('data-theme',d?'dark':'light');}}catch(e){{}}}})();
</script>
</head>
<body>
<div class="scroll-progress" aria-hidden="true"></div>

<header class="site-header" id="site-header">
  <div class="container" style="padding:0 16px">
    <div class="nav">
      <a class="brand" href="index.html"><img src="assets/logo.svg" alt="OpenDoc UI logo" width="30" height="30"/><span>OpenDoc<b>&nbsp;UI</b></span></a>
      <nav class="nav-links" id="nav-links">
{nav}
      </nav>
      <div class="nav-cta">
        <button class="theme-btn" id="theme-btn" aria-label="Change theme"><i class="ph ph-monitor"></i></button>
        <a class="btn btn-ghost" href="https://github.com/omidgfx/opendoc-ui" target="_blank" rel="noreferrer"><i class="ph-fill ph-github-logo"></i> GitHub</a>
        <a class="btn btn-brand" href="https://omidgfx.github.io/opendoc-ui/demo/">Open the demo <i class="ph-fill ph-arrow-up-right"></i></a>
        <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false"><i class="ph ph-list"></i></button>
      </div>
    </div>
  </div>
</header>

{body}

<footer class="site-footer on-dark">
  <div class="container">
    <div class="foot-grid">
      <div class="foot-brand">
        <a class="brand" href="index.html" style="color:#fff"><img src="assets/logo.svg" alt="OpenDoc UI logo" width="30" height="30"/><span>OpenDoc<b style="color:var(--brand-bright)">&nbsp;UI</b></span></a>
        <p>A client-side OpenAPI/Swagger documentation browser and API runner with theming, code generation, local notes, and local file support. Crafted by <a href="https://github.com/omidgfx" target="_blank" rel="noreferrer">Pejman Chatrrouz</a>.</p>
      </div>
      <div>
        <h4>Product</h4>
        <a href="features.html">Features</a>
        <a href="compatibility.html">Compatibility</a>
        <a href="https://omidgfx.github.io/opendoc-ui/demo/">Live demo</a>
        <a href="faq.html">FAQ</a>
      </div>
      <div>
        <h4>Learn</h4>
        <a href="guide.html">User guide</a>
        <a href="deploy.html">Deployment</a>
        <a href="developers.html">For developers</a>
      </div>
      <div>
        <h4>Project</h4>
        <a href="https://github.com/omidgfx/opendoc-ui" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://github.com/omidgfx/opendoc-ui/blob/master/CHANGELOG.md" target="_blank" rel="noreferrer">Changelog</a>
        <a href="https://github.com/omidgfx/opendoc-ui/blob/master/LICENSE" target="_blank" rel="noreferrer">MIT License</a>
      </div>
    </div>
    <div class="foot-bottom">
      <span>© <span id="year">2026</span> OpenDoc UI · Released under the MIT License</span>
      <span>Made with <i class="ph-fill ph-heart heart"></i> in Iran</span>
    </div>
  </div>
</footer>

<script src="assets/js/site.js?v=5"></script>
</body>
</html>
'''

def page_hero(eyebrow, title_html, lead):
    return f'''<section class="page-hero">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="container">
    <span class="eyebrow reveal">{eyebrow}</span>
    <h1 class="reveal d1">{title_html}</h1>
    <p class="lead reveal d2">{lead}</p>
  </div>
</section>'''

PAGES = {}

# ────────────────────────── FEATURES ──────────────────────────
PAGES["features.html"] = (
    "Features — OpenDoc UI",
    "Every capability of OpenDoc UI in depth: documentation browser, API runner, schema explorer, code generation, local notes, AI assistant, workspace and themes.",
    page_hero("Features",
        'Every capability,<br/><span class="h-accent">examined in detail</span>',
        "What it does, why it matters, and how it changes the way you work with APIs. Each surface below is live in the demo — nothing here is a mockup of a roadmap.")
    + '''
<section class="section" style="padding-top:20px">
  <div class="container">

    <div class="feature-row" id="docs">
      <div>
        <span class="eyebrow reveal">01 · Read</span>
        <h2 class="reveal d1">Documentation browser</h2>
        <p class="reveal d2">Any OpenAPI 3.0/3.1/3.2 or Swagger 2.0 document becomes a fully navigable reference. Endpoints group by tag into a sidebar tree that respects your sorting, route-display, protection and deprecation preferences — a large specification becomes an orderly index rather than an overwhelming list.</p>
        <ul class="checklist reveal d3">
          <li><i class="ph-fill ph-check"></i><span>Parameter tables with types, formats, patterns and examples — plus a built-in <b>regex pattern tester</b>.</span></li>
          <li><i class="ph-fill ph-check"></i><span>Request-body context with encoding-type selection and explicit <b>oneOf / anyOf branch chips</b>.</span></li>
          <li><i class="ph-fill ph-check"></i><span>Response matrix with per-status examples and deep-linkable anchors like <code class="inline">#response-200</code>.</span></li>
          <li><i class="ph-fill ph-check"></i><span><b>Cycle-safe rendering</b> — recursive branches terminate at their boundary, marked with a loop icon.</span></li>
        </ul>
      </div>
      <div class="fr-media reveal d2"><img src="assets/opendoc-docs.png" alt="OpenDoc UI documentation view with endpoint tree, method badges and schema tables" loading="lazy"/></div>
    </div>

    <div class="feature-row rev" id="runner">
      <div>
        <span class="eyebrow reveal">02 · Run</span>
        <h2 class="reveal d1">Built-in API Runner</h2>
        <p class="reveal d2">Documentation is passive; the Runner is active. Execute genuine requests from the browser against the servers declared in your specification — the gap between reading an endpoint and calling it disappears.</p>
        <ul class="checklist reveal d3">
          <li><i class="ph-fill ph-check"></i><span>Path, query, header and cookie parameters rendered as inputs with documented examples and constraints.</span></li>
          <li><i class="ph-fill ph-check"></i><span>Recursive form editor or raw JSON/YAML/XML bodies with format-aware validation, multipart uploads included.</span></li>
          <li><i class="ph-fill ph-check"></i><span>First-class auth: bearer tokens, API keys, basic auth, OAuth and cookies.</span></li>
          <li><i class="ph-fill ph-check"></i><span>Status, headers, body and history inspection with request cancellation and bounded response details.</span></li>
        </ul>
      </div>
      <div class="fr-media reveal d2"><img src="assets/opendoc-runner.png" alt="The API Runner composing a POST /pet request with a form-based payload editor" loading="lazy"/></div>
    </div>

    <div class="feature-row" id="schemas">
      <div>
        <span class="eyebrow reveal">03 · Understand</span>
        <h2 class="reveal d1">Schema explorer</h2>
        <p class="reveal d2">Inspect every schema in the document to any depth. The hard cases — deeply nested objects, recursive trees, mutually referencing schemas, polymorphic discriminators — render safely, and modern 3.1/3.2 keywords are handled explicitly.</p>
        <ul class="checklist reveal d3">
          <li><i class="ph-fill ph-check"></i><span><code class="inline">const</code>, <code class="inline">prefixItems</code>, <code class="inline">unevaluatedProperties</code>, <code class="inline">if/then/else</code>, type unions and webhooks.</span></li>
          <li><i class="ph-fill ph-check"></i><span>Enum values, defaults, constraints and examples surfaced inline.</span></li>
          <li><i class="ph-fill ph-check"></i><span>Every schema modal is deep-linkable and shareable.</span></li>
        </ul>
      </div>
      <div class="fr-media reveal d2"><img src="assets/opendoc-schemas.png" alt="Schema explorer showing nested object structures" loading="lazy"/></div>
    </div>

    <div class="feature-row rev" id="notes">
      <div>
        <span class="eyebrow reveal">04 · Remember</span>
        <h2 class="reveal d1">Local notes &amp; todos</h2>
        <p class="reveal d2">Keep private Markdown notes and todos beside any endpoint — knowledge that belongs to you, not the spec. Fourteen translucent, theme-safe tones keep them readable in every palette.</p>
        <ul class="checklist reveal d3">
          <li><i class="ph-fill ph-check"></i><span>Deletion is never final — a trash with orphaned-note detection catches notes whose endpoints vanished.</span></li>
          <li><i class="ph-fill ph-check"></i><span>Export and import everything as JSON.</span></li>
          <li><i class="ph-fill ph-check"></i><span>Optionally hide an endpoint after confirming its last todo — and restore hidden endpoints any time.</span></li>
        </ul>
      </div>
      <div class="fr-media reveal d2"><img src="assets/opendoc-notes.png" alt="Local notes pinned beside endpoints in themed tones" loading="lazy"/></div>
    </div>

    <div style="height:40px"></div>

    <div class="section-head" id="more">
      <span class="eyebrow reveal">And the rest of the workstation</span>
      <h2 class="reveal d1">Small features, <span class="h-accent">obsessively</span> finished</h2>
    </div>
    <div class="card-grid">
      <div class="info-card reveal" id="codegen">
        <h3><i class="ph ph-code"></i>Code &amp; type generation</h3>
        <p>fetch / axios / Angular snippets plus TypeScript models generated from your schemas — secret-redacted and downloadable as a zip.</p>
        <span class="mono-tag">curl · fetch · axios · types.ts</span>
      </div>
      <div class="info-card reveal d1" id="ai">
        <h3><i class="ph ph-sparkle"></i>AI assistant</h3>
        <p>Grounded answers from retrieved, redacted endpoint/schema context with clickable source citations. Swagger/REST skill packs, per-spec saved conversations, and Runner handoff.</p>
        <span class="mono-tag">direct provider · hardened gateway</span>
      </div>
      <div class="info-card reveal d2" id="workspace">
        <h3><i class="ph ph-squares-four"></i>Tabbed workspace</h3>
        <p>Overview, search, schema explorer, about and assistant open as tabs beside endpoints — preview/pin, close, reorder, middle-click, context menu. Like an IDE, because it is one.</p>
        <span class="mono-tag">tabs · split view · deep links</span>
      </div>
      <div class="info-card reveal">
        <h3><i class="ph ph-magnifying-glass"></i>Global search</h3>
        <p><span class="kbd">Ctrl/⌘ + K</span> searches paths, summaries, tags and schema definitions, with method/tag/security filters synced with the sidebar.</p>
      </div>
      <div class="info-card reveal d1" id="themes">
        <h3><i class="ph ph-palette"></i>Theme system</h3>
        <p>15+ hand-picked palettes with per-spec memory and light / dark / system modes. Notes, badges and code views stay legible in every one.</p>
      </div>
      <div class="info-card reveal d2">
        <h3><i class="ph ph-eye-slash"></i>Hidden endpoints</h3>
        <p>Move endpoints into a muted folder without touching the OpenAPI source — unhide individually or restore all from navigation settings.</p>
      </div>
      <div class="info-card reveal">
        <h3><i class="ph ph-shield-check"></i>Runner Compatibility report</h3>
        <p>An honest, per-endpoint matrix of what the browser can and cannot do for a given API — CORS constraints, credentialed requests and cookie behavior, stated before you waste a minute.</p>
      </div>
      <div class="info-card reveal d1">
        <h3><i class="ph ph-arrows-clockwise"></i>Spec caching &amp; refresh</h3>
        <p>Remote specs cache in IndexedDB and revalidate with <code class="inline">If-None-Match</code> / <code class="inline">If-Modified-Since</code>. One button drops the cache and re-fetches — or re-reads your local file from disk.</p>
      </div>
      <div class="info-card reveal d2">
        <h3><i class="ph ph-clock-counter-clockwise"></i>Local history</h3>
        <p>Every file you open and every remote URL you load lands in a persistent, browser-local history — reopen yesterday's spec in one click, no re-upload.</p>
      </div>
    </div>

    <div style="text-align:center;margin-top:64px" class="reveal">
      <a class="btn btn-brand btn-lg" href="https://omidgfx.github.io/opendoc-ui/demo/"><i class="ph-fill ph-play"></i> See all of it live</a>
    </div>
  </div>
</section>''')

# ────────────────────────── GUIDE ──────────────────────────
PAGES["guide.html"] = (
    "Guide — OpenDoc UI",
    "The complete OpenDoc UI user guide: loading specifications, reading documentation, running requests, authentication, schemas, code generation, notes, hidden endpoints, deep links, caching, persistence, the AI assistant, themes and keyboard shortcuts.",
    page_hero("User guide",
        'From zero to <span class="h-accent">fluent</span>,<br/>one honest manual',
        "Everything you need to work with OpenDoc UI day to day — loading, reading, running, generating, remembering and sharing.")
    + '''
<section class="section" style="padding-top:10px">
  <div class="container doc-layout">
    <nav class="doc-toc" aria-label="On this page">
      <a href="#quickstart">Quick start</a>
      <a href="#loading">Loading specifications</a>
      <a href="#caching">Caching &amp; refresh</a>
      <a href="#reading">Reading the docs</a>
      <a href="#workspace">Tabs &amp; workspace</a>
      <a href="#running">Running requests</a>
      <a href="#auth">Authentication</a>
      <a href="#schemas">Working with schemas</a>
      <a href="#codegen">Generating code</a>
      <a href="#notes">Notes &amp; trash</a>
      <a href="#hidden">Hidden endpoints</a>
      <a href="#ai">The AI assistant</a>
      <a href="#links">Deep links &amp; routing</a>
      <a href="#persistence">Browser persistence</a>
      <a href="#themes">Themes</a>
      <a href="#shortcuts">Keyboard shortcuts</a>
    </nav>
    <div>
      <div class="doc-sec prose" id="quickstart">
        <h2><i class="ph-fill ph-lightning"></i>Quick start</h2>
        <p>The fastest route: open the <a class="link-arrow" href="https://omidgfx.github.io/opendoc-ui/demo/">live demo</a> and drop any <code class="inline">.json</code> / <code class="inline">.yaml</code> / <code class="inline">.yml</code> OpenAPI file onto it. Parsing, normalization and rendering happen in your browser — the file is never uploaded, and the original document is never modified.</p>
        <p>To run it yourself:</p>
        <div class="code-block"><span class="c"># clone, install, develop</span>
git clone https://github.com/omidgfx/opendoc-ui
npm ci
npm run dev        <span class="c"># development server on :3000</span></div>
      </div>

      <div class="doc-sec prose" id="loading">
        <h2><i class="ph-fill ph-folder-open"></i>Loading specifications</h2>
        <h3>1 · Local files</h3>
        <p>With no configuration at all, OpenDoc UI runs in <b>local mode</b>: open files straight from your device and get a persistent history of everything you opened. When the browser supports file handles, the refresh button can even re-read the file from disk.</p>
        <h3>2 · Remote URLs</h3>
        <p>When the build enables URL loading, paste any reachable specification URL. The browser fetches it directly; for restrictive networks, optional downloader proxies (reference implementations in six frameworks) fetch on your behalf, with direct-fetch fallbacks and clear CORS guidance when something is unreachable.</p>
        <h3>3 · Configured specifications</h3>
        <p>Deployments can ship a curated catalog through <code class="inline">public/config.json</code> or <code class="inline">window.INITIAL_CONFIG</code>. The hybrid option combines a configured catalog with local file opening — teams get the official specs <em>and</em> the freedom to inspect anything else.</p>
      </div>

      <div class="doc-sec prose" id="caching">
        <h2><i class="ph-fill ph-arrows-clockwise"></i>Spec caching &amp; the refresh button</h2>
        <p>Remote specifications are cached in IndexedDB. A fresh entry is trusted for five minutes; after that the app revalidates with <code class="inline">If-None-Match</code> and/or <code class="inline">If-Modified-Since</code> when the server supplied those headers. If revalidation fails, the stale copy can serve as an offline fallback — but stale data is never treated as fresh indefinitely.</p>
        <p>The <b>refresh button</b> (circular arrows beside the spec selector) drops the cache and reloads: it clears every cached spec and re-fetches the current one. In local mode the same button re-reads the opened file from disk or re-parses the stored text. The icon spins while a refresh is in flight.</p>
      </div>

      <div class="doc-sec prose" id="reading">
        <h2><i class="ph-fill ph-book-open-text"></i>Reading the documentation</h2>
        <p>The sidebar groups endpoints by tag — with nested groups, counts, protection and deprecation indicators — and respects your sorting and route-display preferences. Each operation opens a documentation view that leaves nothing hidden: parameter tables with types, formats, patterns and examples; request-body context with encoding selection and explicit <code class="inline">oneOf</code>/<code class="inline">anyOf</code> branch chips; and a response matrix with per-status examples, schema tables and enum values.</p>
        <p>Pattern constraints carry a built-in regex tester, so you can validate candidate values against the exact expression before ever sending a request. Recursive and mutually referencing schemas render cycle-safe, with recursive branches marked by a loop icon at their boundary.</p>
      </div>

      <div class="doc-sec prose" id="workspace">
        <h2><i class="ph-fill ph-squares-four"></i>Tabs &amp; the workspace</h2>
        <p>OpenDoc UI behaves like an IDE. Endpoints, the overview, global search, the schema explorer, the about page and the assistant all open as <b>tabs</b> in the same bar. Single-click previews a tab, double-click (or middle-click in the sidebar) pins it permanently; drag to reorder, middle-click or use the context menu to close. A <b>split view</b> shows documentation and the Runner side by side, with a draggable divider whose width is remembered.</p>
      </div>

      <div class="doc-sec prose" id="running">
        <h2><i class="ph-fill ph-flask"></i>Running requests</h2>
        <p>Switch any endpoint to the <b>API Runner</b> tab. Inputs are generated from the specification: path/query/header/cookie parameters, a recursive form editor for bodies (or raw JSON/YAML/XML with format-aware validation), and multipart file uploads. Press <span class="kbd">Ctrl/⌘ + Enter</span> to send; inspect status, headers, body and history below, cancel long requests, and keep per-endpoint inputs saved between sessions.</p>
        <p>Requests use the browser's fetch API, so standard CORS rules apply. The <b>Runner Compatibility</b> report — one click from the overview — states per endpoint what the browser can and cannot do for the API, before you waste time guessing.</p>
      </div>

      <div class="doc-sec prose" id="auth">
        <h2><i class="ph-fill ph-lock-key"></i>Authentication</h2>
        <p>The Authorize dialog understands the security schemes your spec declares: bearer tokens, API keys (header/query/cookie), basic auth and OAuth flows — including a native <code class="inline">/oauth/callback</code> route for authorization-code flows. Credentials are stored locally per specification, injected into Runner requests automatically, and redacted from generated snippets and AI context.</p>
      </div>

      <div class="doc-sec prose" id="schemas">
        <h2><i class="ph-fill ph-diamonds-four"></i>Working with schemas</h2>
        <p>Open the Schema Explorer from the sidebar or click any schema reference in the docs. Composed (<code class="inline">oneOf</code>/<code class="inline">anyOf</code>/<code class="inline">allOf</code>) and recursive structures render cycle-safe; modern 3.1/3.2 keywords — <code class="inline">const</code>, <code class="inline">prefixItems</code>, <code class="inline">unevaluatedProperties</code>, <code class="inline">if/then/else</code>, type unions — are handled explicitly. Multiple schemas can be open at once, and the set is encoded in the URL (<code class="inline">?schemas=Pet,Order</code>) so the exact view is shareable.</p>
      </div>

      <div class="doc-sec prose" id="codegen">
        <h2><i class="ph-fill ph-code"></i>Generating code &amp; types</h2>
        <p>Every endpoint offers fetch, axios and Angular snippets; every schema offers TypeScript models. Download the whole set as a zip. Secrets you entered for the Runner are replaced with placeholders before anything is rendered or exported.</p>
      </div>

      <div class="doc-sec prose" id="notes">
        <h2><i class="ph-fill ph-note-pencil"></i>Notes, trash &amp; orphaned notes</h2>
        <p>Attach Markdown notes and todos to any endpoint in fourteen translucent, theme-safe tones. Deleting moves a note to the trash, never oblivion; if a spec changes and a note's endpoint disappears, <b>orphaned-note detection</b> flags it so nothing is silently lost. Export and import everything as JSON to move machines or make backups.</p>
      </div>

      <div class="doc-sec prose" id="hidden">
        <h2><i class="ph-fill ph-eye-slash"></i>Hidden endpoints</h2>
        <p>Some endpoints are noise for your work. Move them into a muted <b>Hidden</b> folder without changing the OpenAPI source — optionally, OpenDoc UI offers to hide an endpoint when you confirm its last todo. Unhide endpoints individually, or restore all of them from navigation settings.</p>
      </div>

      <div class="doc-sec prose" id="ai">
        <h2><i class="ph-fill ph-sparkle"></i>The AI assistant</h2>
        <p>Ask questions about the open specification and get answers grounded in retrieved, redacted endpoint/schema context — with citations that open the source view. Configure a direct provider (OpenAI, Anthropic, Ollama, OpenRouter or any OpenAI-compatible endpoint) or point at a server-side gateway that keeps keys out of the browser. Swagger/REST skill packs sharpen its answers, conversations save per spec, and the assistant can pre-fill the Runner with a ready-to-send request.</p>
      </div>

      <div class="doc-sec prose" id="links">
        <h2><i class="ph-fill ph-link"></i>Deep links &amp; URL routing</h2>
        <p>Everything after the <code class="inline">#</code> is handled by the application and never reaches the server — so the same URL works on GitHub Pages, nginx, S3 or even <code class="inline">file://</code> without rewrite rules, and refreshing or sharing a link always restores the exact view. The main shapes:</p>
        <div class="table-card" style="margin:16px 0 6px"><div class="table-wrap">
          <table>
            <thead><tr><th>Route</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td><span class="mono">#/</span></td><td class="wrap">Home (no specification)</td></tr>
              <tr><td><span class="mono">#/parsable/&lt;key&gt;</span></td><td class="wrap">Home of a configured or local specification</td></tr>
              <tr><td><span class="mono">#/parsable/&lt;key&gt;/api/&lt;endpointId&gt;</span></td><td class="wrap">A specific endpoint in a permanent tab</td></tr>
              <tr><td><span class="mono">#/…/schema-explorer?schemas=Pet</span></td><td class="wrap">Schema Explorer with schemas open</td></tr>
              <tr><td><span class="mono">#/…/notes</span> · <span class="mono">#/…/compatibility</span></td><td class="wrap">Local notes · Runner compatibility matrix</td></tr>
              <tr><td><span class="mono">#/…/about</span> · <span class="mono">#/…/assistant</span></td><td class="wrap">About page · AI assistant</td></tr>
            </tbody>
          </table>
        </div></div>
        <p>Query parameters inside the hash include <code class="inline">?tab=examine|doc</code> and <code class="inline">?search=…</code>; response deep links append <code class="inline">#response-200</code> after the route.</p>
      </div>

      <div class="doc-sec prose" id="persistence">
        <h2><i class="ph-fill ph-database"></i>Browser persistence</h2>
        <p>All persistence goes through an IndexedDB-first storage layer that hydrates before the UI starts, validates every read, self-repairs corrupt entries, and falls back to localStorage only when IndexedDB is unavailable. Sidebar width, collapsed folders, split-view width, per-spec themes, open tabs, per-endpoint Runner inputs, response history, notes and AI conversations all persist — on your machine, in your browser, and nowhere else. Per-spec data is pruned automatically when a spec disappears from the configuration.</p>
      </div>

      <div class="doc-sec prose" id="themes">
        <h2><i class="ph-fill ph-palette"></i>Themes &amp; appearance</h2>
        <p>Choose from 15+ hand-picked palettes in the theme menu; light, dark and system modes apply on top. The choice is remembered per specification, so each API keeps its own look. Notes, method badges and code views stay legible in every combination.</p>
      </div>

      <div class="doc-sec" id="shortcuts">
        <h2 style="margin-bottom:22px"><i class="ph-fill ph-keyboard"></i>Keyboard shortcuts</h2>
        <div class="kbd-grid">
          <div class="kbd-row"><span>Focus global search</span><span class="kbd">Ctrl/⌘ + K</span></div>
          <div class="kbd-row"><span>Close top-most modal / overlay</span><span class="kbd">Esc</span></div>
          <div class="kbd-row"><span>Previous / next endpoint tab</span><span class="kbd">Alt + ← / →</span></div>
          <div class="kbd-row"><span>Tab switcher (Alt-Tab style)</span><span class="kbd">Ctrl + ` / Ctrl + Shift + `</span></div>
          <div class="kbd-row"><span>Send request (in Runner)</span><span class="kbd">Ctrl + Enter</span></div>
          <div class="kbd-row"><span>Move focus between split panes</span><span class="kbd">Ctrl + ↑ / ↓</span></div>
          <div class="kbd-row"><span>Pin a permanent tab</span><span class="kbd">Middle-click sidebar endpoint</span></div>
          <div class="kbd-row"><span>Keep the preview tab</span><span class="kbd">Double-click</span></div>
        </div>
        <p class="muted" style="margin-top:16px;font-size:14px">The About page inside the app lists the full set, including every mouse interaction.</p>
      </div>
    </div>
  </div>
</section>''')

# ────────────────────────── COMPATIBILITY ──────────────────────────
PAGES["compatibility.html"] = (
    "Compatibility — OpenDoc UI",
    "What OpenDoc UI understands, where it runs, and which ecosystems it speaks — specification dialects, deployment targets, browsers, AI providers and downloader proxies.",
    page_hero("Compatibility",
        'Measured <span class="h-accent">precisely</span>,<br/>not approximated',
        "What OpenDoc UI understands, where it runs, and which ecosystems it speaks.")
    + '''
<section class="section" style="padding-top:10px">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow reveal">Specification dialects</span>
      <h2 class="reveal d1">Every generation of the format</h2>
      <p class="lead reveal d2">From legacy Swagger documents to the newest OpenAPI 3.2 constructs — parsed, normalized and rendered correctly, including vendor extensions and webhooks.</p>
    </div>
    <div class="table-card reveal"><div class="table-wrap">
      <table>
        <thead><tr><th>Dialect</th><th>Parsing</th><th>Rendering</th><th>Runner</th><th>Notes</th></tr></thead>
        <tbody>
          <tr><td><span class="mono">openapi: 3.0.x</span></td><td><span class="pill-ok"><i class="ph-fill ph-check-circle"></i> Complete</span></td><td><span class="pill-ok"><i class="ph-fill ph-check-circle"></i> Complete</span></td><td><span class="pill-ok"><i class="ph-fill ph-check-circle"></i> Supported</span></td><td class="muted wrap" style="font-size:13.5px">nullable semantics preserved; parameters, security, callbacks and links rendered</td></tr>
          <tr><td><span class="mono">openapi: 3.1.x</span></td><td><span class="pill-ok"><i class="ph-fill ph-check-circle"></i> Complete</span></td><td><span class="pill-ok"><i class="ph-fill ph-check-circle"></i> Complete</span></td><td><span class="pill-ok"><i class="ph-fill ph-check-circle"></i> Supported</span></td><td class="muted wrap" style="font-size:13.5px">JSON Schema 2020-12 keywords — const, prefixItems, unevaluatedProperties, if/then/else, type unions</td></tr>
          <tr><td><span class="mono">openapi: 3.2.x</span></td><td><span class="pill-ok"><i class="ph-fill ph-check-circle"></i> Complete</span></td><td><span class="pill-ok"><i class="ph-fill ph-check-circle"></i> Complete</span></td><td><span class="pill-ok"><i class="ph-fill ph-check-circle"></i> Supported</span></td><td class="muted wrap" style="font-size:13.5px">webhooks, additionalOperations, query methods and the newest meta-schema surface</td></tr>
          <tr><td><span class="mono">swagger: "2.0"</span></td><td><span class="pill-ok"><i class="ph-fill ph-check-circle"></i> Complete</span></td><td><span class="pill-soft">Normalized to 3.x</span></td><td><span class="pill-ok"><i class="ph-fill ph-check-circle"></i> Supported</span></td><td class="muted wrap" style="font-size:13.5px">definitions, formData and body parameters, file uploads, collection formats, securityDefinitions</td></tr>
        </tbody>
      </table>
    </div></div>
    <p class="muted reveal" style="margin-top:16px;font-size:14px">Multi-file documents resolve in-memory: local reference graphs, same-origin external references and bundled documents are all handled, with clear diagnostics for anything unresolved.</p>

    <div style="height:70px"></div>
    <div class="section-head">
      <span class="eyebrow reveal">Deployment targets</span>
      <h2 class="reveal d1">Where the application runs</h2>
    </div>
    <div class="card-grid">
      <div class="info-card reveal"><h3><i class="ph ph-globe-hemisphere-west"></i>Static hosts</h3><p>GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3 and any nginx or Apache static server. A single <code class="inline">dist/</code> directory is all that is required — no runtime, no database.</p></div>
      <div class="info-card reveal d1"><h3><i class="ph ph-shipping-container"></i>Docker</h3><p>A compose-based image serves the verified bundle from nginx with a health check, reproducible lockfile builds and cross-platform helper scripts for Windows, macOS and Linux.</p></div>
      <div class="info-card reveal d2"><h3><i class="ph ph-browsers"></i>Browsers</h3><p>Modern evergreen browsers on desktop and mobile: Chromium, Firefox, Safari and Edge. The interface adapts to small screens with a mobile sidebar and touch-friendly interactions.</p></div>
    </div>

    <div style="height:70px"></div>
    <div class="section-head">
      <span class="eyebrow reveal">AI providers</span>
      <h2 class="reveal d1">The assistant connects to<br/>what you <span class="h-accent">already use</span></h2>
    </div>
    <div class="card-grid">
      <div class="info-card reveal"><h3><i class="ph ph-plugs-connected"></i>Direct provider mode</h3><p>OpenAI, Anthropic, Ollama, OpenRouter or any OpenAI-compatible endpoint reachable from the browser, with global profiles for keys, models, temperature and skills.</p></div>
      <div class="info-card reveal d1"><h3><i class="ph ph-shield-check"></i>Server-side gateway</h3><p>The included hardened gateway owns provider credentials and enforces token authentication, origin allowlists, rate limits, concurrency bounds and upstream timeouts.</p></div>
      <div class="info-card reveal d2"><h3><i class="ph ph-stack"></i>Framework examples</h3><p>Gateway reference implementations for Node (Express), Python (FastAPI, Django), PHP (Laravel), Ruby (Rails), Java (Spring Boot), .NET (ASP.NET Core), Go (Gin) and Rust (Axum).</p></div>
    </div>

    <div style="height:70px"></div>
    <div class="section-head">
      <span class="eyebrow reveal">Downloader proxies</span>
      <h2 class="reveal d1">Remote specs behind restrictive networks</h2>
      <p class="lead reveal d2">When a specification URL can't be fetched directly from the browser, a tiny downloader service fetches it for you. Reference implementations ship in six frameworks:</p>
    </div>
    <div class="cloud reveal" style="justify-content:flex-start">
      <span>Node · Express</span><span>Python · FastAPI</span><span>Python · Django</span><span>PHP · Laravel</span><span>Java · Spring Boot</span><span>Go · Gin</span>
    </div>

    <div style="height:70px"></div>
    <div class="card-grid two">
      <div class="info-card reveal"><h3><i class="ph ph-translate"></i>Speak your team's language</h3><p>The interface localizes cleanly, and specification content renders exactly as authored — descriptions, Markdown and examples included.</p></div>
      <div class="info-card reveal d1"><h3><i class="ph ph-seal-check"></i>Honest capability reporting</h3><p>The Runner Compatibility report states plainly what the browser can and cannot do for a given API — CORS constraints, credentialed requests, cookie behavior — before you waste a minute wondering.</p></div>
    </div>
  </div>
</section>''')

# ────────────────────────── DEPLOY ──────────────────────────
PAGES["deploy.html"] = (
    "Deploy — OpenDoc UI",
    "Every deployment path for OpenDoc UI: static hosting, GitHub Pages, Docker, the builder CLI, configuration modes, the AI gateway and downloader proxies.",
    page_hero("Deployment",
        'A folder is the<br/><span class="h-accent">whole deployment</span>',
        "From a single static directory to a hardened Docker stack with an AI gateway — every path, documented end to end.")
    + '''
<section class="section" style="padding-top:10px">
  <div class="container doc-layout">
    <nav class="doc-toc" aria-label="On this page">
      <a href="#static">Static hosting</a>
      <a href="#pages">GitHub Pages</a>
      <a href="#docker">Docker</a>
      <a href="#make">Builder CLI</a>
      <a href="#config">Config modes</a>
      <a href="#gateway">AI gateway</a>
    </nav>
    <div>
      <div class="doc-sec prose" id="static">
        <h2><i class="ph-fill ph-globe-hemisphere-west"></i>Static hosting</h2>
        <p>OpenDoc UI compiles to a single self-contained directory. Build once, copy <code class="inline">dist/</code> anywhere, and the entire application works without a server process, database or runtime dependency.</p>
        <div class="code-block">npm ci
npm run build      <span class="c"># dist/ with index.html, index.js, 404.html</span></div>
        <p>Deploy <code class="inline">dist/</code> to nginx, Netlify, Vercel, Cloudflare Pages, S3 static websites or Apache. The included <code class="inline">404.html</code> provides SPA fallback so deep links keep working on hosts without rewrite rules — and because routing is hash-based, even hosts with no fallback support work.</p>
      </div>

      <div class="doc-sec prose" id="pages">
        <h2><i class="ph-fill ph-github-logo"></i>GitHub Pages</h2>
        <p>The repository ships a ready-made Pages workflow: on every push it installs dependencies, copies the demo configuration, builds with the correct base path and deploys — the live demo is always current with the latest commit.</p>
        <div class="code-block"><span class="c"># .github/workflows/pages.yml — highlights</span>
env:
  VITE_BASE_PATH: <span class="s">/${{ github.event.repository.name }}/</span>
  VITE_LOAD_FROM_URL: <span class="s">'true'</span>
steps:
  - run: npm ci
  - run: cp public/demo/config.pages.json public/config.json
  - run: npm run build</div>
        <p>Project sites get the <code class="inline">/&lt;repository&gt;/</code> base path automatically; custom domains keep the root. Deep links and local file loading work unchanged under the subpath because the application routes through the URL hash.</p>
      </div>

      <div class="doc-sec prose" id="docker">
        <h2><i class="ph-fill ph-shipping-container"></i>Docker</h2>
        <p>Docker with the Compose plugin is the only prerequisite. The image uses a lockfile-pinned <code class="inline">npm ci</code> builder and serves the verified bundle from nginx with a working health check.</p>
        <div class="code-block">docker compose up --build --detach
<span class="c"># open http://localhost:3000 — stop with: docker compose down</span></div>
        <p><code class="inline">docker/config.json</code> is mounted read-only and controls which specifications the deployment presents — edit it and reload; no image rebuild needed. Port, image name, container name and restart policy are environment-driven (<code class="inline">OPENDOC_PORT</code>, <code class="inline">OPENDOC_IMAGE_NAME</code>, <code class="inline">OPENDOC_CONTAINER_NAME</code>, <code class="inline">OPENDOC_RESTART_POLICY</code>), with helper scripts for Windows, macOS and Linux.</p>
      </div>

      <div class="doc-sec prose" id="make">
        <h2><i class="ph-fill ph-magic-wand"></i>Builder CLI — <span class="mono" style="font-size:.7em">npm run make</span></h2>
        <p>A guided, interactive builder that asks what your deployment should include — specification sources, URL loading, base path, AI options — and produces a ready-to-ship <code class="inline">dist/</code> with the matching configuration baked in.</p>
      </div>

      <div class="doc-sec prose" id="config">
        <h2><i class="ph-fill ph-gear-six"></i>Configuration modes</h2>
        <ul>
          <li><b>Mode 1 — <code class="inline">public/config.json</code>:</b> a pre-defined catalog of specifications served alongside the app.</li>
          <li><b>Mode 2 — <code class="inline">window.INITIAL_CONFIG</code>:</b> the same catalog injected at page level, useful when embedding.</li>
          <li><b>Hybrid:</b> configured specs <em>and</em> local file opening together.</li>
          <li><b>Mode 3 — no configuration:</b> pure local mode; users open files from disk with persistent history.</li>
        </ul>
      </div>

      <div class="doc-sec prose" id="gateway">
        <h2><i class="ph-fill ph-shield-check"></i>Optional AI gateway</h2>
        <p>For teams that want provider keys server-side, the included hardened gateway (<code class="inline">server/ai-gateway.ts</code>) enforces token authentication, origin allowlists, rate limits, concurrency bounds and upstream timeouts. Reference implementations exist for nine frameworks — Express, FastAPI, Django, Laravel, Rails, Spring Boot, ASP.NET Core, Gin and Axum — so it drops into whatever you already run.</p>
      </div>
    </div>
  </div>
</section>''')

# ────────────────────────── DEVELOPERS ──────────────────────────
PAGES["developers.html"] = (
    "Developers — OpenDoc UI",
    "The engineering story behind OpenDoc UI: a deliberately small stack, a rigorously tested OpenAPI core, and a repository organized for newcomers.",
    page_hero("For developers",
        'A small stack,<br/><span class="h-accent">rigorously verified</span>',
        "The engineering story: deliberately conventional tools, a tested OpenAPI core, and a repository a newcomer can navigate in an afternoon.")
    + '''
<section class="section" style="padding-top:10px">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow reveal">The stack</span>
      <h2 class="reveal d1">Boring on purpose</h2>
    </div>
    <div class="card-grid">
      <div class="info-card reveal"><h3><i class="ph ph-file-ts"></i>TypeScript + React 19</h3><p>Typed end to end. Components organized by surface — endpoint views, schemas, notes, AI — with shared hooks for routing, theming and persistence.</p></div>
      <div class="info-card reveal d1"><h3><i class="ph ph-lightning"></i>Vite 6</h3><p>One deliberately inlined production bundle (<code class="inline">dist/index.js</code>) so static deployments never worry about chunk filenames — guarded by a verification script on every build.</p></div>
      <div class="info-card reveal d2"><h3><i class="ph ph-paint-brush"></i>Tailwind 4 + Phosphor</h3><p>Utility-first styling over a CSS-variable theming system, with the Phosphor icon set throughout.</p></div>
      <div class="info-card reveal"><h3><i class="ph ph-code-block"></i>Monaco Editor</h3><p>The industry-standard editor powers raw JSON bodies, schema inspection and code viewing.</p></div>
      <div class="info-card reveal d1"><h3><i class="ph ph-tree-structure"></i>@scalar/openapi-parser</h3><p>Optional engine validation and external reference resolution, with errors surfaced as scoped diagnostics rather than fatal failures.</p></div>
      <div class="info-card reveal d2"><h3><i class="ph ph-database"></i>IndexedDB-first persistence</h3><p>Specs, response history, notes, panel widths and workspace state persist through a resilient storage layer with a localStorage fallback.</p></div>
    </div>

    <div style="height:70px"></div>
    <div class="section-head">
      <span class="eyebrow reveal">Repository layout</span>
      <h2 class="reveal d1">Where everything lives</h2>
    </div>
    <div class="table-card reveal"><div class="table-wrap">
      <table>
        <thead><tr><th>Path</th><th>Contents</th></tr></thead>
        <tbody>
          <tr><td><span class="mono">src/</span></td><td class="wrap">The application — components, hooks, contexts, pages, types and utilities</td></tr>
          <tr><td><span class="mono">src/utils/openapi/</span></td><td class="wrap">The OpenAPI engine: parsing, normalization, validation, references, serialization and capabilities</td></tr>
          <tr><td><span class="mono">src/utils/runner/</span></td><td class="wrap">Request planning, execution, response handling and the recursive body-form logic</td></tr>
          <tr><td><span class="mono">server/</span></td><td class="wrap">The hardened AI gateway (<span class="mono">ai-gateway.ts</span>) and its policy module</td></tr>
          <tr><td><span class="mono">downloaders/ · ai-gateways/</span></td><td class="wrap">Spec downloader and AI gateway reference implementations in six and nine frameworks</td></tr>
          <tr><td><span class="mono">scripts/</span></td><td class="wrap">Build support: SPA fallback, single-bundle verification, UI contracts, the builder CLI</td></tr>
          <tr><td><span class="mono">tests/</span></td><td class="wrap">Unit suites plus the Playwright browser suite</td></tr>
          <tr><td><span class="mono">docker/ · site/</span></td><td class="wrap">Docker packaging and this website</td></tr>
        </tbody>
      </table>
    </div></div>

    <div style="height:70px"></div>
    <div class="split">
      <div>
        <span class="eyebrow reveal">Quality gates</span>
        <h2 class="reveal d1" style="margin:14px 0 16px">One command<br/>runs <span class="h-accent">everything</span></h2>
        <p class="lead reveal d2">The suite covers the OpenAPI normalization matrix, parameter serialization, Swagger 2.0 conversion, async behavior and conformance — plus a Playwright browser suite over the real UI.</p>
        <div style="margin-top:26px" class="reveal d3"><a class="btn btn-ink" href="https://github.com/omidgfx/opendoc-ui" target="_blank" rel="noreferrer"><i class="ph-fill ph-github-logo"></i> Browse the source</a></div>
      </div>
      <div class="code-block reveal d2" style="margin:0">npm run dev           <span class="c"># development server on :3000</span>
npm run build         <span class="c"># bundle + SPA fallback + verification</span>
npm run lint          <span class="c"># prettier, tsc --noEmit, UI contracts</span>
npm test              <span class="c"># unit suites</span>
npm run test:browser  <span class="c"># Playwright</span>
npm run test:all      <span class="c"># everything above, in order</span>
npm run make          <span class="c"># the guided builder CLI</span></div>
    </div>
  </div>
</section>''')

# ────────────────────────── FAQ ──────────────────────────
def qa(q, a, open_=False):
    return f'''      <details{" open" if open_ else ""}>
        <summary>{q} <span class="plus"><i class="ph ph-plus"></i></span></summary>
        <div class="a">{a}</div>
      </details>'''

PAGES["faq.html"] = (
    "FAQ — OpenDoc UI",
    "Straight answers about OpenDoc UI: privacy, architecture, the AI assistant, the Runner, offline use and where everything lives.",
    page_hero("FAQ",
        'Straight answers,<br/><span class="h-em">no hedging</span>',
        "The questions that come up most — about privacy, architecture, the AI assistant, and where everything lives.")
    + f'''
<section class="section" style="padding-top:10px">
  <div class="container">
    <div class="faq reveal">
{qa("Does OpenDoc UI require a backend server?",
    "No. The documentation browser, the Runner, the schema explorer, notes, theming and code generation all run entirely in the browser. The only optional server components are the AI gateway (for teams that want provider keys server-side) and the downloader proxy (for fetching remote specifications across restrictive networks) — both are opt-in.", True)}
{qa("Are my specifications uploaded anywhere?",
    "Never. Local files are parsed in the browser and stored only in your browser's local history. Nothing is uploaded, and the original document is never modified. When you load a remote URL, the browser fetches it directly (or through a proxy you configured) — no third party is involved.")}
{qa("Which OpenAPI versions are supported?",
    'OpenAPI 3.0, 3.1 and 3.2, plus Swagger 2.0, in YAML or JSON. Modern 3.1/3.2 keywords — <code class="inline">const</code>, <code class="inline">prefixItems</code>, <code class="inline">unevaluatedProperties</code>, <code class="inline">if/then/else</code>, type unions, webhooks — are rendered and handled explicitly. Multi-file reference graphs resolve in memory.')}
{qa("Does the Runner send requests from my browser?",
    "Yes — that is the point. Requests are composed from the specification and executed with the browser's fetch API against the server you select, so you can test real authentication, parameters and bodies without leaving the documentation. The same CORS rules that apply to any web application apply here, and the Runner Compatibility report states what the browser can and cannot do for a given API.")}
{qa("How does the AI assistant work, and where do my keys go?",
    "The assistant receives redacted endpoint and schema context from your open specification and answers with citations. In direct mode, your browser talks to the provider you configure (OpenAI, Anthropic, Ollama, OpenRouter or any compatible endpoint). In gateway mode, a hardened server gateway owns the provider credentials and enforces token authentication, origin allowlists, rate limits and timeouts — the browser never sees the provider key.")}
{qa("Can I run it on an internal network without internet access?",
    'Yes. The application is fully static — copy <code class="inline">dist/</code> to an internal nginx or Apache host, or use the Docker image, and it works offline. Configured specifications can be baked in through <code class="inline">config.json</code> or <code class="inline">window.INITIAL_CONFIG</code>, and local files always work. The only components that need the internet are the optional AI providers and remote URL loading.')}
{qa("Where are my notes and history stored?",
    "In your browser — IndexedDB first, with a localStorage fallback. Notes, response history, opened-file history, themes and workspace state never leave your machine. Notes export/import as JSON if you want to move or back them up.")}
{qa("Is it really free?",
    'Yes — MIT licensed, no tiers, no telemetry, no account. <a href="https://github.com/omidgfx/opendoc-ui" target="_blank" rel="noreferrer">The source is on GitHub</a>; stars are the only currency accepted.')}
    </div>
    <div style="text-align:center;margin-top:56px" class="reveal">
      <a class="btn btn-brand btn-lg" href="https://omidgfx.github.io/opendoc-ui/demo/"><i class="ph-fill ph-play"></i> Enough reading — open the demo</a>
    </div>
  </div>
</section>''')

for fname, (title, desc, body) in PAGES.items():
    (SITE / fname).write_text(shell(fname, title, desc, body))
    print("wrote", fname)
