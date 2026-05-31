# Svelte + Islands — mikser-io bootstrap recipe

This reference is read by the `add-mikser` skill when the user picks the **Islands** architecture and the framework is Svelte. Mikser produces the static HTML; small Svelte 5 bundles mount onto specific DOM nodes for interactivity. No SvelteKit, no routing, no SPA shell.

This is the right shape for content-heavy sites with focused interactivity — search, cart, contact form — where the bulk of the page is just content (mikser renders it) and JavaScript is needed only at a few spots.

> **Note: plain Svelte, no SvelteKit.** SvelteKit's runtime is built around page-level routing; for Islands you want lightweight per-island mounts without an SPA shell. The `mikser-io-sdk-svelte` package works with both. This recipe uses plain Svelte 5 + Vite.

> **Branch A warning:** This recipe assumes you'll move the page-layout pipeline into mikser-content's render-* plugins (hbs / eta / liquid). For an existing SvelteKit app this is a big restructure — confirm Islands is what the user really wants. The Pure SPA recipe is closer if they want to keep SvelteKit.

## How it fits together

```
mikser (render-hbs / render-eta / etc.)
   └─ produces HTML pages with <div data-island="search"> mount points
                                                         │
                                                         ▼
                              Vite build → dist/main.js (one bundle, all islands)
                                                         │
                                                         ▼
                              Mikser layouts <script type="module" src="/main.js">
                                                         │
                                                         ▼
                              On page load: each mount function finds its
                              [data-island=...] nodes and svelte mount()s them
```

## Peer deps

```bash
npm install mikser-io-sdk-svelte mikser-io-sdk-api svelte
npm install --save-dev @sveltejs/vite-plugin-svelte vite
```

Tell the user: "Plain Svelte 5 + Vite. No SvelteKit. Each island will be mounted via `mount()` from `svelte` directly — that's the Svelte 5 mounting API for islands and other ad-hoc mounting cases."

## Files to write or edit

### 1. `.env`

```
VITE_MIKSER_URL=http://localhost:3001
```

### 2. `package.json` — scripts

```json
{
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview"
    }
}
```

### 3. `vite.config.js`

```js
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
    plugins: [svelte()],
})
```

### 4. `public/example-page.html` — simulated mikser-rendered page

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>Acme — a mikser-rendered page</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2em auto; padding: 0 1em; }
        header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 1em; }
        .search input { padding: 0.5em; width: 100%; max-width: 400px; }
        .cart button { padding: 0.4em 0.8em; }
    </style>
</head>
<body>
    <header>
        <h2>Acme Co</h2>
        <div data-island="cart" data-initial="0"></div>
    </header>

    <article>
        <h1>Welcome</h1>
        <p>Static content rendered by mikser. The interactive bits below are Svelte islands.</p>

        <h2>Find something</h2>
        <div data-island="search"></div>
    </article>

    <script type="module" src="/src/main.js"></script>
</body>
</html>
```

### 5. `src/main.js`

```js
import { mountSearch } from './islands/search.js'
import { mountCart } from './islands/cart.js'

// mikser owns the page HTML. We find each [data-island] node and mount
// the matching Svelte component into it — independent mounts, not one
// app root. Data attributes on the node are passed in as props.
//
// Each mount function is idempotent and a no-op if its selector matches
// nothing, so the same bundle is safe to load on every page.
mountSearch()
mountCart()
```

### 6. `src/islands/search.js` — mikser-aware island

```js
import { mount } from 'svelte'
import { createClient } from 'mikser-io-sdk-api'
import SearchBox from '../components/SearchBox.svelte'

const MIKSER_URL = import.meta.env.VITE_MIKSER_URL || 'http://localhost:3001'
const client = createClient({ baseUrl: MIKSER_URL }).entities('public')

export function mountSearch(selector = '[data-island="search"]') {
    for (const el of document.querySelectorAll(selector)) {
        mount(SearchBox, {
            target: el,
            // The client is passed as a prop, not via setMikserClient,
            // because each island is independent and there's no shared
            // layout context to register on. The component hands it to
            // useDocuments via the { client } option.
            props: { ...el.dataset, client },
        })
    }
}
```

**Say:** "Search island. `mount()` from `svelte` (the Svelte 5 mounting API) instantiates `SearchBox` onto each match. Notice we pass `client` as a prop — not `setMikserClient` — because islands don't share a Svelte context. Each island is independent."

### 7. `src/islands/cart.js` — pure-client island

```js
import { mount } from 'svelte'
import CartCounter from '../components/CartCounter.svelte'

export function mountCart(selector = '[data-island="cart"]') {
    for (const el of document.querySelectorAll(selector)) {
        mount(CartCounter, { target: el, props: { ...el.dataset } })
    }
}
```

**Say:** "Minimal island. No mikser client needed — pure local state. The same shape as any vanilla Svelte 5 mount."

### 8. `src/components/SearchBox.svelte`

```svelte
<script>
    import { useDocuments } from 'mikser-io-sdk-svelte'

    // The mount script passes the client in directly; we hand it to
    // useDocuments via the options object so no Svelte context wiring
    // is needed for islands.
    let { client } = $props()

    let query = $state('')

    const everything = useDocuments(
        () => ({
            fields: ['id', 'route', 'meta'],
            limit: 100,
        }),
        { client },
    )

    const results = $derived.by(() => {
        const term = query.trim().toLowerCase()
        if (!term) return []
        return everything.documents
            .filter(d => (d.meta?.title ?? '').toLowerCase().includes(term))
            .slice(0, 8)
    })
</script>

<div class="search">
    <input
        bind:value={query}
        type="search"
        placeholder="Search…"
        class="search__input"
    />
    {#if results.length}
        <ul class="search__results">
            {#each results as hit (hit.id)}
                <li><a href={hit.route}>{hit.meta?.title ?? hit.route}</a></li>
            {/each}
        </ul>
    {/if}
</div>
```

**Say:** "Live-search component. `useDocuments` accepts an explicit `{ client }` option in its second argument — exactly the path the islands recipe needs because there's no Svelte context to inject from."

### 9. `src/components/CartCounter.svelte`

```svelte
<script>
    let { initial = '0' } = $props()
    let count = $state(Number(initial) || 0)
</script>

<div class="cart">
    <button class="cart__btn" onclick={() => count++}>Add to cart</button>
    <span class="cart__count">{count} item(s)</span>
</div>
```

**Say:** "Minimal client-only component. `initial` comes from `data-initial` on the mount node — same bundle starts at any count per-page."

## How mikser produces the HTML

Same as the React/Vue islands recipes — a Handlebars/Eta layout that emits the `data-island="…"` mount points and the `<script>` reference to `/main.js`. See the Vue Islands recipe (§"How mikser produces the HTML") for the exact layout template and `mikser.config.js` plugin list — the Svelte path is identical on the mikser side.

## Run

```bash
cd mikser-content && npm run dev    # → mikser :3001 (terminal 1)
npm run dev                          # → vite :5173 (terminal 2)
```

For production:

```bash
cd mikser-content && npm run build   # → out/
cd .. && npm run build               # → dist/main.js
cp -r dist/* mikser-content/out/
# deploy mikser-content/out/ as a static site
```

## Skip list

Do not touch: TypeScript / ESLint / Prettier / Tailwind / PostCSS configs, any existing component the user has, the user's existing `vite.config.js` if it has heavy customisation (just merge `plugins: [svelte()]` in).
