# Vue 3 + Vite — mikser-io bootstrap recipe

This reference is read by the `add-mikser` skill when `package.json` shows Vue. It assumes Vue 3 + Vite. It is not a tutorial — it's the exact set of edits and files to apply, plus the one-line explanations to give the user as you go.

## Peer deps to install

Always:

```bash
npm install mikser-io-sdk-vue mikser-io-sdk-api markdown-it
```

If the user does **not** already have `vue-router`:

```bash
npm install vue-router
```

Tell the user: "Four deps (or three if you already had vue-router). `sdk-api` is the entities client you create once and hand to the plugin; `sdk-vue` wraps it as Vue composables; `vue-router` is standard; `markdown-it` runs in the browser to convert each document's markdown body to HTML at render time. The mikser server delivers raw markdown over SSE — the conversion is intentionally client-side so the live-update loop stays simple."

## Files to write or edit

In order. Each step has a "say" line — the one-sentence explanation to give the user after the file is created/edited.

### 1. `.env`

Create or append at the **project root** (next to `vite.config.js`, not under `src/`):

```
VITE_MIKSER_URL=http://localhost:3001
```

**Say:** "`VITE_MIKSER_URL` is read by `src/main.js`. Change it for staging/prod; the SDK does no other config."

### 2. `vite.config.js` — bump `build.target` to `es2022`

The SDK uses top-level `await seeded` to delay mount until the catalog has its initial documents. Top-level await needs `es2022`.

If the file already has a `build` block, add `target: 'es2022'`. Otherwise add the block:

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [vue()],
    build: {
        target: 'es2022',
    },
})
```

**Say:** "`build.target: 'es2022'` lets `await seeded` in `src/main.js` survive `vite build`. Without it, the dev server works but the prod bundle fails."

### 3. `index.html` — add a loading shell

Inside `<div id="app">`, replace whatever's there with:

```html
<div id="app">
    <div class="mikser-loading">Loading…</div>
</div>
<style>
    .mikser-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        font: 14px/1.4 system-ui, -apple-system, sans-serif;
        color: #888;
    }
</style>
```

**Say:** "The user sees this for ~100ms while the SSE seed runs. The Vue app mounts over it. Style it however you like — it's just the empty-state."

### 4. `src/route-mapping.js`

```js
// Map each document's `meta.component` to the Vue view that renders it.
// Add a new entry here when you add a new schema in mikser-content/schemas/.
//
// Note: meta.component (this file's dispatch key) is separate from
// meta.layout (mikser's SSG render template). Layout is the file in
// mikser-content/layouts/; component is the file in src/views/. Keeping
// them separate avoids "layout 'page' not found" warnings from mikser
// when a SPA-only component has no matching template.
import PageView from './views/PageView.vue'
import ArticleView from './views/ArticleView.vue'
import NotFound from './views/NotFound.vue'

const viewForComponent = {
    page: PageView,
    article: ArticleView,
}

// Resolve the URL path for a document. Prefer the explicit meta.route;
// fall back to the entity's destination (mikser computes this from the
// source path + cleanUrls). Returns null to skip documents that have
// neither — useful for fragments / data files / unrouted entities.
function routeFor(doc) {
    if (doc.meta?.route) return doc.meta.route
    if (doc.destination) {
        return doc.destination
            .replace(/\/index\.html?$/, '/')
            .replace(/\.html?$/, '')
    }
    return null
}

// useMikserRoutes calls this for every document in the sitemap stream.
// Return a vue-router route object — or null/undefined to skip. The SDK
// uses `name` as the key for adding/removing routes as the catalog
// changes, so include it.
export function mapRoute(doc) {
    const path = routeFor(doc)
    if (!path) return null
    const component = viewForComponent[doc.meta?.component] ?? NotFound
    return {
        name: doc.id,
        path,
        component,
        // The view receives only the entityId and fetches the full
        // document via useDocument — keeps the sitemap snapshot lean
        // (id + meta + destination, no content) and lets each view
        // subscribe to its own document for live updates.
        props: { entityId: doc.id },
        meta: { docId: doc.id, component: doc.meta?.component, title: doc.meta?.title },
    }
}
```

**Say:** "Two changes from a naive map. First, dispatch is on `meta.component`, not `meta.layout` — layout is reserved for mikser's SSG render pipeline so the two don't collide. Second, the route path falls back to `doc.destination` when `meta.route` isn't explicit — so a markdown file's URL can come from its filesystem position without an extra front-matter field. Adding a new component = one entry in `viewForComponent` + one schema file."

### 5. `src/markdown.js`

A tiny shared helper. Lives here so every view (and any future view the user adds) renders markdown the same way.

```js
import MarkdownIt from 'markdown-it'

