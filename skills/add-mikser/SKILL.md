---
name: add-mikser
description: Bootstrap a mikser-io content backend into an existing Vue 3, React 18+/19+, or SvelteKit project. Use whenever the user mentions adding mikser, mikser-io, file-based CMS, or a live content backend to their app — also when they describe wanting their content to live as `.md` / `.yml` files with hot-reload to the browser, multilingual URLs, or live previews. Detects the framework from package.json, wires the SDK in their main file, and optionally scaffolds a sibling `mikser-content/` folder with schemas and a couple of starter documents so the backend works on first run.
---

# add-mikser

This skill plugs the [mikser-io](https://github.com/almero-digital-marketing/mikser-io) content engine into a project the user already has — augmenting their existing app rather than replacing it. Mikser keeps content as `.md` and `.yml` files on disk; SSE pushes live updates to the frontend; framework SDKs (`mikser-io-sdk-vue`, `-react`, `-svelte`) wrap that as composables / hooks / runes.

## Workflow

Run these steps in order. Don't skip discovery — the wiring depends on what's already there.

### 1. Discover the project

Read `package.json` from the current working directory (or wherever the user is rooted). Establish:

- **Framework**: Vue, React, or SvelteKit. Detect from `dependencies` / `devDependencies`:
  - `vue` (3.x) + `@vitejs/plugin-vue` → Vue
  - `react` + `react-dom` + `@vitejs/plugin-react` → React
  - `@sveltejs/kit` → SvelteKit
  - `svelte` (5.x) without `@sveltejs/kit` → Svelte 5 SPA (rare; treat as a follow-up)
- **Existing router**: does `vue-router` or `react-router-dom` appear in deps? (SvelteKit owns its own.)
- **Bundler**: assume Vite (default for all three framework SDKs).

If the framework can't be confidently identified, ask the user. Don't guess.

### 2. Read the framework reference

Based on the framework detected, **read** the matching file:

- Vue → `references/vue.md`
- React → `references/react.md`
- SvelteKit → `references/svelte.md`

Each reference is the full bootstrap recipe for that framework — file lists, file contents, wiring steps, the loading-shell HTML, the build-target bump. They're written so the body that follows in this SKILL.md works the same regardless of which framework — the references differ only in how the SDK is wired.

### 3. Ask the questions

Three questions, in this order. Confirm before generating anything:

1. **Mikser server URL** — default `http://localhost:3001`. Used for `VITE_MIKSER_URL` / `PUBLIC_MIKSER_URL` env wiring.
2. **Existing router?** — only ask for Vue and React. If the user has `vue-router` or `react-router-dom` already installed, default to "yes, integrate into the existing router." Otherwise default to "no, scaffold one." For SvelteKit, this is moot — SvelteKit owns routing.
3. **Scaffold a `mikser-content/` sibling folder?** — default yes. The user needs a content backend to talk to; without one, the integration has nothing to show. Scaffolding it in 30 seconds versus pointing them at the mikser-io README is the difference between "this works" and "this still doesn't work."

Phrasing example:

> I'll add mikser-io to your <framework> app. Three quick things:
>
> 1. Mikser server URL (default `http://localhost:3001`)?
> 2. You have `vue-router` already — should I integrate mikser into it, or do you want a separate router? (default: integrate)
> 3. Want me to scaffold a `mikser-content/` sibling folder with a sample content tree (`page` and `article` schemas + a couple of docs) so the backend runs immediately? (default: yes)
>
> Answer with whatever you'd change, or just say "go" to take all defaults.

### 4. Generate the frontend wiring

Follow the framework reference for the exact file edits and creations. The general shape across all three:

- **Install peer deps**: `mikser-io-sdk-<framework>` + `mikser-io-sdk-api`. For Vue/React without an existing router, also the router package.
- **Edit main file** (`src/main.js`, `src/main.jsx`, or `src/routes/+layout.svelte`): wire `createClient` + the framework plugin + the live router helper. Use `await seeded` before mount.
- **Edit Vite config**: set `build.target: 'es2022'` so the top-level `await` survives `vite build`. (Skip for SvelteKit — its config handles this differently.)
- **Edit `index.html`**: add a loading shell inside `#app` so the user doesn't see a blank screen during the initial SSE seed.
- **Generate route-mapping**: a small module mapping `meta.layout` to view components.
- **Generate sample view components**: `PageView`, `ArticleView`, `NotFound` minimum.
- **Add `.env` line**: `VITE_MIKSER_URL` (or `PUBLIC_MIKSER_URL` for SvelteKit) pointing at the mikser server.

After each meaningful file, explain in one short line what it does and how to customize it. The user is going to own these files; the skill is teaching them what they own.

### 5. Generate `mikser-content/` (if the user said yes)

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

### 6. Tell the user how to run it

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
        "dev": "mikser --server --watch",
        "build": "mikser --clear",
        "preview": "mikser --server"
    },
    "dependencies": {
        "mikser-io": "^6.23.0",
        "mikser-io-plugin-schemas": "^0.1.0",
        "mikser-io-render-markdown": "^1.0.0",
        "zod": "^3.23.0"
    }
}
```

### `mikser-content/mikser.config.js`

```js
// Mikser backend config. The plugins list is the active surface:
//   documents     — load .md files under documents/
//   front-matter  — parse YAML front-matter into meta
//   yaml          — load .yml files (if you add any)
//   plugin-schemas — validate front-matter against schemas/<layout>.js
//   render-markdown — convert markdown body to HTML
//   api           — expose the catalog over HTTP with an SSE subscribe stream
//
// Add more plugins as your project grows; the engine is unchanged.
export default {
    plugins: [
        'documents',
        'front-matter',
        'yaml',
        'plugin-schemas',
        'render-markdown',
        'api',
    ],

    schemas: {
        // 'warn' surfaces validation errors as server log lines without
        // failing the build — right for active editing. Flip to 'fail'
        // for CI strictness.
        onError: 'warn',
    },

    api: {
        endpoints: {
            // Open read endpoint with the SSE subscribe operation. The
            // framework SDK reads from this endpoint by default.
            public: {
                query: e => e.type === 'document' && e.meta?.published,
                operations: ['list', 'subscribe'],
            },
        },
    },
}
```

### `mikser-content/schemas/page.js`

```js
// Schema for documents with meta.layout: 'page'. Edit to match your domain.
// The plugin-schemas plugin auto-discovers files in this folder; the file
// name determines which layout it validates.
import { z } from 'zod'

