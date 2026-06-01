# SvelteKit + Hybrid SSG — mikser-io bootstrap recipe

This reference is read by the `add-mikser` skill when the user picks the **Hybrid SSG** architecture and the framework is SvelteKit. SvelteKit's per-route `prerender` toggle does most of the heavy lifting:

- **Public routes** — `prerender = true`. SvelteKit's `entries()` hook enumerates the catalog at build time; `load()` fetches each document; the result is one HTML file per route. Pure static, deployed to a CDN.
- **`/admin/*` routes** — `prerender = false, ssr = false`. Runs as a runtime SPA against the live mikser server. Live SSE updates via `useDocuments` / `useDocument`. Served as the `adapter-static` fallback.

Both halves share the same view components via `src/lib/route-mapping.js`. Same dispatch table, same dispatch logic — one source of truth.

This is the cleanest Hybrid setup of the three frameworks because SvelteKit's filesystem routing + adapter-static + per-route flags handle the split with very little ceremony.

> **Branch A note:** If the user already has a SvelteKit project, applying Hybrid is mostly *additive* — you add a catch-all `[...path]/` route group and an `admin/` route group, plus the shared `$lib/mikser.js` and `$lib/route-mapping.js`. The existing app keeps working. That makes the migration far gentler than the Vue/React Hybrid recipes.

## Peer deps

```bash
npm install mikser-io-sdk-svelte mikser-io-sdk-api svelte
npm install --save-dev @sveltejs/kit @sveltejs/vite-plugin-svelte @sveltejs/adapter-static vite
```

Tell the user: "SvelteKit + `adapter-static`. The static adapter generates one HTML file per prerendered route plus a fallback page for the editor SPA. Same SDK packages as Pure SPA."

## Files to write or edit

### 1. `.env`

```
PUBLIC_MIKSER_URL=http://localhost:3001
MIKSER_URL=http://localhost:3001
```

**Say:** "Two variables. `PUBLIC_MIKSER_URL` is the browser-exposed one (SvelteKit convention — only `PUBLIC_*` env vars get into client bundles). `MIKSER_URL` is for build-time scripts that run in Node."

### 2. `svelte.config.js`

```js
import adapter from '@sveltejs/adapter-static'

export default {
    kit: {
        // Prerender every reachable page by default. The /admin route opts
        // out (prerender = false in its +page.js) — adapter-static then
        // serves it via the fallback page.
        adapter: adapter({
            pages: 'build',
            assets: 'build',
            fallback: 'admin.html',
            precompress: false,
            strict: false,
        }),
    },
}
```

**Say:** "`adapter-static` with `fallback: 'admin.html'` is the trick. Prerendered routes get their own HTML files. The `/admin` route opts out of prerendering and is served by the fallback page — which means a user hitting any unrecognised path inside `/admin/*` lands on the SPA. `strict: false` lets prerender succeed even when not every route is prerenderable (the admin routes specifically aren't)."

### 3. `src/app.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
</head>
<body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
</body>
</html>
```

### 4. `src/lib/mikser.js` — shared entities client

```js
// The shared entities client. Read by both the prerender-time
// +page.server.js files (Node) and the runtime /admin route (browser).
//
// MIKSER_URL (build) and PUBLIC_MIKSER_URL (browser) both default to
// the local mikser dev server.
import { createClient } from 'mikser-io-sdk-api'

const url = (
    typeof process !== 'undefined' && process.env?.MIKSER_URL
) || (
    typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_MIKSER_URL
) || 'http://localhost:3001'

const root = createClient({ baseUrl: url })

// Full document fetch — used by the catch-all's load() during prerender
// and by useDocument inside the admin SPA.
export const documents = root.entities('public')

// Narrow router data — used by entries() during prerender and by the
// admin SPA's document list. initialUrl points at the static snapshot
// from the data plugin's catalog.sitemap, so admin first paint is a
// CDN-cached file read instead of an API roundtrip.
export const sitemap = root.entities('sitemap', {
    initialUrl: '/data/sitemap.json',
})
```

**Say:** "Two clients, shared between contexts. `documents` is the full-content client (catch-all's `load()`, admin's `useDocument`). `sitemap` is the narrow router client — small payload, plus a static snapshot for zero-roundtrip admin boot. The `||` chain picks `MIKSER_URL` in Node (prerender) and `PUBLIC_MIKSER_URL` in the browser (admin)."

### 5. `src/lib/route-mapping.js` — shared view dispatch

```js
import PageView from './views/PageView.svelte'
import ArticleView from './views/ArticleView.svelte'