// `html: true` lets authors drop inline HTML into their markdown when
// they need to. `linkify: true` auto-links bare URLs. Both are common
// expectations for content-driven sites; flip them off here if you
// want stricter input.
const md = new MarkdownIt({ html: true, linkify: true, breaks: false })

export function renderMarkdown(source) {
    return md.render(source ?? '')
}
```

**Say:** "One instance of markdown-it shared across every view. Configure it here (footnotes, emoji, syntax highlighting via `highlight`, etc.) — every view picks the change up. `doc.content` arrives as raw markdown over SSE; this is the only place that turns it into HTML."

### 6. `src/views/PageView.vue`

```vue
<script setup>
import { computed } from 'vue'
import { useDocument } from 'mikser-io-sdk-vue'
import { renderMarkdown } from '../markdown.js'

const props = defineProps({ entityId: { type: String, required: true } })

// useDocument fetches the full document by id from the `public`
// endpoint. The sitemap router knows only id + meta + destination;
// the full body comes from here. Live: SSE pushes a new revision
// → this composable's `document` ref updates → html re-renders.
const { document } = useDocument(() => props.entityId)

const html = computed(() =>
    document.value ? renderMarkdown(document.value.content) : '',
)
</script>

<template>
    <article v-if="document" class="page">
        <h1>{{ document.meta?.title }}</h1>
        <div v-html="html" />
    </article>
</template>

<style scoped>
.page { max-width: 70ch; margin: 2rem auto; padding: 0 1rem; }
</style>
```

**Say:** "Generic page view — your fallback. `useDocument(() => props.entityId)` fetches the full document from the public endpoint and stays subscribed: edit the markdown file and the body re-renders without a refresh. The router only needs the id from the sitemap snapshot; this view does the full fetch."

### 7. `src/views/ArticleView.vue`

```vue
<script setup>
import { computed } from 'vue'
import { useDocument } from 'mikser-io-sdk-vue'
import { renderMarkdown } from '../markdown.js'

const props = defineProps({ entityId: { type: String, required: true } })
const { document } = useDocument(() => props.entityId)
const html = computed(() =>
    document.value ? renderMarkdown(document.value.content) : '',
)
</script>

<template>
    <article v-if="document" class="article">
        <header>
            <h1>{{ document.meta?.title }}</h1>
            <p class="byline">
                By {{ document.meta?.author }} ·
                <time :datetime="document.meta?.date">
                    {{ new Date(document.meta?.date).toLocaleDateString() }}
                </time>
            </p>
        </header>
        <div v-html="html" />
    </article>
</template>

<style scoped>
.article { max-width: 70ch; margin: 2rem auto; padding: 0 1rem; }
.byline { color: #666; font-size: 0.9em; }
</style>
```

**Say:** "Component-specific view. The article schema requires `author` and `date`, so this view can rely on them once the document loads. Same `useDocument` pattern as PageView."

### 8. `src/views/NotFound.vue`

```vue
<template>
    <section class="not-found">
        <h1>404</h1>
        <p>This document doesn't exist (yet).</p>
    </section>
</template>

<style scoped>
.not-found { text-align: center; padding: 4rem 1rem; color: #888; }
</style>
```

**Say:** "Fallback for routes mikser doesn't know about. Also returned from `mapRoute` when a document has an unknown `layout`."

### 9. `src/main.js`

The pattern: mount Vue immediately. The SDK ships `useMikserStatus` — a composable that probes the backend and returns a reactive status ref (`'connecting' | 'ready' | 'unreachable'`). App.vue gates `<RouterView />` on that status, so a missing backend produces a clear in-app error within 5 seconds instead of a silent forever-loading shell. **Do not `await seeded` before mount.**

The `mikserUrl` is provided into the app so App.vue can show it in error messages.

#### Variant A — user has no existing router

```js
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createClient } from 'mikser-io-sdk-api'
import { createMikserPlugin, useMikserRoutes } from 'mikser-io-sdk-vue'
import { mapRoute } from './route-mapping.js'
import NotFound from './views/NotFound.vue'
import App from './App.vue'

const mikserUrl = import.meta.env.VITE_MIKSER_URL

// One client. `initialUrl` points at the static snapshot the data
// plugin writes (out/data/sitemap.json) — fast first paint from a
// CDN-cacheable file, then live SSE keeps the route table current.
// No second API endpoint to configure.
const documents = createClient({ baseUrl: mikserUrl })
    .entities('public', { initialUrl: '/data/sitemap.json' })

const app = createApp(App)
app.use(createMikserPlugin({ client: documents }))

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/:catchAll(.*)', name: 'not-found', component: NotFound },
    ],
})
app.use(router)

// useMikserRoutes reads the default client. First paint loads from
// the static snapshot; SSE deltas keep it current.
const { seeded } = useMikserRoutes(router, { mapRoute })

