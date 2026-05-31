# Vue 3 + Hybrid SSG — mikser-io bootstrap recipe

This reference is read by the `add-mikser` skill when the user picks the **Hybrid SSG** architecture and the framework is Vue. Two builds from one content source:

- **Public site** — statically rendered (one HTML file per route) via [vite-ssg](https://github.com/antfu-collective/vite-ssg). CDN-friendly, SEO-correct, fully crawlable. No SSE at runtime.
- **Editor app** — pure SPA mounted at `/admin/`. Live SSE updates, identical view components, useful for content authors who need to preview their edits.

The two stay in sync because both consume the same `src/route-mapping.js` — one source of truth for "what view does this layout map to."

This is the canonical agency project shape for marketing sites, blogs, documentation, and anything else with non-developer editors plus SEO requirements.

> **Branch A warning:** This recipe substantially restructures the frontend (two Vite configs, two HTML entry points, two `main.js`, separate public/editor source trees). If the user has an existing Vue app, this is a big migration — confirm with them that Hybrid SSG is what they actually want before applying these edits. Pure SPA covers a lot of ground without this complexity; recommend they start there if they're unsure.

## Peer deps to install

```bash
npm install mikser-io-sdk-vue mikser-io-sdk-api markdown-it vue-router
npm install --save-dev vite-ssg
```

Tell the user: "`vite-ssg` is the static-rendering layer on top of Vite. It crawls the route manifest at build time and emits one HTML file per route. The runtime then rehydrates Vue if/when the user does something interactive. Same Vue SDK and router are used by both the public build and the editor."

## Files to write or edit

The order matters: package.json scripts first, then the shared route-mapping, then the public side, then the editor side, then the build script that ties them together.

### 1. `.env`

At the project root:

```
VITE_MIKSER_URL=http://localhost:3001
MIKSER_URL=http://localhost:3001
```

**Say:** "Two variables. `VITE_MIKSER_URL` is for runtime (editor); `MIKSER_URL` is for the build-time route-generation script (no `VITE_` prefix because it runs in Node, not the browser bundle)."

### 2. `.gitignore`

Append:

```
dist/
src/generated/routes.json
```

**Say:** "`dist/public/` and `dist/editor/` are build artifacts. `src/generated/routes.json` is regenerated on every public build from the live mikser catalog — it's a build product, not source."

### 3. `package.json` scripts + deps

Replace the scripts block:

```json
{
    "scripts": {
        "generate:routes": "node build/generate-routes.mjs",
        "dev:public": "vite",
        "dev:editor": "vite --config vite.config.editor.js",
        "build:public": "npm run generate:routes && vite-ssg build",
        "build:editor": "vite build --config vite.config.editor.js",
        "build": "npm run build:public && npm run build:editor",
        "preview": "vite preview --outDir dist/public"
    }
}
```

**Say:** "Six scripts. The two `dev:*` are independent — run whichever you're working on. Build does both. `generate:routes` is the build-time step that asks mikser \"what routes exist?\" and writes the manifest vite-ssg needs."

### 4. `vite.config.js` — public build

Replace any existing `vite.config.js`:

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Public build — vite-ssg pre-renders every route at build time.
// Reads the route list from build/generate-routes.mjs's output, so
// the build is deterministic and works offline once routes.json
// exists.
export default defineConfig({
    plugins: [vue()],
    build: {
        outDir: 'dist/public',
        emptyOutDir: true,
    },
    server: { port: 5173 },
    ssgOptions: {
        // vite-ssg crawls anchor tags from the entry page by default.
        // For a mikser-driven site we want explicit control: enumerate
        // routes from the generated manifest, so build output exactly
        // mirrors the published catalog.
        includedRoutes: async () => {
            const { default: routes } = await import('./src/generated/routes.json', { with: { type: 'json' } })
            return routes.map(r => r.path)
        },
        formatting: 'minify',
    },
})
```

**Say:** "Public Vite config with vite-ssg's `ssgOptions.includedRoutes` pointed at the generated route manifest. `formatting: 'minify'` keeps the prerendered HTML compact. Output goes to `dist/public/` — that's what you deploy to your CDN."

### 5. `vite.config.editor.js` — editor build

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

// Editor build — pure SPA, no SSG. Different entry HTML (admin.html),
// different main.js, different output dir. Shares view components
// with the public build via src/views/.
//
// build.target = 'es2022' lets src/editor/main.js's top-level
// `await seeded` survive `vite build`. Default target is es2020
// without TLA, so esbuild fails the prod build otherwise.
export default defineConfig({
    plugins: [vue()],
    build: {
        target: 'es2022',
        outDir: 'dist/editor',
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(__dirname, 'admin.html'),
        },
    },
    server: { port: 5174 },
})
```

**Say:** "Editor Vite config — port 5174 so it doesn't clash with the public dev server on 5173. `target: 'es2022'` for the top-level `await seeded`. The editor uses its own entry (admin.html) so the public build doesn't pull in editor-only code."

### 6. `index.html` — public entry

Replace any existing index.html:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My site</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="/src/public/main.js"></script>
</body>
</html>
```

**Say:** "Minimal public entry. No loading shell — vite-ssg prerenders the actual page content into the HTML at build time, so the user sees real content before any JS runs."

### 7. `admin.html` — editor entry

New file at project root:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Editor</title>
    <style>
        body { margin: 0 }
        #app .loading {
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; font: 14px system-ui, sans-serif; color: #666;
        }
    </style>
</head>
<body>
    <div id="app"><div class="loading">Loading…</div></div>
    <script type="module" src="/src/editor/main.js"></script>
</body>
</html>
```

**Say:** "Editor entry with a loading shell. Vue mounts and the App component replaces this with a real shell — see editor/App.vue below, which uses `useMikserStatus` to surface backend errors."

### 8. `src/route-mapping.js` — the load-bearing shared file

The most important file in the recipe. Three consumers read this — keep it minimal and don't tie it to either build's specifics.

```js
// Shared between the public build (build/generate-routes.mjs +
// src/public/router.js) and the editor build (src/editor/main.js).
// One source of truth for "what view does this layout map to."
//
// Add a new layout here when you add a new schema in
// mikser-content/schemas/ — both builds pick it up on next reload.

export const views = {
    article: () => import('./views/ArticleView.vue'),
    page:    () => import('./views/PageView.vue'),
    // Add more: product, landing, changelog, etc.
}

export function mapRoute(document) {
    return {
        path:      document.meta.route,
        name:      document.id,
        component: views[document.meta.layout] ?? views.page,
        props:     route => ({ entityId: document.id, params: route.params }),
        meta: {
            layout: document.meta?.layout,
            title:  document.meta?.title,
        },
    }
}
```

**Say:** "The load-bearing file. The build script, the public router, and the editor router all import `mapRoute` from here. Add a new layout (say `product`) by adding one entry to `views` + one schema file in `mikser-content/schemas/product.js`. Both builds reflect it on the next build."

### 9. `build/generate-routes.mjs` — build-time route enumeration

New file in a new `build/` directory:

```js
// Build-time script — fetches the route manifest from mikser and
// serializes it to src/generated/routes.json. The vite-ssg config
// reads this file to know which routes to pre-render. The public
// runtime router (src/public/router.js) reads it to install routes
// without calling client.list() at boot.
//
// Run before `vite build` (the build:public script does this).
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from 'mikser-io-sdk-api'
import { generateMikserRoutes } from 'mikser-io-sdk-vue'

const here = dirname(fileURLToPath(import.meta.url))

const docs = createClient({ baseUrl: process.env.MIKSER_URL ?? 'http://localhost:3001' })
    .entities('public')

// Use the SAME mapRoute as the runtime router — one source of truth.
// We strip the component function before serializing (functions don't
// JSON-encode); the runtime rehydrates by looking up the layout in
// the views table.
const { mapRoute } = await import(resolve(here, '../src/route-mapping.js'))

const routes = await generateMikserRoutes({ client: docs, mapRoute })

const serializable = routes.map(r => ({
    path:   r.path,
    name:   r.name,
    layout: r.meta?.layout,
    title:  r.meta?.title,
    props:  r.props ? r.props({ params: {} }) : undefined,
}))

const outDir  = resolve(here, '../src/generated')
const outFile = resolve(outDir, 'routes.json')
await mkdir(outDir, { recursive: true })
await writeFile(outFile, JSON.stringify(serializable, null, 2))

console.log(`✓ wrote ${serializable.length} routes → ${outFile}`)
```

**Say:** "Runs in Node before Vite. Asks mikser \"what routes exist?\" via `generateMikserRoutes` (auto-paginated under the hood, so no silent truncation on large catalogs). Writes a JSON manifest. Vite-ssg reads that manifest to know what HTML files to emit. Requires `MIKSER_URL` to point at a running mikser; build fails fast if it can't connect."

### 10. `src/public/main.js` — public entry

```js
// Public entry — vite-ssg renders this. The router reads its routes
// from the build-time manifest at src/generated/routes.json. No
// client.list() at boot, no SSE.
//
// We still install the mikser plugin so individual components can
// do urlFor() / image-render calls during render, but they don't
// subscribe — that's the editor's job.
import { ViteSSG } from 'vite-ssg'
import { createClient } from 'mikser-io-sdk-api'
import { createMikserPlugin } from 'mikser-io-sdk-vue'
import { createRouter } from './router.js'
import App from './App.vue'

const documents = createClient({ baseUrl: import.meta.env.VITE_MIKSER_URL })
    .entities('public')

export const createApp = ViteSSG(
    App,
    { routes: createRouter() },
    ({ app }) => {
        app.use(createMikserPlugin({ client: documents }))
    },
)
```

**Say:** "ViteSSG wraps your app. At build time it iterates the routes and emits one HTML file per route, with the rendered Vue component baked in. At runtime, the bundled JS rehydrates if a user clicks around. The plugin is installed for any composable calls inside view components."

### 11. `src/public/router.js` — public router

```js
// Public router — reads the build-time manifest, rehydrates the
// component for each route by looking up the layout in the shared
// views table.
import routes from '../generated/routes.json'
import { views } from '../route-mapping.js'

export function createRouter() {
    return [
        // Hand-coded pages. Add more here as needed (e.g. a marketing
        // home that isn't a mikser document, or a search page).
        { path: '/',         component: () => import('../views/Home.vue') },
        { path: '/articles', component: () => import('../views/ArticleIndex.vue') },

        // mikser-driven routes — one per document.
        ...routes.map(r => ({
            path:      r.path,
            name:      r.name,
            component: views[r.layout] ?? views.page,
            props:     () => ({ entityId: r.props?.entityId ?? r.name }),
            meta:      { layout: r.layout, title: r.title },
        })),

        { path: '/:pathMatch(.*)*', component: () => import('../views/NotFound.vue') },
    ]
}
```

**Say:** "The public router blends hand-coded routes (top) with mikser-driven routes (middle) and a catch-all 404 (bottom). Add a marketing landing page or pricing table by inserting it before the mikser-driven block."

### 12. `src/public/App.vue` — minimal public shell

```vue
<template>
    <router-view />
</template>
```

**Say:** "Public shell. Build your nav, footer, and layout around `<router-view />`. vite-ssg can render even fairly heavy shells at build time, so you don't have to defer anything."

### 13. `src/editor/main.js` — editor entry

```js
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createClient } from 'mikser-io-sdk-api'
import { createMikserPlugin, useMikserRoutes } from 'mikser-io-sdk-vue'
import { mapRoute } from '../route-mapping.js'
import App from './App.vue'

const mikserUrl = import.meta.env.VITE_MIKSER_URL
const documents = createClient({ baseUrl: mikserUrl }).entities('public')

// The editor app owns its own router. Hand-coded admin routes are
// declared here; mikser slots catalog routes in alongside via
// useMikserRoutes below. The history base is /admin/ so navigation
// stays under /admin/* and doesn't collide with the public site.
const router = createRouter({
    history: createWebHistory('/admin/'),
    routes: [
        { path: '/admin/',         name: 'editor-home',     component: () => import('./EditorHome.vue') },
        { path: '/admin/articles', name: 'editor-articles', component: () => import('../views/ArticleIndex.vue') },
        { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/NotFound.vue') },
    ],
})

// Wire mikser into the same router. Pass `client` explicitly — we're at
// module scope, where Vue's inject() doesn't have an active setup
// context. (Inside components, useMikserStatus etc. inject normally.)
const { seeded } = useMikserRoutes(router, {
    client: documents,
    mapRoute,
})

seeded.then(() => router.replace(router.currentRoute.value.fullPath))

const app = createApp(App)
app.use(createMikserPlugin({ client: documents }))
app.use(router)
app.provide('mikserUrl', mikserUrl)
app.mount('#app')
```

**Say:** "Editor entry. Pure SPA pattern (same as the Pure SPA recipe), just with `/admin/` as the router base so the editor can be deployed alongside the public site without colliding. Hand-coded editor pages (Home, ArticleIndex) live in `editor/`; shared view components (Article, Page) come from `../views/`."

### 14. `src/editor/App.vue` — editor shell with connection guard

```vue
<script setup>
import { inject } from 'vue'
import { useMikserStatus } from 'mikser-io-sdk-vue'

// Same connection guard as Pure SPA — if mikser is down, the editor
// shows a clear error instead of hanging.
const status = useMikserStatus()
const url = inject('mikserUrl')
</script>

<template>
    <header class="editor-bar">
        <strong>Editor preview</strong> · <em>changes appear live</em>
    </header>

    <router-view v-if="status === 'ready'" />

    <main v-else-if="status === 'connecting'" class="mikser-state mikser-connecting">
        <p>Connecting to mikser at <code>{{ url }}</code>…</p>
    </main>

    <main v-else class="mikser-state mikser-error">
        <h2>Can't reach the mikser backend</h2>
        <p>Tried <code>{{ url }}</code> for 5 seconds. Start it in another terminal:</p>
        <pre>cd mikser-content
npm run dev</pre>
    </main>
</template>

<style scoped>
.editor-bar { background: #f5f5f5; padding: 0.75rem 1rem; border-bottom: 1px solid #ddd; }
.mikser-state { max-width: 60ch; margin: 4rem auto; padding: 0 1rem; font: 14px/1.5 system-ui, sans-serif; }
.mikser-connecting { color: #666; }
.mikser-error h2 { color: #b94a48; margin-top: 0; }
.mikser-error pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; }
</style>
```

**Say:** "Editor shell with the connection guard from the Pure SPA recipe. The header bar makes it obvious to the editor user that they're in the live editor (not the public site)."

### 15. `src/editor/EditorHome.vue` — recently-edited overview

```vue
<script setup>
import { useDocuments } from 'mikser-io-sdk-vue'

// Recently-edited documents — useful surface for an editor.
const { documents: recent } = useDocuments({
    filter: { type: 'document' },
    sort:   { stamp: -1 },
    fields: ['id', 'meta.title', 'meta.layout', 'meta.route', 'stamp'],
    limit:  15,
})
</script>

<template>
    <main class="editor-home">
        <h1>Recently edited</h1>
        <ul>
            <li v-for="d in recent" :key="d.id">
                <router-link :to="d.meta.route">
                    <strong>{{ d.meta?.title }}</strong>
                    <span class="layout-badge">{{ d.meta?.layout }}</span>
                </router-link>
            </li>
        </ul>
    </main>
</template>
```

**Say:** "Editor landing page — lists the 15 most recently changed documents. SSE pushes updates here too, so when someone saves a file the list reorders live."

### 16. `src/views/` — shared view components

The same `PageView.vue`, `ArticleView.vue`, `NotFound.vue` from the Pure SPA recipe go here (plus a `Home.vue` and `ArticleIndex.vue` for the public site's hand-coded pages). They're used by both the public build and the editor — that's the whole point of the hybrid pattern.

`PageView.vue`:

```vue
<script setup>
import { useDocument } from 'mikser-io-sdk-vue'
import { renderMarkdown } from '../markdown.js'

const props = defineProps({ entityId: String })
const { document } = useDocument(() => props.entityId)
</script>

<template>
    <main v-if="document" class="page">
        <h1>{{ document.meta?.title }}</h1>
        <div v-html="renderMarkdown(document.content)" />
    </main>
</template>
```

`ArticleView.vue`, `NotFound.vue`, `Home.vue`, `ArticleIndex.vue` follow the same shape. Use the SPA recipe's view components as the starting point and adapt the prop interface — they take an `entityId` here, not the document inline, because the hybrid pattern's route props pass the id and the view fetches the live document.

`src/markdown.js` is the same shared helper from the SPA recipe:

```js
import MarkdownIt from 'markdown-it'
const md = new MarkdownIt({ html: true, linkify: true, breaks: false })
export function renderMarkdown(source) { return md.render(source ?? '') }
```

**Say:** "The views fetch via `useDocument(() => entityId)` rather than receiving the document inline. This works for both builds: the public build's vite-ssg call awaits the document at render time; the editor's live SSE keeps it updated. Same component, different render context."

## Deployment

```
dist/public/    → deploy to your CDN as the public site (Cloudflare Pages, Netlify, S3+CloudFront, etc.)
dist/editor/    → deploy to a separate path (or behind auth) — typically /admin/ on the same domain or admin.your-site.com
```

The public site has zero runtime dependency on mikser — it's a folder of HTML, CSS, JS. The editor needs to reach `VITE_MIKSER_URL` from the browser; in production that's usually a mikser server behind a TLS terminator (not localhost:3001).

## Run it

Two terminals:

```bash
# Terminal 1 — mikser backend
cd mikser-content && npm run dev   # → mikser on :3001

# Terminal 2 — public OR editor dev server (one at a time)
npm run dev:public                  # → public preview on :5173
# or
npm run dev:editor                  # → editor on :5174 (mounted at /admin/)
```

For a production build of both:

```bash
npm run build
ls dist/public dist/editor
```

## Skip list

Do not touch:

- `package.json` non-script fields (deps are managed above)
- TypeScript / ESLint / Prettier / Tailwind / PostCSS configs
- Any existing component the user has in `src/components/`
- Existing routes in the user's router (Branch A) — merge yours into the public router; leave their non-mikser routes alone
