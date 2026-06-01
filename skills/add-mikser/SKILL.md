---
name: add-mikser
description: >-
  Bootstrap a mikser-io content backend into a Vue 3, React 18+/19, or
  SvelteKit project — works for an existing app or a blank directory, and
  supports three architectures — Pure SPA (runtime everything, live
  everywhere), Hybrid SSG (prerendered public site + SPA editor), and
  Islands (mikser-rendered HTML + framework islands for interactivity).
  Use whenever the user mentions adding mikser, mikser-io, file-based CMS,
  or a live content backend — also when they describe wanting their
  content to live as `.md` / `.yml` files with hot-reload to the browser,
  multilingual URLs, live previews, SEO-friendly static output, SSG with
  a live editor, or sprinkling interactivity into mostly-static pages.
  Also trigger when the user says "try mikser" or "start from scratch" in
  an empty folder, or when they ask about Astro/Eleventy-style islands or
  hybrid SSG+SPA setups. Detects the framework from package.json (or
  scaffolds a fresh one with create-vite / sv create when there's nothing
  yet), asks the user to pick the architecture, then wires the matching
  SDK pattern and optionally scaffolds a sibling `mikser-content/` folder
  with schemas and starter documents.
---

# add-mikser

This skill plugs the [mikser-io](https://github.com/almero-digital-marketing/mikser-io) content engine into a project the user already has — augmenting their existing app rather than replacing it. Mikser keeps content as `.md` and `.yml` files on disk; SSE pushes live updates to the frontend; framework SDKs (`mikser-io-sdk-vue`, `-react`, `-svelte`) wrap that as composables / hooks / runes.

## Workflow

Run these steps in order. Don't skip discovery — the wiring depends on what's already there.

### 1. Discover the project

First, check whether the user has a project here at all. List the current directory and look for `package.json`.

**Branch A — `package.json` exists (existing project):**

Read it and establish:

- **Framework**: Vue, React, or SvelteKit. Detect from `dependencies` / `devDependencies`:
  - `vue` (3.x) + `@vitejs/plugin-vue` → Vue
  - `react` + `react-dom` + `@vitejs/plugin-react` → React
  - `@sveltejs/kit` → SvelteKit
  - `svelte` (5.x) without `@sveltejs/kit` → Svelte 5 SPA (rare; treat as a follow-up)
- **Existing router**: does `vue-router` or `react-router-dom` appear in deps? (SvelteKit owns its own.)
- **Bundler**: assume Vite (default for all three framework SDKs).

If the framework can't be confidently identified, ask the user. Don't guess.

**Branch B — no `package.json` (blank directory):**

The user is starting from scratch. Tell them so and offer the three frameworks:

> Nothing here yet — looks like a fresh start. Which framework do you want to use? (Vue 3 + Vite, React + Vite, or SvelteKit). I'll scaffold the official starter, then layer mikser on top.

Once they pick, **scaffold using the official tooling** (don't hand-roll a starter — use what the framework maintainers ship):

| Framework  | Command |
| ---------- | ------- |
| Vue 3      | `npm create vite@latest . -- --template vue` |
| React      | `npm create vite@latest . -- --template react` |
| SvelteKit  | `npx -y sv create . --template minimal --no-add-ons --no-types --install npm` |

The `.` argument tells the scaffolder to create files in the current directory rather than a new subdir. Some scaffolders refuse if the directory isn't empty — if that happens, ask the user how they want to proceed (move existing files? pick a subdirectory name? cancel?).

The SvelteKit command above uses explicit flags because `npx sv create .` without flags is interactive — it hangs in any non-TTY shell. The minimal template is the right starting point for adding mikser; the user can layer Tailwind, Prettier, etc. afterwards.

After scaffolding, **treat the scaffolder's stock entry component as part of the scaffold, not as user code** — you will overwrite it as part of the mikser wiring. The frameworks ship:

- Vue: `src/App.vue` rendering `<HelloWorld />`. Replace with `<RouterView />`.
- React: `src/App.jsx` rendering the Vite demo page. Replace with the mikser route table.
- SvelteKit: `src/routes/+page.svelte` (the demo home page). Delete it — the catch-all route owns `/`.

If you leave the stock entry in place, the wiring "works" but the user sees the scaffold demo instead of any mikser content, with no error to debug. The framework references call this out at the relevant step; mention it again here so the user isn't surprised.

After scaffolding completes, run `npm install` (or the user's preferred package manager — check for `pnpm-lock.yaml` / `yarn.lock` / `bun.lockb` first, fall back to npm). Then continue with the workflow as if it had been an existing project: the framework is now identified, no router exists yet (so default to "scaffold one" for Vue/React), and SvelteKit owns its own.

Tell the user briefly what just landed: "Scaffolded a Vue 3 + Vite starter. Now adding mikser." — keep it short, they can see the file tree.

### 2. Pick the architecture

The skill supports three architectures. Ask the user which one fits — explain the trade-offs in one line each before they pick:

| Architecture | When to use | Trade-off |
| --- | --- | --- |
| **Pure SPA** *(default)* | Fastest to set up. Live SSE updates everywhere. Dashboards, editors, anything internal where SEO doesn't matter. | Public HTML is empty until JS loads — bad SEO. Initial boot pays one round-trip to mikser. |
| **Hybrid SSG** | Public marketing site with a separate editor preview. SEO matters, but you also want live edit-and-see-it for the editorial team. | Two build steps and two entry points. Slightly more wiring. |
| **Islands** | Content-heavy sites where most pages are pure content (mikser renders them) but a few features need interactivity (search, contact form, live counts). | Mikser-side templating (hbs/eta) for the shell — content authors mostly stay in markdown but layout HTML is templated. |

Default to **Pure SPA** if the user doesn't have a clear preference — it's the fastest path to "this works on my machine."

For the question phrasing:

> Mikser supports three architectures:
>
> 1. **Pure SPA** (default) — runtime everything, live SSE, single Vite dev server. Fastest to set up.
> 2. **Hybrid SSG** — prerendered public site + SPA editor with live previews. Best for marketing sites with an editorial team.
> 3. **Islands** — mikser-rendered HTML + framework islands. Best for content-heavy sites with a sprinkle of interactivity.
>
> Which fits? (Press enter for Pure SPA.)

### 3. Read the framework × architecture reference

Once you know both axes, **read** the matching file:

- `references/spa/{vue,react,svelte}.md` — Pure SPA, all three frameworks
- `references/hybrid/{vue,react,svelte}.md` — Hybrid SSG, all three frameworks
- `references/islands/{vue,react,svelte}.md` — Islands, all three frameworks (Svelte uses plain Svelte 5, not SvelteKit)

Each reference is a full bootstrap recipe — file lists, file contents, wiring steps, deployment notes. They mirror the canonical upstream examples shipped in each SDK's `examples/` directory.

### 4. Ask the remaining questions

Up to three more questions. Skip any whose answer is already determined by what you found in step 1 or 2. Confirm before generating anything:

1. **Mikser server URL** — default `http://localhost:3001`. Used for `VITE_MIKSER_URL` / `PUBLIC_MIKSER_URL` env wiring.
2. **Existing router?** — only ask for Vue and React in the Pure SPA architecture, and only when the user came in with `vue-router` / `react-router-dom` already in their deps. Default to "yes, integrate into the existing router." For a blank-project scaffold (Branch B), an existing project without a router, SvelteKit (always), or the Hybrid SSG / Islands architectures (which prescribe their own router shape), skip this question.
3. **Scaffold a `mikser-content/` sibling folder?** — default yes. The user needs a content backend to talk to; without one, the integration has nothing to show. Scaffolding it in 30 seconds versus pointing them at the mikser-io README is the difference between "this works" and "this still doesn't work."
4. **Catalog size (Pure SPA only) — Mode 1 or Mode 2?** — only ask when the architecture is Pure SPA AND the user has either an existing catalog with > 5k documents OR explicitly mentions scale ("a blog with 30k posts", "I'll have ~50k products"). Default to Mode 1 (snapshot-based, every route registered at boot). Mode 2 (one catch-all + `useDocumentByRoute`) is the right shape past ~5–10k routes. Each `references/spa/{vue,react,svelte}.md` recipe documents both modes and the diff between them; the Mode 2 section is at the bottom under "Mode 2: Dynamic routes — when the catalog is big." Pick the right mode upfront — switching after-the-fact is doable but means rewriting `main.*` + the routing shape.

Phrasing example:

> I'll add mikser-io to your <framework> app. Three quick things:
>
> 1. Mikser server URL (default `http://localhost:3001`)?
> 2. You have `vue-router` already — should I integrate mikser into it, or do you want a separate router? (default: integrate)
> 3. Want me to scaffold a `mikser-content/` sibling folder with a sample content tree (`page` and `article` schemas + a couple of docs) so the backend runs immediately? (default: yes)
>
> Answer with whatever you'd change, or just say "go" to take all defaults.

### 5. Generate the frontend wiring

Follow the architecture × framework reference for the exact file edits and creations. The general shape varies per architecture — each reference spells out what it needs. Some patterns are common:

- **Install peer deps**: `mikser-io-sdk-<framework>` + `mikser-io-sdk-api`, plus architecture-specific extras (markdown-it for SPA views, render template engines for Islands, etc).
- **Add `.env` line**: `VITE_MIKSER_URL` (or `PUBLIC_MIKSER_URL` for SvelteKit) pointing at the mikser server.
- **Read the reference top to bottom and apply every numbered step.** Don't skip the "Say" annotations — they're how the user learns what they own.

After each meaningful file, explain in one short line what it does and how to customize it. The user is going to own these files; the skill is teaching them what they own.

### 6. Generate `mikser-content/` (if the user said yes)

Always scaffold the same minimal shape, regardless of framework:

```
mikser-content/
├── .gitignore
├── package.json
├── mikser.config.js
├── schemas/
│   ├── page.js
│   └── article.js
└── documents/
    ├── index.md
    ├── about.md
    └── articles/
        └── welcome.md
```

The exact contents are in the **shared content templates** section below. They're framework-agnostic; the same starter content works for Vue, React, and SvelteKit consumers.

### 7. Tell the user how to run it

Final message — be explicit about the two-terminal pattern:

```
Done. Here's how to run it:

  Terminal 1 — the mikser backend:
    cd mikser-content
    npm install
    npm run dev
    # → mikser on http://localhost:3001

  Terminal 2 — your frontend:
    npm install
    npm run dev
    # → frontend on http://localhost:5173

What I generated, and where to customize it:

  src/main.<ext>            — wires mikser into your app. Augment, don't replace —
                              your routes still work; mikser slots in alongside.
  src/route-mapping.<ext>   — meta.layout → view component dispatch. Add new layouts here.
  src/views/PageView.*      — fallback view. Style and structure are yours to change.
  src/views/ArticleView.*   — example layout-specific view.
  mikser-content/schemas/   — Zod schemas for each layout. Edit these to type your content.
  mikser-content/documents/ — your actual content. Edit these like any markdown file.

Edit any document file while both terminals are running and watch the browser update.
```

Don't include version numbers, links to docs that may rot, or boilerplate "if you have issues" sections. Keep it tight.

## Shared content templates

These are the same for every framework. Drop them into `mikser-content/` when the user opts into the backend scaffold.

### `mikser-content/.gitignore`

```
node_modules
out
.mikser
```

### `mikser-content/package.json`

```json
{
    "name": "mikser-content",
    "private": true,
    "version": "0.0.0",
    "type": "module",
    "scripts": {
        "dev": "node node_modules/mikser-io/app.js --server --watch",
        "build": "node node_modules/mikser-io/app.js --clear",
        "preview": "node node_modules/mikser-io/app.js --server"
    },
    "dependencies": {
        "mikser-io": "^6.26.0",
        "mikser-io-plugin-schemas": "^0.1.0",
        "zod": "^3.23.0"
    }
}
```

Notes on the choices:

- **No `mikser-io-render-markdown`.** That plugin is a template-engine helper (it extends `runtime.markdown()` for hbs / eta / liquid renderers) — it does *not* convert document bodies to HTML before the API serves them. The API serves `doc.content` as raw markdown, and the SPA renders that to HTML client-side via `markdown-it`. If the user later moves to SSG output, the render-markdown plugin becomes relevant; for the live-SPA shape it's the wrong tool.
- **Scripts call `node node_modules/mikser-io/app.js` directly** rather than the `mikser` bin. Portable across installed versions, survives any future PATH/permission quirks.
- **`mikser-io ^6.25.1`** is required for the api plugin's per-query disk cache (`cache: true` writes responses to `out/<basePath>/<endpoint>/entities/<query>.json`). Pair with `mikser-io-sdk-api ^2.4.2` so the SDK uses GET for `list()` and the cache fills from real traffic. See the top-level README for the full caching + reverse-proxy story.

### `mikser-content/mikser.config.js`

```js
// Mikser backend config. The plugins list is the active surface:
//   documents      — load .md files under documents/
//   front-matter   — parse YAML front-matter into meta
//   yaml           — load .yml files (if you add any)
//   plugin-schemas — validate front-matter against schemas/<name>.js
//   data           — write JSON snapshots of the catalog at finalize
//                    (used here for /data/sitemap.json — fast first
//                    paint for the SPA router)
//   api            — expose the catalog over HTTP with an SSE subscribe stream
//
// Note: there's intentionally no render-markdown plugin here. The api
// plugin serves doc.content as raw markdown; the frontend converts it
// to HTML on the client via markdown-it. If you later move to SSG output
// (HTML files on disk), add 'render-markdown' here along with a renderer
// plugin like 'render-hbs' or 'render-eta'.
//
// Add more plugins as your project grows; the engine is unchanged.
export default {
    plugins: [
        'documents',
        'front-matter',
        'yaml',
        'plugin-schemas',
        'data',
        'api',
    ],

    schemas: {
        // 'warn' surfaces validation errors as server log lines without
        // failing the build — right for active editing. Flip to 'fail'
        // for CI strictness.
        onError: 'warn',
        // schemaKey: the dotted front-matter path that names the schema
        // to validate against. Default is 'meta.layout' (right for SSG).
        // For a SPA — no rendered HTML, no layout in the front-matter —
        // point it at meta.component instead. Without this, plugin-schemas
        // would look up `meta.layout`, find nothing, and silently skip
        // every document (it'd warn at finalize that the schemas loaded
        // but never matched anything, but validation would still be off).
        schemaKey: 'meta.component',
    },

    data: {
        // The data plugin writes JSON snapshots at finalize. We use it
        // to publish a single sitemap.json file the SPA loads on first
        // paint — no second API endpoint, no SSE channel needed for
        // routing data.
        catalog: {
            // out/data/sitemap.json — every published document that
            // declares a meta.component, projected to just the fields
            // the router needs (`pick`). Served by mikser's built-in
            // static handler, CDN-cacheable, survives mikser being
            // down. Consumed by the SDK via
            //   entities('public', { initialUrl: '/data/sitemap.json' })
            // which unwraps the data-plugin envelope automatically.
            sitemap: {
                query: e =>
                    e.type === 'document' &&
                    e.meta?.published &&
                    e.meta?.component,
                pick: ['id', 'destination', 'meta.component', 'meta.route', 'meta.title'],
            },
        },
    },

    api: {
        endpoints: {
            // Single full-document endpoint with SSE subscribe. Views
            // fetch individual documents from here via useDocument(id).
            // `cache: true` is for fail-safety: when mikser is down a
            // reverse proxy serves the cached per-id responses so a
            // reader keeps reading. Routing data comes from the static
            // sitemap.json above, not from this endpoint.
            public: {
                query: e => e.type === 'document' && e.meta?.published,
                operations: ['list', 'subscribe'],
                cache: true,
            },
        },
    },
}
```

### `mikser-content/schemas/page.js`

```js
// Schema for documents whose component is 'page'. The plugin-schemas
// plugin auto-discovers files in this folder; the file name (matching
// meta.component) determines which documents this schema validates.
//
// Note: layout is for mikser's SSG render pipeline (which template file
// to use). component is for the frontend SPA's view dispatch. Keep them
// separate so a layout warning from mikser doesn't surprise you when
// you add a SPA-only document type.
import { z } from 'zod'

export default z.object({
    component: z.literal('page'),
    title:     z.string().min(1),
    route:     z.string().regex(/^\//, 'route must start with "/"').optional(),
    layout:    z.string().optional(),         // mikser SSG layout (optional)
    published: z.boolean(),
})
```

### `mikser-content/schemas/article.js`

```js
import { z } from 'zod'

export default z.object({
    component:  z.literal('article'),
    title:      z.string().min(1),
    route:      z.string().regex(/^\//, 'route must start with "/"').optional(),
    layout:     z.string().optional(),
    author:     z.string().min(1),
    date:       z.coerce.date(),
    summary:    z.string().max(280).optional(),
    published:  z.boolean(),
})
```

### `mikser-content/documents/index.md`

```markdown
---
component: page
title: Home
route: /
published: true
---

Welcome. This document lives as a plain markdown file in
`mikser-content/documents/index.md`. Edit it while both terminals are
running and the page updates in place — no rebuild, no refresh.

The frontmatter (`component`, `title`, `route`, `published`) is
validated against `mikser-content/schemas/page.js` on every save.
```

### `mikser-content/documents/about.md`

```markdown
---
component: page
title: About
route: /about
published: true
---

This is a second page document. The router added a `/about` route
because this file's `meta.route` is `/about`. Delete this file and
watch the route disappear from the running app without a rebuild.
```

### `mikser-content/documents/articles/welcome.md`

```markdown
---
component: article
title: Welcome to the journal
route: /articles/welcome
author: Editor
date: 2026-01-01
summary: First article — a tour of what gets generated when you scaffold mikser into a project.
published: true
---

This document has `meta.component: article`, so the route renders
`ArticleView` instead of `PageView`. The dispatch lives in
`src/route-mapping.<ext>` (Vue / React) or in the catch-all
`+page.svelte` (SvelteKit) — add a new component there and a new
schema file in `mikser-content/schemas/` and you have a new content
type.

Notice there's no `layout:` here. `layout` is reserved for mikser's
SSG render pipeline — which template file to render this document
through. For Pure SPA you don't need it; for Hybrid SSG add it
alongside `component`.

The pattern is the same whether you have two components or fifty.
```

## Teaching, not just generating

A reminder for the rest of the session: after each meaningful file is created or edited, give the user a one-line explanation of what it does and how to customize it. The skill's value is partly the bootstrap and partly the mental model. A user who walks away knowing "the dispatch is in `route-mapping.js`, the schema is in `schemas/article.js`" can extend the project on day one. A user who just sees a wall of green check marks can't.

Keep these annotations short — one sentence each, no boilerplate. The framework references include suggested phrasings; reuse them.
