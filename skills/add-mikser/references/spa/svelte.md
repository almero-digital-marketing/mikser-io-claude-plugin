# SvelteKit + Svelte 5 — mikser-io bootstrap recipe

This reference is read by the `add-mikser` skill when `package.json` shows SvelteKit (`@sveltejs/kit`). It assumes Svelte 5 (runes) + SvelteKit. Not a tutorial — exact edits and files, with the one-line explanations to share as you go.

SvelteKit owns its own routing, so the integration shape is different from Vue/React: mikser generates a route table via SvelteKit's `entries()` hook, and a single catch-all `+page.svelte` renders whichever document matched.

## Peer deps to install

Always:

```bash
npm install mikser-io-sdk-svelte mikser-io-sdk-api markdown-it
```

Tell the user: "Three deps. `sdk-api` is the underlying entities client; `sdk-svelte` wraps it as Svelte 5 runes; `markdown-it` runs in the browser to convert each document's markdown body to HTML at render time. The mikser server delivers raw markdown over SSE — the conversion is intentionally client-side so the live-update loop stays simple."

## Files to write or edit

In order. Each step has a "say" line — the one-sentence explanation to give the user after the file is created/edited.

### 1. `.env`

```
PUBLIC_MIKSER_URL=http://localhost:3001
```

**Say:** "SvelteKit exposes `PUBLIC_*` env vars to the browser via `$env/static/public`. Change for staging/prod."

### 2. `src/lib/mikser.js` — two clients (documents + sitemap)

```js
// Two clients, one root. Exported so both client-side runes (via the
// +layout.svelte registration step) and build-time hooks (entries()
// in +page.server.js) can use them.
import { createClient } from 'mikser-io-sdk-api'
import { PUBLIC_MIKSER_URL } from '$env/static/public'

const root = createClient({ baseUrl: PUBLIC_MIKSER_URL })

// Full content fetch — used by useDocument inside views. The /api/public
// endpoint serves complete documents including the markdown body.
export const documents = root.entities('public')

// Narrow router data — used by the catch-all to find the document for
// the current URL. With mikser-io ^6.25.0's sitemap endpoint set to
// `cache: true`, the api plugin writes every GET /entities response
// to disk; sdk-api ^2.4.2's list() uses GET so the cache fills from
// real SDK traffic. A reverse proxy can fail over to the cached file
// when mikser is down — same URL, transparent to the SDK.
export const sitemap = root.entities('sitemap')
```

**Say:** "Two clients, one root. `documents` is the full-content client (used by `useDocument` for view bodies). `sitemap` is the narrow router client — small payload. With the sitemap endpoint set to `cache: true` server-side, every GET response is written to disk; a reverse proxy can fall back to the cached file when mikser is down, transparent to the SDK. Both clients share the same root, so connection config (auth headers, fetch override, etc.) is set once."

### 3. `src/routes/+layout.svelte` — register the client + connection guard

`setMikserClient` wraps Svelte's `setContext`, which only works during a component's initialisation — calling it at module scope (e.g. in `$lib/mikser.js`) throws `lifecycle_outside_component`. The root layout is the canonical place: it initialises once, before any page renders.

The layout also hosts the connection guard. A small fetch probe (with a 5-second deadline) decides whether to render the page tree, a "connecting…" panel, or an "unreachable" error. Without this guard, a missing mikser backend produces a forever-loading page with no error surface — a brutal failure mode for someone just trying the recipe.

If the file doesn't exist, create it:

```svelte
<script>
    import { documents } from '$lib/mikser.js'
    import { setMikserClient, useMikserStatus } from 'mikser-io-sdk-svelte'
    import { PUBLIC_MIKSER_URL } from '$env/static/public'

    // Register the documents client in component context. Every rune
    // below this layout (useDocument, useDocuments) resolves it from
    // here. The sitemap client is used directly by the catch-all
    // route's load — it doesn't need to be in context.
    setMikserClient(documents)

    // useMikserStatus probes the backend once and returns a reactive
    // holder. status.current settles to 'ready' on success or
    // 'unreachable' on failure / 5s deadline. Override timeoutMs if 5s
    // isn't right for your network.
    const status = useMikserStatus()

    let { children } = $props()
</script>

{#if status.current === 'ready'}
    {@render children()}
{:else if status.current === 'connecting'}
    <main class="mikser-state mikser-connecting">
        <p>Connecting to mikser at <code>{PUBLIC_MIKSER_URL}</code>…</p>
    </main>
{:else}
    <main class="mikser-state mikser-error">
        <h2>Can't reach the mikser backend</h2>
        <p>Tried <code>{PUBLIC_MIKSER_URL}</code> for 5 seconds. Start it in another terminal:</p>
        <pre>cd mikser-content
npm run dev</pre>
        <p>Then reload this page.</p>
    </main>
{/if}

<style>
    .mikser-state { max-width: 60ch; margin: 4rem auto; padding: 0 1rem; font: 14px/1.5 system-ui, sans-serif; }
    .mikser-connecting { color: #666; }
    .mikser-error h2 { color: #b94a48; margin-top: 0; }
    .mikser-error pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; }
</style>
```