// Dispatch by meta.component, not meta.layout — layout is reserved
// for mikser's SSG render templates (layouts/<name>.hbs etc.);
// component is the SPA's view dispatch. Documents in Hybrid SSG can
// set both without collision.
export const viewForComponent = {
    page: PageView,
    article: ArticleView,
    // Add more: product, landing, etc.
}

// Resolve URL path: prefer meta.route, fall back to destination.
export function routeFor(document) {
    if (document?.meta?.route) return document.meta.route
    if (document?.destination) {
        return document.destination
            .replace(/\/index\.html?$/, '/')
            .replace(/\.html?$/, '')
    }
    return null
}
```

**Say:** "The shared dispatch table + path resolver. Both the prerender path and the admin SPA import from here. Add a new component = add an entry + create the view component."

### 6. `src/routes/+layout.svelte`

```svelte
<script>
    let { children } = $props()
</script>

<header class="site-header">
    <a href="/">mikser hybrid demo</a>
    <a href="/admin" style="float:right">Admin</a>
</header>

<main class="content">
    {@render children()}
</main>
```

### 7. `src/routes/+page.svelte` — hand-coded home page

```svelte
<h1>Home</h1>
<p>This is the static home page. Documents render at their own routes; the admin SPA at <a href="/admin">/admin</a> shows the live editor.</p>
```

**Say:** "Hand-coded home page. The catch-all `[...path]/` route group below picks up everything else from the mikser catalog. Keeping home as its own file means you can shape it freely without it conflicting with mikser documents."

### 8. `src/routes/[...path]/+page.server.js` — prerender enumeration + load

```js
// Catch-all dynamic route. SvelteKit calls entries() at build time to
// know which paths to prerender, then calls load() for each — both
// run against the mikser catalog.
import { generateMikserRoutes } from 'mikser-io-sdk-svelte'
import { documents, sitemap } from '$lib/mikser.js'
import { routeFor } from '$lib/route-mapping.js'

export const prerender = true

