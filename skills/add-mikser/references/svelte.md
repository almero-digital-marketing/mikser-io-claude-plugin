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

### 2. `src/lib/mikser.js` — single shared entities client

```js
// One mikser entities client per app. Exported so both client-side
// runes (via the +layout.svelte registration step below) and build-time
// hooks (entries() in +page.server.js) can use the same instance.
import { createClient } from 'mikser-io-sdk-api'
import { PUBLIC_MIKSER_URL } from '$env/static/public'

// Two-step setup: createClient({ baseUrl }) returns a root client;
// .entities('public') returns the per-endpoint client with the methods
// the SDK actually calls — list, listAll, live, urlFor, render. The
// endpoint name matches the key under `api.endpoints` in
// mikser-content/mikser.config.js (`public`).
export const client = createClient({ baseUrl: PUBLIC_MIKSER_URL }).entities('public')
```

**Say:** "One client instance, shared. Two-call setup: `baseUrl` for the root client, `.entities('public')` for the endpoint-specific entities client. Notice there's no `setMikserClient` call in this file — that has to happen inside a component because it uses Svelte's context API, which only works during component initialisation. We do it in `+layout.svelte` next."

### 3. `src/routes/+layout.svelte` — register the client in component context

`setMikserClient` wraps Svelte's `setContext`, which only works during a component's initialisation — calling it at module scope (e.g. in `$lib/mikser.js`) throws `lifecycle_outside_component`. The root layout is the canonical place: it initialises once, before any page renders.

If the file doesn't exist, create it:

```svelte
<script>
    import { client } from '$lib/mikser.js'
    import { setMikserClient } from 'mikser-io-sdk-svelte'

    // Registers the client in component context. Every rune below this
    // layout (useDocument, useDocuments, useMikserPages, useSimilar)
    // resolves the client from here.
    setMikserClient(client)

    let { children } = $props()
</script>

{@render children()}
```

If it already exists, add the import and the `setMikserClient(client)` call to the top of the existing `<script>` block — don't touch the layout's markup.

**Say:** "This is the boot point. `setMikserClient(client)` puts the client into Svelte's component context, where the SDK's runes can find it. It has to live inside a component (not in `$lib/mikser.js`) because Svelte's context API only works during component init. Everything else in your layout is yours."

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
    import PageView from '$lib/views/PageView.svelte'
    import ArticleView from '$lib/views/ArticleView.svelte'
    import NotFound from '$lib/views/NotFound.svelte'

    // Build the current route from the slug. The leading slash matches
    // what the frontmatter writes (e.g. `route: /about`).
    const route = $derived('/' + (page.params.slug ?? ''))

    // useDocuments takes a query *getter*. The SDK destructures the
    // result into { filter, sort, fields, limit, skip } — so the filter
    // must live under a `filter` key. Passing the filter directly
    // (without the wrapper) silently matches everything and the catch-
    // all resolves to whichever document came back first, on every URL.
    const result = useDocuments(() => ({
        filter: { 'meta.route': route, 'meta.published': true },
    }))

    const doc = $derived(result.documents[0] ?? null)

    const viewForLayout = {
        page: PageView,
        article: ArticleView,
    }

    const Component = $derived(
        doc ? (viewForLayout[doc.meta?.layout] ?? NotFound) : null
    )
</script>

{#if result.loading}
    <div class="mikser-loading">Loading…</div>
{:else if doc && Component}
    <Component {doc} />
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

**Say:** "Catch-all. SvelteKit hits this for any URL not claimed by another route. The query shape `{ filter: {...} }` is the SDK contract — wrapping the filter is required (the test that surfaced this bug spent half an hour debugging a catch-all that resolved every URL to the same doc because the wrapper was missing). Add a new layout = one entry in `viewForLayout` + one schema file."

### 7. `src/routes/[...slug]/+page.server.js` — prerender entries (optional)

`entries()` is a server-side hook, so it lives in `+page.server.js` (not `+page.js`). At build time SvelteKit calls it once to learn which URLs to prerender.

**Default this to `prerender = false`.** With `prerender = true` the build calls `entries()`, which hits the live mikser backend — so `vite build` would fail with `ECONNREFUSED` unless the backend is already running. Defaulting to false means the user's first `npm run build` works without choreography; they can opt into prerender once their setup is solid.

```js
import { generateMikserRoutes } from 'mikser-io-sdk-svelte'
import { client } from '$lib/mikser.js'

// `entries()` tells SvelteKit which parameter values exist for this
// dynamic route. We read them from mikser's catalog so the prerender
// pipeline can emit one HTML file per document.
export const entries = async () => {
    const routes = await generateMikserRoutes({
        client,
        mapRoute: document => ({ slug: document.meta.route.replace(/^\//, '') }),
    })
    return routes
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
    let { doc } = $props()

    // $derived re-runs when doc.content changes. SSE updates flow
    // through useDocuments → catch-all → this prop → derived html.
    const html = $derived(renderMarkdown(doc.content))
</script>

<article class="page">
    <h1>{doc.meta.title}</h1>
    <!-- {@html ...} injects the markdown-it output. -->
    {@html html}
</article>

<style>
    .page { max-width: 70ch; margin: 2rem auto; padding: 0 1rem; }
</style>
```

**Say:** "Generic page view — your fallback. `doc` is live; SSE updates push here automatically and `$derived` re-converts the body."

### 9. `src/lib/views/ArticleView.svelte`

```svelte
<script>
    import { renderMarkdown } from '$lib/markdown.js'
    let { doc } = $props()
    const html = $derived(renderMarkdown(doc.content))
</script>

<article class="article">
    <header>
        <h1>{doc.meta.title}</h1>
        <p class="byline">
            By {doc.meta.author} ·
            <time datetime={doc.meta.date}>
                {new Date(doc.meta.date).toLocaleDateString()}
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