// Re-resolve the current URL after the SDK has populated routes, so
// the just-added route renders without flicker.
seeded.then(() => router.replace(router.currentRoute.value.fullPath))

app.provide('mikserUrl', mikserUrl)
app.mount('#app')
```

#### Variant B — user has an existing router

```js
import { createApp } from 'vue'
import { createClient } from 'mikser-io-sdk-api'
import { createMikserPlugin, useMikserRoutes } from 'mikser-io-sdk-vue'
import { mapRoute } from './route-mapping.js'
import { router } from './router.js'  // their existing router
import App from './App.vue'

const mikserUrl = import.meta.env.VITE_MIKSER_URL
const documents = createClient({ baseUrl: mikserUrl })
    .entities('public', { initialUrl: '/data/sitemap.json' })

const app = createApp(App)
app.use(createMikserPlugin({ client: documents }))
app.use(router)

const { seeded } = useMikserRoutes(router, { mapRoute })
seeded.then(() => router.replace(router.currentRoute.value.fullPath))

app.provide('mikserUrl', mikserUrl)
app.mount('#app')
```

**Say (both variants):** "One client. `initialUrl: '/data/sitemap.json'` points at the static snapshot the `data` plugin writes — fast first paint from a CDN-cacheable file, then live SSE on the same `/public` endpoint keeps the route table current. No second API endpoint, no `useMikserRoutes({ client })` plumbing. The data plugin's `catalog.sitemap` filter (`meta.component`) is the load-bearing convention: only documents with a component end up in the snapshot, and so only those become routes."

If the user has an existing router but you don't know its filename, ask before importing — don't guess `./router.js`.

### 10. `src/App.vue`

This is the integration point — where mikser-driven routes actually render. It also hosts the connection guard that surfaces backend-unreachable errors instead of hanging.

**Branch B (blank-project scaffold) — overwrite the scaffolder's App.vue.**

`create-vite --template vue` always lands an `App.vue` that renders `<HelloWorld />` and imports a logo. Leaving it in place would mount the Vite demo instead of any mikser route. Replace it with:

```vue
<script setup>
import { inject } from 'vue'
import { useMikserStatus } from 'mikser-io-sdk-vue'

// useMikserStatus probes the backend once via client.list({ limit: 1 })
// and returns a ref that settles to 'ready' on success or 'unreachable'
// on failure / 5s deadline. One-shot — won't flip back after settling.
// Override timeoutMs if 5s isn't right for your network.
const status = useMikserStatus()
const url = inject('mikserUrl')
</script>

<template>
    <!-- 'ready' — routes registered, render the matched view. -->
    <RouterView v-if="status === 'ready'" />

    <!-- 'connecting' — probe in flight. Usually well under 1s in dev. -->
    <main v-else-if="status === 'connecting'" class="mikser-state mikser-connecting">
        <p>Connecting to mikser at <code>{{ url }}</code>…</p>
    </main>

    <!-- 'unreachable' — backend didn't respond in time. Show the fix. -->
    <main v-else class="mikser-state mikser-error">
        <h2>Can't reach the mikser backend</h2>
        <p>Tried <code>{{ url }}</code> for 5 seconds. Start it in another terminal:</p>
        <pre>cd mikser-content
npm run dev</pre>
        <p>Then reload this page.</p>
    </main>
</template>