If `+layout.svelte` already exists, add the import + `setMikserClient(client)` call to the top of the script block AND wrap the existing layout markup in the same `{#if status === 'ready'}` guard. If the user has non-mikser pages (login, marketing, etc.) that should remain navigable when mikser is down, narrow the guard: only show the error panel inside the routes that actually depend on mikser, or skip the `'connecting'` gate entirely and only branch on `'unreachable'`.

**Say:** "Two jobs in one layout: register the client and host the connection guard. The fetch probe + 5s deadline turns a missing backend into a clear error instead of a forever-loading screen. The error message tells the user exactly how to fix it — start the backend, reload."

### 4. Delete the scaffolder's `src/routes/+page.svelte`

`sv create --template minimal` lands a placeholder home page at `src/routes/+page.svelte`. The catch-all route you'll create next owns `/` (and every other URL), and at prerender time SvelteKit refuses to generate two pages for the same route — the build fails with `entries export generated entry /, which was matched by /`.

Delete it:

```bash
rm src/routes/+page.svelte
```

If the user wants a hand-coded home page later, they can keep `+page.svelte` and instead filter `route === '/'` out of `entries()` (step 6) so the catch-all skips the home slug. The default recipe takes the simpler path: the home page is just another document.

**Say:** "Delete the scaffold's home page — the catch-all will own `/`, and the markdown document `mikser-content/documents/index.md` (with `route: /`) is what actually renders there. If you later want a hand-coded home page, keep `+page.svelte` and filter `/` out of `entries()`."

### 5. `src/lib/markdown.js` — shared markdown helper

```js
import MarkdownIt from 'markdown-it'

// `html: true` lets authors drop inline HTML into their markdown when
// they need to. `linkify: true` auto-links bare URLs. Configure here
// and every view picks it up.
const md = new MarkdownIt({ html: true, linkify: true, breaks: false })

export function renderMarkdown(source) {
    return md.render(source ?? '')
}
```

**Say:** "One instance of markdown-it shared across every view. `doc.content` arrives as raw markdown over SSE; this is the only place that turns it into HTML."

### 6. `src/routes/[...slug]/+page.svelte` — catch-all renderer

The directory `[...slug]` is SvelteKit's rest-segment syntax — it matches any path that no other route handled.

```svelte
<script>
    import { page } from '$app/state'
    import { useDocuments } from 'mikser-io-sdk-svelte'
    import { sitemap } from '$lib/mikser.js'
    import PageView from '$lib/views/PageView.svelte'
    import ArticleView from '$lib/views/ArticleView.svelte'
    import NotFound from '$lib/views/NotFound.svelte'

    // Build the current URL path from the slug. The leading slash
    // matches both meta.route ("/about") and a destination-derived
    // path ("/about/" stripped to "/about").
    const route = $derived('/' + (page.params.slug ?? ''))

    // Query the sitemap (narrow, cached) — not public. We're matching
    // by meta.route OR destination, so the catch-all works for docs
    // that don't set meta.route explicitly. The explicit { client }
    // option points useDocuments at the sitemap client; without it,
    // the rune would inject the documents client from layout context.
    const list = useDocuments(
        () => ({
            filter: {
                $or: [
                    { 'meta.route': route },
                    { destination: { $regex: `^${route.replace(/\/$/, '')}(/index)?\\.html?$` } },
                ],
                'meta.published': true,
            },
        }),
        { client: sitemap },
    )

    // Got the sitemap entry — now fetch the full document by id from
    // the public endpoint via useDocument (which uses the documents
    // client registered in the root layout context).
    import { useDocument } from 'mikser-io-sdk-svelte'
    const entityId = $derived(list.documents[0]?.id ?? null)
    const doc = useDocument(() => entityId)

    const viewForComponent = {
        page: PageView,
        article: ArticleView,
    }

    const Component = $derived(
        doc.document
            ? (viewForComponent[doc.document.meta?.component] ?? NotFound)
            : null
    )
</script>

{#if list.loading || (entityId && doc.loading)}
    <div class="mikser-loading">Loading…</div>
{:else if doc.document && Component}
    <Component document={doc.document} />
{:else}
    <NotFound />
{/if}

<style>
    .mikser-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 50vh;
        color: #888;
    }
</style>
```

**Say:** "Two-step lookup: query the sitemap for `meta.route` OR a matching `destination`, then fetch the full document from public by id. With server-side `cache: true` and a reverse proxy in front, the SDK's GET to the sitemap reads live mikser when up and the cached file when down — transparent failover. Dispatch is on `meta.component`. Adding a new component = one entry in `viewForComponent` + one schema file."

