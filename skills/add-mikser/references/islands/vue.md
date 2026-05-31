# Vue 3 + Islands — mikser-io bootstrap recipe

This reference is read by the `add-mikser` skill when the user picks the **Islands** architecture and the framework is Vue. Mikser produces the static HTML; small Vue bundles mount onto specific DOM nodes for interactivity. No vue-router, no SPA shell, no hydration tax.

This is the right shape for content-heavy sites with focused interactivity — search, cart, contact form, booking — where the bulk of the page is just content (which mikser renders perfectly) and JavaScript is needed only at a few spots.

> **Branch A warning:** This recipe assumes you'll move the page-layout pipeline into mikser-content's render-* plugins (hbs / eta / liquid). If your existing app is a Vue SPA today, that's a big restructure — confirm with the user that they really want Islands. The Pure SPA recipe is a closer fit if they want to keep the SPA shell. Islands is for sites that should look like static HTML pages, not single-page apps.

## How it fits together

```
mikser (render-hbs / render-eta / etc.)
   └─ produces HTML pages with <div data-island="search"> mount points
                                                         │
                                                         ▼
                              Vite multi-entry build → dist/search.js, dist/cart-counter.js, etc.
                                                         │
                                                         ▼
                              Mikser layouts <script type="module" src="/islands/search.js">
                                                         │
                                                         ▼
                              On page load: each island bundle finds its mount point and mounts
```

The mikser-rendered HTML is the source of truth for content. The Vue bundles add behaviour. No double-rendering, no hydration mismatch.

## Peer deps to install

```bash
npm install mikser-io-sdk-vue mikser-io-sdk-api
```

(No vue-router, no markdown-it — islands don't render content, mikser does. No connection guard either — if mikser is down, the static HTML still works; only the islands are affected.)

Tell the user: "Two deps. No router because we're not building a SPA — each island is a tiny Vue app that mounts onto a DOM node mikser put there. No markdown-it because mikser renders the markdown into HTML at build time."

## Files to write or edit

### 1. `.env`

Project root:

```
VITE_MIKSER_URL=http://localhost:3001
```

**Say:** "Used by any island that talks to mikser at runtime (e.g. search). Server-only islands or pure-client islands can ignore this."

### 2. `.gitignore`

Append:

```
dist/
```

### 3. `package.json` — scripts + deps

```json
{
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview"
    }
}
```

The Vite config below handles the multi-entry plumbing.

**Say:** "Same three scripts you'd expect. Multi-entry is configured in vite.config.js — no extra scripts needed."

### 4. `vite.config.js`

Replace any existing config:

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

// Multi-entry build — one bundle per island. Each entry is a tiny
// script that finds its mount point and instantiates Vue.
//
// Output (dist/):
//   search.js         ← mount the SearchBox component
//   cart-counter.js   ← mount the CartCounter component
//
// Drop these next to mikser's `out/` (or serve from a CDN) and the
// mikser-rendered HTML can <script> them per page.
export default defineConfig({
    plugins: [vue()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                // Add an entry here for every new island.
                search:         resolve(__dirname, 'src/islands/search.js'),
                'cart-counter': resolve(__dirname, 'src/islands/cart-counter.js'),
            },
            output: {
                // Predictable filenames so the mikser-rendered HTML can
                // reference them as /islands/search.js etc.
                entryFileNames: '[name].js',
                assetFileNames: '[name][extname]',
            },
        },
    },
    server: {
        port: 5175,
        // Serve example-page.html as the dev page so you can see the
        // islands mount in context.
        open: '/public/example-page.html',
    },
})
```

**Say:** "The `rollupOptions.input` map is where you list every island. The `entryFileNames: '[name].js'` keeps filenames predictable so the mikser layouts can hardcode `/islands/search.js` without hashing surprises. Dev server opens `public/example-page.html` — your simulated mikser-rendered page."

### 5. `public/example-page.html` — simulated mikser-rendered page

This file imitates what `mikser-content` would output for a real page. In production, your mikser layouts produce HTML like this; in dev, this stub lets you see all the islands work without spinning up the full mikser render pipeline.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Acme — a mikser-rendered page</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2em auto; padding: 0 1em; }
        header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 1em; }
        article h1 { margin-bottom: 0.25em; }
        .meta { color: #666; }
        .search-box, .cart-counter { margin: 1em 0; }
        input { padding: 0.5em; width: 100%; max-width: 400px; }
        button { padding: 0.5em 1em; background: #07a; color: #fff; border: 0; cursor: pointer; border-radius: 4px; }
        button:disabled { background: #ccc; cursor: not-allowed; }
    </style>
</head>
<body>
    <!--
      A simulated mikser-rendered page. In a real project, mikser's
      render-hbs (or similar) plugin produces this HTML at build time
      from a layout template + a document's content. The body text
      and headings are all server-rendered.

      The data-island elements are the mount points. Each one gets
      its own Vue bundle (built by Vite) that handles its feature.
      The rest of the page never loads JavaScript.
    -->

    <header>
        <h2>Acme Co</h2>
        <!-- Pure client-side island — no mikser, just demonstrates that
             islands can do anything Vue can do. -->
        <div data-island="cart-counter"></div>
    </header>

    <article>
        <h1>Welcome to our store</h1>
        <p class="meta">A static page rendered by mikser. The interactive bits are Vue islands.</p>
        <p>This whole page would be produced by mikser's render-hbs plugin from a markdown file + a layout template. No client JS is needed to read it.</p>

        <h2>Find something</h2>
        <!-- Live search backed by mikser. data-* attributes let the
             same bundle work across many pages with different config. -->
        <div data-island="search" data-base-url="/" data-endpoint="public"></div>
    </article>

    <!-- Each island bundle is its own <script>. Only the islands the
         page actually uses get loaded. Add type="module" for ES module
         output (Vite's default). -->
    <script type="module" src="/src/islands/cart-counter.js"></script>
    <script type="module" src="/src/islands/search.js"></script>
</body>
</html>
```