<style scoped>
.mikser-state {
    max-width: 60ch;
    margin: 4rem auto;
    padding: 0 1rem;
    font: 14px/1.5 system-ui, -apple-system, sans-serif;
}
.mikser-connecting { color: #666; }
.mikser-error h2 { color: #b94a48; margin-top: 0; }
.mikser-error pre {
    background: #f5f5f5;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
}
</style>
```

You can also delete `src/components/HelloWorld.vue` and `src/assets/` if you want to scrub the demo.

**Say (Branch B):** "App.vue does two jobs: render the matched route via `<RouterView />`, and surface a connection panel while the SSE seed is pending or after it times out. The injected `mikserStatus` ref drives the three states. Style it to match your project — but keep the three branches so backend issues never produce a silent forever-loading screen."

**Branch A (existing project) — don't overwrite, but add the guard markup.**

If `App.vue` already exists with content, do **not** overwrite it — say to the user: "Your `App.vue` already exists. Add the connection-status check around your `<RouterView />` so a missing mikser backend doesn't hang the page indefinitely. The minimal version is:

```vue
<script setup>
import { inject } from 'vue'
import { useMikserStatus } from 'mikser-io-sdk-vue'
const status = useMikserStatus()
const url = inject('mikserUrl')
</script>

<template>
    <!-- Your existing shell (nav, header, etc.) -->
    <RouterView v-if="status !== 'unreachable'" />
    <main v-else class="mikser-error">
        Can't reach mikser at {{ url }}. Start it with `cd mikser-content && npm run dev`.
    </main>
</template>
```

If you don't have an existing router and rely on mikser routes only, gate `<RouterView />` on `status === 'ready'` so a 'connecting' state shows first. If you have other routes, leave `<RouterView />` always rendered — the user can still navigate your routes even while mikser is connecting."

## Mode 2: Dynamic routes — when the catalog is big

Everything above is **Mode 1**: every catalog route is enumerated up-front via the `/data/sitemap.json` snapshot, then registered with vue-router via `useMikserRoutes`. Works perfectly up to ~5–10k routes.

**Switch to Mode 2** when:
- The user says the catalog is large (e.g. "a blog with ~30k posts", "an e-commerce catalog with 100k products").
- You sniff the existing catalog and see > 5k matching documents.
- The user explicitly mentions scale concerns ("I don't want to load all routes at boot").

The diff from Mode 1 is small but every layer changes:

### What changes

| File | Mode 1 | Mode 2 |
|---|---|---|
| `mikser.config.js` | `data.catalog.sitemap` block present | Remove `data.catalog.sitemap` — no snapshot needed |
| `src/main.js` | `entities('public', { initialUrl: '/data/sitemap.json' })`, `useMikserRoutes(router, { mapRoute })`, `await seeded` | Plain `entities('public')`, no `useMikserRoutes`, no `seeded` |
| Router | Hand-coded routes + `useMikserRoutes` populates the rest | Hand-coded routes + **one catch-all** `path: '/:pathMatch(.*)*'` |
| `src/route-mapping.js` | `mapRoute(document)` → route object | Not needed — dispatch happens inside the catch-all view via `useDocumentByRoute` |
| Per-document view | `useDocument(() => props.entityId)` | Same — the catch-all view fetches via `useDocumentByRoute`, then per-doc views still use `useDocument` for live updates by id |

### `src/main.js` (Mode 2)

```js
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createClient } from 'mikser-io-sdk-api'
import { createMikserPlugin } from 'mikser-io-sdk-vue'
import App from './App.vue'

const mikserUrl = import.meta.env.VITE_MIKSER_URL

// No initialUrl — no snapshot. Cold routes are resolved per-navigation
// via the per-query disk cache (cache: true on the public endpoint).
const documents = createClient({ baseUrl: mikserUrl })
    .entities('public')

const app = createApp(App)
app.use(createMikserPlugin({ client: documents }))

const router = createRouter({
    history: createWebHistory(),
    routes: [
        // Hand-coded first
        { path: '/',       name: 'home',   component: () => import('./views/Home.vue') },
        { path: '/search', name: 'search', component: () => import('./views/Search.vue') },
        // ONE catch-all resolves everything content-backed
        { path: '/:pathMatch(.*)*', name: 'doc', component: () => import('./views/DocumentResolver.vue') },
    ],
})
app.use(router)
app.provide('mikserUrl', mikserUrl)
app.mount('#app')
```

### `src/views/DocumentResolver.vue`

```vue
<script setup>
import { useRoute } from 'vue-router'
import { useDocumentByRoute } from 'mikser-io-sdk-vue'
import ArticleView from './ArticleView.vue'
import PageView    from './PageView.vue'
import NotFound    from './NotFound.vue'

const route = useRoute()
const { document, loading } = useDocumentByRoute(() => route.path)

const views = { article: ArticleView, page: PageView }
</script>

<template>
    <p v-if="loading">Loading…</p>
    <component v-else-if="document" :is="views[document.meta?.component] ?? PageView" :entity-id="document.id" />
    <NotFound v-else />
</template>
```

**Say:** "One catch-all instead of N registered routes. `useDocumentByRoute(() => route.path)` issues a list call filtered by `meta.route`. The first user pays an API roundtrip; mikser writes the response to the per-query cache file; every subsequent user gets that file served by the proxy. So routes are populated by traffic, not by a snapshot — the cache is the index. Add more `data.catalog.<name>` snapshots if you have nav menus, tag indexes, or other known-shape queries that benefit from build-time publish; the routing snapshot just isn't one of them at this scale."

### What to skip in Mode 2

Don't write these files (they're Mode 1 only):

- `src/route-mapping.js` — dispatch happens in the catch-all view
- The `await seeded` step in main.js — no snapshot to wait for
- `useMikserRoutes` import — not used

The connection guard, view components, markdown rendering, schemas, plugin-schemas wiring — all unchanged.

## Skip list

Do not touch:

- `package.json` scripts (their existing `dev`/`build` work)
- Tailwind, PostCSS, ESLint configs
- Any existing component or store
- TypeScript configs — the SDKs ship `.d.ts` and work in JS or TS projects
