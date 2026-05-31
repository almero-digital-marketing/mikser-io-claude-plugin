# Vue 3 + Vite — mikser-io bootstrap recipe

This reference is read by the `add-mikser` skill when `package.json` shows Vue. It assumes Vue 3 + Vite. It is not a tutorial — it's the exact set of edits and files to apply, plus the one-line explanations to give the user as you go.

## Peer deps to install

Always:

```bash
npm install mikser-io-sdk-vue mikser-io-sdk-api
```

If the user does **not** already have `vue-router`:

```bash
npm install vue-router
```

Tell the user: "These two/three are the only new deps. `sdk-api` is the entities client (you create it once and hand it to the plugin); `sdk-vue` wraps it as Vue composables; `vue-router` is standard."

## Files to write or edit

In order. Each step has a "say" line — the one-sentence explanation to give the user after the file is created/edited.

### 1. `.env`

Create or append:

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

### 5. `src/views/PageView.vue`

```vue
<script setup>
defineProps({ doc: { type: Object, required: true } })
</script>

<template>
    <article class="page">
        <h1>{{ doc.meta.title }}</h1>
        <!-- doc.content is the rendered HTML from render-markdown -->
        <div v-html="doc.content" />
    </article>
</template>

<style scoped>
.page { max-width: 70ch; margin: 2rem auto; padding: 0 1rem; }
</style>
```

**Say:** "Generic page view — your fallback. The `doc` prop is the live document; edits in the markdown file push here automatically over SSE."

### 6. `src/views/ArticleView.vue`

```vue
<script setup>
defineProps({ doc: { type: Object, required: true } })
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
        <div v-html="doc.content" />
    </article>
</template>

<style scoped>
.article { max-width: 70ch; margin: 2rem auto; padding: 0 1rem; }
.byline { color: #666; font-size: 0.9em; }
</style>
```

**Say:** "Layout-specific view. The article schema requires `author` and `date`, so this view can rely on them being present."

### 7. `src/views/NotFound.vue`

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

### 8. `src/main.js`

There are two variants. Pick based on the answer to question 2 in the workflow.

#### Variant A — user has no existing router

```js
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createClient } from 'mikser-io-sdk-api'
import { createMikserPlugin, useMikserRoutes } from 'mikser-io-sdk-vue'
import { mapRoute } from './route-mapping.js'
import NotFound from './views/NotFound.vue'
import App from './App.vue'

const app = createApp(App)

// 1. The entities client. One per app — caches, dedups, manages SSE.
const client = createClient({ url: import.meta.env.VITE_MIKSER_URL })

// 2. Hand the client to the Vue plugin so composables can inject it.
app.use(createMikserPlugin({ client }))

// 3. Router with only a 404 fallback. mikser will inject the rest.
const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/:catchAll(.*)', name: 'not-found', component: NotFound },
    ],
})
app.use(router)

// 4. Hand the router to mikser. Returns { dispose, seeded }.
//    `seeded` resolves after the first SSE batch — await it so the user
//    lands on a real route, not the 404 fallback.
const { seeded } = useMikserRoutes(router, { mapRoute })
await seeded

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

const app = createApp(App)

const client = createClient({ url: import.meta.env.VITE_MIKSER_URL })
app.use(createMikserPlugin({ client }))
app.use(router)

// Augment the existing router. Their hand-written routes still work;
// mikser's routes slot in alongside. `dispose` removes them again if
// you ever need to (e.g. HMR cleanup).
const { seeded } = useMikserRoutes(router, { mapRoute })
await seeded

app.mount('#app')
```

**Say (both variants):** "Three pieces. `createClient` is the underlying entities client (one per app). `createMikserPlugin({ client })` registers it with Vue's DI so composables find it. `useMikserRoutes(router, { mapRoute })` adds a route for every document `mapRoute` returns. The router is yours — mikser augments it without owning it. `await seeded` blocks mount until the catalog has loaded, so first paint is real content, not a flash of 404."

If the user has an existing router but you don't know its filename, ask before importing — don't guess `./router.js`.

### 9. `App.vue` (only if it doesn't exist)

If the user has no `App.vue`, write a minimal one:

```vue
<template>
    <RouterView />
</template>
```

**Say:** "Minimal root — just renders whatever route matched. Build your shell (nav, footer, layout) around `<RouterView />` when you're ready."

If `App.vue` already exists with content, **don't touch it** — say to the user: "Your `App.vue` already exists. Make sure it includes `<RouterView />` somewhere — that's where mikser-driven pages render."

## Skip list

Do not touch:

- `package.json` scripts (their existing `dev`/`build` work)
- Tailwind, PostCSS, ESLint configs
- Any existing component or store
- TypeScript configs — the SDKs ship `.d.ts` and work in JS or TS projects