**Say:** "The simulated mikser-rendered page. In production, mikser's render-hbs/eta/liquid plugin emits something very similar — a markdown body + layout template → static HTML with `<div data-island=\"…\">` mount points and `<script>` tags for the islands that page needs. Edit this file to mirror what your real layouts will look like; the islands will mount onto whatever DOM you give them."

### 6. `src/islands/search.js` — search island entry

```js
// Search island. Mounts onto <div data-island="search">.
//
// Each island is its own tiny app — no shared root. They install the
// mikser plugin individually because each island carries its own
// configuration (which endpoint, which token if any) from data-*
// attributes on the mount node.
import { createApp } from 'vue'
import { createClient } from 'mikser-io-sdk-api'
import { createMikserPlugin } from 'mikser-io-sdk-vue'
import SearchBox from '../components/SearchBox.vue'

const el = document.querySelector('[data-island="search"]')
if (el) {
    const endpoint = el.dataset.endpoint ?? 'public'
    const baseUrl  = el.dataset.baseUrl  ?? import.meta.env.VITE_MIKSER_URL ?? '/'
    const documents = createClient({ baseUrl }).entities(endpoint)

    createApp(SearchBox)
        .use(createMikserPlugin({ client: documents }))
        .mount(el)
}
```

**Say:** "Entry script. The `if (el)` guard means this bundle is safe to load on any page — it only mounts if the mount point exists. Config comes from `data-*` attributes on the mount node, so the same bundle works on pages with different endpoints / base URLs."

### 7. `src/islands/cart-counter.js` — pure-client island entry

```js
// Cart counter island. Mounts onto <div data-island="cart-counter">.
// Doesn't touch mikser — purely client-side state (cart, localStorage,
// whatever). Demonstrates that islands aren't required to be
// mikser-aware; they can be anything Vue can do.
import { createApp } from 'vue'
import CartCounter from '../components/CartCounter.vue'

const el = document.querySelector('[data-island="cart-counter"]')
if (el) {
    createApp(CartCounter).mount(el)
}
```

**Say:** "Minimal island. No mikser plugin because this island doesn't talk to mikser — it manages local state only. This is the simplest possible island shape; reach for it whenever the interactive feature doesn't need server data."

### 8. `src/components/SearchBox.vue`

```vue
<script setup>
import { ref, computed } from 'vue'
import { useDocuments } from 'mikser-io-sdk-vue'

const q = ref('')

// Sift filter built reactively from the input. The empty-string case
// uses an id that can't match anything, so the result set is empty
// until the user types — saves an unnecessary live subscription on
// the entire catalog.
const query = computed(() => ({
    filter: q.value
        ? { 'meta.title': { $regex: q.value, $options: 'i' }, 'meta.published': true }
        : { id: '__empty__' },
    fields: ['id', 'meta.title', 'meta.summary', 'meta.route'],
    limit:  10,
}))
const { documents: results, loading } = useDocuments(query)
</script>

<template>
    <div class="search-box">
        <input v-model="q" placeholder="Search…" autofocus />
        <p v-if="loading && q">Searching…</p>
        <ul v-if="results.length">
            <li v-for="r in results" :key="r.id">
                <a :href="r.meta.route">
                    <strong>{{ r.meta.title }}</strong>
                    <p>{{ r.meta.summary }}</p>
                </a>
            </li>
        </ul>
        <p v-else-if="q && !loading">No results.</p>
    </div>
</template>
```