// Enumerate every published, component-having document. entries() runs
// against the sitemap endpoint — small payload, no full document
// bodies pulled into the build process.
export async function entries() {
    const routes = await generateMikserRoutes({
        client: sitemap,
        mapRoute: document => {
            const path = routeFor(document)
            return path ? { path: path.replace(/^\//, '') } : null
        },
    })
    // The homepage is handled by src/routes/+page.svelte — drop the
    // empty path so we don't collide.
    return routes.filter(r => r && r.path !== '')
}

// Fetch the document for the matched path. params.path is the URL
// path with the leading '/' stripped; we look it up by meta.route OR
// by a destination prefix so files without explicit meta.route still
// resolve. Uses documents (full content) — load() bakes the body into
// the prerendered HTML.
export async function load({ params }) {
    const target = '/' + params.path
    const { items } = await documents.list({
        filter: {
            $or: [
                { 'meta.route': target },
                { destination: { $regex: `^${target.replace(/\/$/, '')}(/index)?\\.html?$` } },
            ],
            'meta.published': true,
        },
        limit: 1,
    })
    return { document: items[0] || null }
}
```

**Say:** "The build-time half. `entries()` asks mikser \"what URLs exist?\" — SvelteKit then visits each at build time. `load()` fetches the document for whichever path is being rendered. Filter the empty path so we don't collide with the hand-coded home page."

### 9. `src/routes/[...path]/+page.svelte` — the renderer

```svelte
<script>
    import { viewForComponent } from '$lib/route-mapping.js'

    let { data } = $props()

    // Pick the right view by meta.component, falling back to PageView.
    const View = $derived(
        viewForComponent[data.document?.meta?.component] ?? viewForComponent.page,
    )
</script>

{#if data.document}
    <View document={data.document} />
{:else}
    <section class="not-found">
        <h1>404</h1>
        <p>This page does not exist.</p>
        <p><a href="/">Go home</a></p>
    </section>
{/if}
```

**Say:** "Picks the view by component and renders the document. Same pattern as the Pure SPA catch-all; difference is `data.document` comes from a server-side `load()` here (executed at build time during prerender) rather than from a runtime SDK rune."

### 10. `src/routes/admin/+page.js` — opt out of prerender

```js
// /admin runs as an SPA on top of the static build. Disable prerender
// so adapter-static serves it via the fallback page (admin.html).
export const prerender = false
export const ssr = false
```

### 11. `src/routes/admin/+page.svelte` — the live editor

```svelte
<script>
    import { setMikserClient, useDocuments, useDocument } from 'mikser-io-sdk-svelte'
    import { documents, sitemap } from '$lib/mikser.js'
    import { viewForComponent, routeFor } from '$lib/route-mapping.js'

    // Register the documents client for useDocument below. The sitemap
    // client is passed explicitly to useDocuments for the list — we
    // don't need it in context.
    setMikserClient(documents)

    let selectedId = $state(null)

    // List from the sitemap (narrow payload, static-snapshot fast path).
    // useDocuments gets { client: sitemap } so it doesn't inject the
    // documents client from context.
    const all = useDocuments(
        () => ({
            filter: { 'meta.published': true, 'meta.component': { $exists: true } },
            sort: { 'meta.route': 1 },
            fields: ['id', 'destination', 'meta'],
        }),
        { client: sitemap },
    )

    // Full document fetch (uses the documents client from context).
    const selected = useDocument(() => selectedId)

    const View = $derived(
        viewForComponent[selected.document?.meta?.component] ?? viewForComponent.page,
    )
</script>

<div class="admin">
    <aside class="admin__list">
        <h2>Documents</h2>
        {#if all.loading}<p>Loading…</p>{/if}
        <ul>
            {#each all.documents as document (document.id)}
                <li class:selected={selectedId === document.id}>
                    <button onclick={() => (selectedId = document.id)}>
                        {document.meta?.title ?? routeFor(document)}
                        <small>{document.meta?.component}</small>
                    </button>
                </li>
            {/each}
        </ul>
    </aside>

    <section class="admin__preview">
        {#if selected.document}
            <View document={selected.document} />
        {:else}
            <p>Pick a document on the left to preview it.</p>
            <p>
                The list and the preview both stay live via SSE — edit any
                <code>.md</code> file in mikser-content while this view is open and
                watch it update without a refresh.
            </p>
        {/if}
    </section>
</div>

<style>
    .admin { display: grid; grid-template-columns: 280px 1fr; gap: 1rem; padding: 1rem; }
    .admin__list ul { list-style: none; padding: 0; }
    .admin__list button { display: block; width: 100%; text-align: left; padding: 0.4rem; background: none; border: 0; cursor: pointer; }
    .admin__list li.selected button { font-weight: bold; background: #f0f0f0; }
</style>
```

**Say:** "The live editor. Lists every published document, lets you click into one for preview. Both the list and the preview update via SSE — edit a `.md` file in `mikser-content/documents/` while this is open and the changes appear without refresh. `selected.document` reactively swaps when the user clicks a different list item."

### 12. `src/lib/views/PageView.svelte` and `src/lib/views/ArticleView.svelte`

```svelte
<!-- PageView.svelte -->
<script>
    let { document } = $props()
</script>

<article class="document">
    <h1>{document.meta?.title}</h1>
    {@html document.content}
</article>
```

Both views receive `document` as a prop. `ArticleView.svelte` follows the same shape with an added byline. **Note:** Like the React Hybrid recipe, this assumes the markdown content is pre-rendered to HTML server-side via a `render-*` plugin in `mikser-content/mikser.config.js`. If raw markdown, follow the Pure SPA recipe and add `markdown-it` to the views.

## Run

```bash
cd mikser-content && npm run dev          # → mikser :3001 (terminal 1)
npm run dev                                # → SvelteKit dev server (terminal 2)
# → / lands on the hand-coded home
# → /about renders the about document via the catch-all
# → /admin lands on the live editor SPA
```

For production:

```bash
cd mikser-content && npm run dev &        # build needs mikser running for entries()
npm run build                              # → build/ has all prerendered HTML + admin.html fallback
npm run preview                            # serves build/
```

**Say:** "One terminal during dev — SvelteKit serves prerendered routes from the live mikser server. For production, mikser must be running when `npm run build` calls `entries()` to enumerate routes. After build, mikser is no longer needed for the public side — it's just HTML. The admin SPA still needs mikser at the URL `PUBLIC_MIKSER_URL` points to."

## Deployment

```
build/             → CDN as one bundle (static HTML + admin.html SPA fallback)
```

One deploy target. The admin fallback page is a static file like everything else — when the user hits any path under `/admin/*`, the CDN serves `admin.html` which boots the SvelteKit client router and resolves to the actual route. Behind auth if you need to, by edge function or your CDN's auth layer.

## Skip list

Do not touch: TypeScript / ESLint / Prettier / Tailwind / PostCSS configs, any existing routes the user has (Branch A — they continue to work; just don't put them under `/admin/` or they'll trip the SPA fallback).
