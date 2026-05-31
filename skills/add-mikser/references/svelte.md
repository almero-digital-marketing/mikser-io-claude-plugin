# SvelteKit + Svelte 5 — mikser-io bootstrap recipe

This reference is read by the `add-mikser` skill when `package.json` shows SvelteKit (`@sveltejs/kit`). It assumes Svelte 5 (runes) + SvelteKit. Not a tutorial — exact edits and files, with the one-line explanations to share as you go.

SvelteKit owns its own routing, so the integration shape is different from Vue/React: mikser generates a route table via SvelteKit's `entries()` hook, and a single catch-all `+page.svelte` renders whichever document matched.

## Peer deps to install

Always:

```bash
npm install mikser-io-sdk-svelte mikser-io-sdk-api
```

Tell the user: "These two are the only new deps. The Svelte SDK is the framework wrapper (Svelte 5 runes); `sdk-api` is the underlying client. SvelteKit's router is what we'll feed into."

## Files to write or edit

In order. Each step has a "say" line — the one-sentence explanation to give the user after the file is created/edited.

### 1. `.env`

```
PUBLIC_MIKSER_URL=http://localhost:3001
```

**Say:** "SvelteKit exposes `PUBLIC_*` env vars to the browser via `$env/static/public`. Change for staging/prod."

### 2. `src/lib/mikser.js` — single client + helper exports

```js
// One mikser client per app, created in module scope so every page
// that imports this module shares the same in-memory catalog and SSE
// stream.
import { createClient } from 'mikser-io-sdk-api'
import { setMikserClient } from 'mikser-io-sdk-svelte'
import { PUBLIC_MIKSER_URL } from '$env/static/public'

export const client = createClient({ url: PUBLIC_MIKSER_URL })

// Registers the client globally for the SDK's runes (useDocument,
// useDocuments, useMikserPages, etc.) so they can find it without
// prop-drilling.
setMikserClient(client)
```

**Say:** "One client instance, shared. `setMikserClient` is the registration step — once it's done, any rune in `mikser-io-sdk-svelte` can find the client. Components import runes directly from the package; only build-time scripts need to import the `client` from here."

### 3. `src/routes/+layout.svelte` — boot the client

If the file doesn't exist, create it:

```svelte
<script>
    // Import this so the module-level setMikserClient call runs on first load.
    import '$lib/mikser.js'

    let { children } = $props()
</script>

{@render children()}
```

If it already exists, add the `import '$lib/mikser.js'` line at the top of the existing `<script>` block — don't touch their layout markup.

**Say:** "Importing `$lib/mikser.js` here is what makes the client exist before any page renders. The layout is yours otherwise — nav, footer, all that stays."

### 4. `src/routes/[...slug]/+page.svelte` — catch-all renderer

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

    // useDocuments takes a query getter and returns a live reactive
    // object. SSE pushes from the backend re-render this component
    // automatically — no refetch logic needed.
    const result = useDocuments(() => ({ 'meta.route': route, 'meta.published': true }))

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

**Say:** "Catch-all. SvelteKit hits this for any URL not claimed by another route. `useDocuments({ 'meta.route': route })` is a live query — exactly one document matches, and we hand it to the view picked by `meta.layout`. Add a new layout = one entry in `viewForLayout` + one schema file."

### 5. `src/routes/[...slug]/+page.server.js` — prerender entries

`entries()` is a server-side hook, so it lives in `+page.server.js` (not `+page.js`). At build time SvelteKit calls it once to learn which URLs to prerender.

```js
import { generateMikserRoutes } from 'mikser-io-sdk-svelte'
import { client } from '$lib/mikser.js'

// `entries()` tells SvelteKit which parameter values exist for this
// dynamic route. We read them from mikser's catalog so the prerender
// pipeline emits one HTML file per document.
export const entries = async () => {
    const routes = await generateMikserRoutes({
        client,
        mapRoute: document => ({ slug: document.meta.route.replace(/^\//, '') }),
    })
    return routes
}

// Flip to false if you need a fully client-rendered app.
export const prerender = true
```

**Say:** "`entries()` is what makes the prerender pipeline know about your markdown files. At build time SvelteKit asks for the list and writes one HTML page per document. In dev this file is unused — the catch-all `+page.svelte` does the live lookup itself."

### 6. `src/lib/views/PageView.svelte`

```svelte
<script>
    let { doc } = $props()
</script>

<article class="page">
    <h1>{doc.meta.title}</h1>
    <!-- doc.content is HTML from render-markdown. {@html ...} is the
         Svelte equivalent of v-html / dangerouslySetInnerHTML. -->
    {@html doc.content}
</article>

<style>
    .page { max-width: 70ch; margin: 2rem auto; padding: 0 1rem; }
</style>
```

**Say:** "Generic page view — your fallback. `doc` is live; SSE updates push here automatically because `useDoc` is reactive."

### 7. `src/lib/views/ArticleView.svelte`

```svelte
<script>
    let { doc } = $props()
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
    {@html doc.content}
</article>

<style>
    .article { max-width: 70ch; margin: 2rem auto; padding: 0 1rem; }
    .byline { color: #666; font-size: 0.9em; }
</style>
```

**Say:** "Layout-specific view. The article schema requires `author` and `date`, so this view can rely on them."

### 8. `src/lib/views/NotFound.svelte`

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

### 9. `svelte.config.js` — verify adapter

Don't replace the file. Check that an adapter is set; the default `@sveltejs/adapter-auto` works fine for prerender. If the project uses `adapter-static`, that's also fine — both honor `prerender = true`.

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

**Say:** "The adapter decides where your built site lands. `adapter-auto` picks based on your host; `adapter-static` gives a pure HTML folder. Either works with mikser's prerender."

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
