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
// Map each document's `meta.layout` to the view component that renders it.
// Add a new layout here when you add a new schema in mikser-content/schemas/.
import PageView from './views/PageView.vue'
import ArticleView from './views/ArticleView.vue'
import NotFound from './views/NotFound.vue'

const viewForLayout = {
    page: PageView,
    article: ArticleView,
}

// useMikserRoutes calls this for every document. Return a vue-router route
// object — or null/undefined to skip the document. The SDK uses `name` as
// the key for adding/removing routes as the catalog changes, so include it.
export function mapRoute(doc) {
    const component = viewForLayout[doc.meta?.layout] ?? NotFound
    return {
        name: doc.id,
        path: doc.meta.route,
        component,
        // Pass the live document into the view as a `doc` prop so the view
        // doesn't have to look it up again.
        props: { doc },
        meta: { docId: doc.id },
    }
}
```

**Say:** "This is the dispatch point. `meta.layout: 'article'` in a markdown file lands here and picks `ArticleView`. Adding a new layout = one entry here + one schema file. The `name: doc.id` is what lets the SDK track each route across SSE updates."

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
import { renderMarkdown } from '../markdown.js'

const props = defineProps({ doc: { type: Object, required: true } })

// `computed` re-runs when the live `doc` prop changes — markdown edits
// push through SSE → router updates the prop → this re-renders.
const html = computed(() => renderMarkdown(props.doc.content))
</script>

<template>
    <article class="page">
        <h1>{{ doc.meta.title }}</h1>
        <div v-html="html" />
    </article>
</template>

<style scoped>
.page { max-width: 70ch; margin: 2rem auto; padding: 0 1rem; }
</style>
```

**Say:** "Generic page view — your fallback. The `doc` prop is the live document; edits push here automatically over SSE and `computed` re-converts the body. `v-html` injects the markdown-it output."

### 7. `src/views/ArticleView.vue`

```vue
<script setup>
import { computed } from 'vue'
import { renderMarkdown } from '../markdown.js'

const props = defineProps({ doc: { type: Object, required: true } })
const html = computed(() => renderMarkdown(props.doc.content))
</script>

<template>
    <article class="article">
        <header>
            <h1>{{ doc.meta.title }}</h1>
            <p class="byline">
                By {{ doc.meta.author }} ·
                <time :datetime="doc.meta.date">
                    {{ new Date(doc.meta.date).toLocaleDateString() }}
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

**Say:** "Layout-specific view. The article schema requires `author` and `date`, so this view can rely on them being present."

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
const client = createClient({ baseUrl: mikserUrl }).entities('public')

const app = createApp(App)
app.use(createMikserPlugin({ client }))

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/:catchAll(.*)', name: 'not-found', component: NotFound },
    ],
})
app.use(router)

// Subscribe to mikser routes. Routes appear after the first SSE batch.
// We don't await `seeded` — App.vue gates RouterView on useMikserStatus
// (called inside the App component) so the page never hangs silently.
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
const client = createClient({ baseUrl: mikserUrl }).entities('public')

const app = createApp(App)
app.use(createMikserPlugin({ client }))
app.use(router)

const { seeded } = useMikserRoutes(router, { mapRoute })
seeded.then(() => router.replace(router.currentRoute.value.fullPath))

app.provide('mikserUrl', mikserUrl)
app.mount('#app')
```

**Say (both variants):** "Two-call client setup: `createClient({ baseUrl })` → root client; `.entities('public')` → the entities client the SDK uses. `createMikserPlugin({ client })` registers it for composables. `useMikserRoutes(router, { mapRoute })` adds a route per document. We mount immediately — App.vue uses the SDK's `useMikserStatus` composable to decide whether to render `<RouterView />`, a connecting panel, or an unreachable error. No more await-seeded-before-mount, no more forever-loading screens."

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

## Skip list

Do not touch:

- `package.json` scripts (their existing `dev`/`build` work)
- Tailwind, PostCSS, ESLint configs
- Any existing component or store
- TypeScript configs — the SDKs ship `.d.ts` and work in JS or TS projects