export default z.object({
    layout:    z.literal('page'),
    title:     z.string().min(1),
    route:     z.string().regex(/^\//, 'route must start with "/"'),
    published: z.boolean(),
})
```

### `mikser-content/schemas/article.js`

```js
import { z } from 'zod'

export default z.object({
    layout:     z.literal('article'),
    title:      z.string().min(1),
    route:      z.string().regex(/^\//, 'route must start with "/"'),
    author:     z.string().min(1),
    date:       z.coerce.date(),
    summary:    z.string().max(280).optional(),
    published:  z.boolean(),
})
```

### `mikser-content/documents/index.md`

```markdown
---
layout: page
title: Home
route: /
published: true
---

Welcome. This document lives as a plain markdown file in
`mikser-content/documents/index.md`. Edit it while both terminals are
running and the page updates in place — no rebuild, no refresh.

The frontmatter (`layout`, `title`, `route`, `published`) is validated
against `mikser-content/schemas/page.js` on every save.
```

### `mikser-content/documents/about.md`

```markdown
---
layout: page
title: About
route: /about
published: true
---

This is a second page document. The router added a `/about` route
because this file's `meta.route` was matched by `useMikserRoutes`.
Delete this file and watch the route disappear without a rebuild.
```

### `mikser-content/documents/articles/welcome.md`

```markdown
---
layout: article
title: Welcome to the journal
route: /articles/welcome
author: Editor
date: 2026-01-01
summary: First article — a tour of what gets generated when you scaffold mikser into a project.
published: true
---

This document has `meta.layout: article`, so the router dispatches it
to `ArticleView` instead of `PageView`. The dispatch is in
`src/route-mapping.<ext>` — add a new layout there and a new schema
file in `mikser-content/schemas/` and you have a new content type.

The pattern is the same whether you have two layouts or fifty.
```

## Teaching, not just generating

A reminder for the rest of the session: after each meaningful file is created or edited, give the user a one-line explanation of what it does and how to customize it. The skill's value is partly the bootstrap and partly the mental model. A user who walks away knowing "the dispatch is in `route-mapping.js`, the schema is in `schemas/article.js`" can extend the project on day one. A user who just sees a wall of green check marks can't.

Keep these annotations short — one sentence each, no boilerplate. The framework references include suggested phrasings; reuse them.