**Say:** "Live-search component. `useDocuments` subscribes via SSE — type a query and results update without a refetch button. The empty-state filter (`{ id: '__empty__' }`) is a small but real optimisation: don't subscribe to the catalog until the user actually types."

### 9. `src/components/CartCounter.vue`

```vue
<script setup>
import { ref, onMounted } from 'vue'

const count = ref(0)

onMounted(() => {
    const stored = Number(localStorage.getItem('cart-count'))
    if (Number.isFinite(stored)) count.value = stored
})

function add() {
    count.value++
    localStorage.setItem('cart-count', String(count.value))
}
</script>

<template>
    <div class="cart-counter">
        Cart: {{ count }} <button @click="add">+</button>
    </div>
</template>
```

**Say:** "Minimal client-only component. Replace with your real cart store when you have one. The pattern — pure client state, no server roundtrips — is right whenever the interaction doesn't need server data."

## How mikser produces the HTML

In a real project, you'd add a Handlebars (or Eta / Liquid) layout to your mikser-content:

`mikser-content/layouts/page.html.hbs`:

```hbs
<!DOCTYPE html>
<html lang="{{ document.meta.lang }}">
<head>
    <meta charset="UTF-8" />
    <title>{{ document.meta.title }}</title>
    <link rel="stylesheet" href="/site.css" />
</head>
<body>
    <article>
        <h1>{{ document.meta.title }}</h1>
        {{{ document.content }}}
    </article>

    {{#if document.meta.includeSearch}}
        <div data-island="search" data-endpoint="public"></div>
        <script type="module" src="/islands/search.js"></script>
    {{/if}}
</body>
</html>
```

Then your `mikser.config.js` needs the templating plugins:

```js
export default {
    plugins: [
        'documents', 'front-matter', 'yaml', 'plugin-schemas',
        'layouts', 'render-hbs', 'render-markdown',
        'data', 'api',
    ],
    layouts: {
        cleanUrls: true,
    },
}
```

And you'd run `mikser` (without `--server`) to produce `out/` — a folder of static HTML files. Deploy that folder.

**Say:** "Two sides to islands. The frontend (this directory) produces JS bundles. Mikser produces the HTML that includes them. The connection is the `data-island=\"name\"` convention plus the matching `<script>` tag. You can add a new island by: (a) writing a new component, (b) adding a new entry to `vite.config.js`, (c) editing your mikser layout to include the mount point and script tag."

## Run it

Two terminals:

```bash
# Terminal 1 — mikser backend (in --server mode while developing,
# but at deploy time you'd run `mikser` once and serve out/ static)
cd mikser-content && npm run dev          # → mikser on :3001

# Terminal 2 — vite for the island bundles
npm run dev                                # → vite on :5175, opens example-page.html
```

For production:

```bash
# 1. Build the static site
cd mikser-content && npm run build          # → out/ has the static HTML

# 2. Build the island bundles
cd .. && npm run build                      # → dist/ has search.js, cart-counter.js, etc.

# 3. Copy / symlink the island bundles into mikser's out/
cp -r dist/* mikser-content/out/islands/

# 4. Deploy mikser-content/out/ to your static host
```

**Say:** "Two builds, one deploy target. The mikser build produces the HTML; the vite build produces the JS. Combine and serve as one static site. No runtime mikser server in production — content is baked in at build time."

## Conventions worth keeping

- **`data-island="name"`** as the mount selector. Predictable, semantic, easy to grep for.
- **`data-*`** attributes for per-page config (endpoint, base URL, submit URL). Avoids stuffing config into the bundle at build time.
- **Each island gets its own `createApp`.** No shared root, no shared state between islands by default. If you need shared state (cross-island cart, auth), introduce a module-level singleton — same level of cross-island wiring you'd use in vanilla JS.
- **Lazy loading is one line away.** For below-the-fold islands, `import('./islands/booking.js')` or use an `IntersectionObserver` to load when the mount point scrolls into view.

## Skip list

Do not touch:

- TypeScript / ESLint / Prettier / Tailwind / PostCSS configs
- Any existing component the user has
- The user's existing `vite.config.js` — replace it cleanly with the multi-entry version above; the islands recipe assumes Vite owns the build pipeline