### 7. `src/routes/[...slug]/+page.server.js` — prerender entries (optional)

`entries()` is a server-side hook, so it lives in `+page.server.js` (not `+page.js`). At build time SvelteKit calls it once to learn which URLs to prerender.

**Default this to `prerender = false`.** With `prerender = true` the build calls `entries()`, which hits the live mikser backend — so `vite build` would fail with `ECONNREFUSED` unless the backend is already running. Defaulting to false means the user's first `npm run build` works without choreography; they can opt into prerender once their setup is solid.

```js
import { generateMikserRoutes } from 'mikser-io-sdk-svelte'
import { sitemap } from '$lib/mikser.js'

// `entries()` tells SvelteKit which parameter values exist for this
// dynamic route. Use the sitemap client — it's filtered to documents
// with meta.component (i.e. things the SPA actually routes). Same
// fallback logic as the catch-all: meta.route → destination.
export const entries = async () => {
    return generateMikserRoutes({
        client: sitemap,
        mapRoute: document => {
            const path = document.meta?.route ?? (
                document.destination
                    ?.replace(/\/index\.html?$/, '/')
                    ?.replace(/\.html?$/, '')
            )
            return path ? { slug: path.replace(/^\//, '') } : null
        },
    })
}

// Default to client-side render. Flip to `true` once you want a static
// build — but note that `vite build` will then need the mikser backend
// running so entries() can query it.
export const prerender = false
```

**Say:** "`entries()` is what makes the prerender pipeline know about your markdown files — at build time it asks mikser for the list and writes one HTML page per document. We default `prerender = false` so the first build doesn't need the backend running. Flip to `true` for static HTML output (and start the backend before `vite build`)."

### 8. `src/lib/views/PageView.svelte`

```svelte
<script>
    import { renderMarkdown } from '$lib/markdown.js'

    // The catch-all passes the document from useDocument — already
    // live via SSE. Just render it.
    let { document } = $props()

    const html = $derived(renderMarkdown(document.content))
</script>

<article class="page">
    <h1>{document.meta?.title}</h1>
    <!-- {@html ...} injects the markdown-it output. -->
    {@html html}
</article>

<style>
    .page { max-width: 70ch; margin: 2rem auto; padding: 0 1rem; }
</style>
```

**Say:** "Generic page view — your fallback. `document` is the live doc from the catch-all's `useDocument`; SSE updates push here automatically and `$derived` re-converts the body."

### 9. `src/lib/views/ArticleView.svelte`

```svelte
<script>
    import { renderMarkdown } from '$lib/markdown.js'
    let { document } = $props()
    const html = $derived(renderMarkdown(document.content))
</script>

<article class="article">
    <header>
        <h1>{document.meta?.title}</h1>
        <p class="byline">
            By {document.meta?.author} ·
            <time datetime={document.meta?.date}>
                {new Date(document.meta?.date).toLocaleDateString()}
            </time>
        </p>
    </header>
    {@html html}
</article>

<style>
    .article { max-width: 70ch; margin: 2rem auto; padding: 0 1rem; }
    .byline { color: #666; font-size: 0.9em; }
</style>
```

**Say:** "Layout-specific view. The article schema requires `author` and `date`, so this view can rely on them."

### 10. `src/lib/views/NotFound.svelte`

```svelte
<section class="not-found">
    <h1>404</h1>
    <p>This document doesn't exist (yet).</p>
</section>

<style>
    .not-found { text-align: center; padding: 4rem 1rem; color: #888; }
</style>
```

**Say:** "Fallback for unknown routes and unknown layouts."

### 11. `svelte.config.js` — verify adapter

Don't replace the file. Check that an adapter is set; the default `@sveltejs/adapter-auto` works fine. If the project uses `adapter-static`, that's also fine — both honor the prerender setting.

If neither is present, install `@sveltejs/adapter-auto` and add it to `svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter(),
    },
}
```

**Say:** "The adapter decides where your built site lands. `adapter-auto` picks based on your host; `adapter-static` gives a pure HTML folder."

## Notes about Svelte vs Vue/React shape

It's worth telling the user up front:

> SvelteKit's setup is a bit different from Vue/React. There's no `useMikserRoutes(router, ...)` call because SvelteKit already owns the routing. Instead:
>
> - One catch-all route (`[...slug]/+page.svelte`) renders whichever document the URL maps to
> - Inside that catch-all, `useDocuments({ 'meta.route': currentRoute })` does the live lookup
> - `generateMikserRoutes()` feeds the prerender pipeline via `entries()` in `+page.server.js`
>
> The mental model is the same — markdown files in `mikser-content/documents/` become routes — but the wiring goes through SvelteKit's hooks instead of a router instance.

## Skip list

Do not touch:

- `package.json` scripts
- TypeScript / ESLint / Prettier / Tailwind / PostCSS configs
- Any existing layout, page, component, or store
- `app.html` — the default template works
- The chosen adapter, unless none is configured
