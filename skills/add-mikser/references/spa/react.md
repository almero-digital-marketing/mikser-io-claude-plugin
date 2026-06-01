# React 18+/19 + Vite — mikser-io bootstrap recipe

This reference is read by the `add-mikser` skill when `package.json` shows React. It assumes React 18 or 19 + Vite. Not a tutorial — the exact edits, files, and one-line explanations to share as you go.

## Peer deps to install

Always:

```bash
npm install mikser-io-sdk-react mikser-io-sdk-api markdown-it
```

If the user does **not** already have `react-router-dom`:

```bash
npm install react-router-dom
```

Tell the user: "Four deps (or three if you already had react-router-dom). `sdk-api` is the entities client you create once and hand to the provider; `sdk-react` wraps it as React hooks; `react-router-dom` is standard; `markdown-it` runs in the browser to convert each document's markdown body to HTML at render time. The mikser server delivers raw markdown over SSE — the conversion is intentionally client-side so the live-update loop stays simple."

## Files to write or edit

In order. Each step has a "say" line — the one-sentence explanation to give the user after the file is created/edited.

### 1. `.env`

Create at the **project root** (next to `vite.config.js`, not under `src/`):

```
VITE_MIKSER_URL=http://localhost:3001
```

**Say:** "`VITE_MIKSER_URL` is read by `src/main.jsx`. Change it for staging/prod; the SDK does no other config."

### 2. `vite.config.js` — bump `build.target` to `es2022`

The router helper uses top-level `await seeded` to delay the first render. Top-level await needs `es2022`.

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    build: {
        target: 'es2022',
    },
})
```

If a `build` block already exists, just add `target: 'es2022'`.

**Say:** "`build.target: 'es2022'` lets `await seeded` in `src/main.jsx` survive `vite build`. Dev server works without it; prod bundle doesn't."

### 3. `index.html` — add a loading shell

Inside `<div id="root">`, replace whatever's there:

```html
<div id="root">
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

**Say:** "Shown for the ~100ms it takes the SSE seed to land. React mounts over it. Style it freely — this is just the empty-state."

### 4. `src/route-mapping.jsx`

```jsx
// Map each document's `meta.component` to the React view that renders it.
// Add a new entry here when you add a new schema in mikser-content/schemas/.
//
// meta.component (this file's dispatch key) is separate from
// meta.layout (mikser's SSG render template). Keeping them separate
// avoids "layout 'page' not found" warnings from mikser when a
// SPA-only component name has no matching template.
import PageView from './views/PageView.jsx'
import ArticleView from './views/ArticleView.jsx'
import NotFound from './views/NotFound.jsx'

const viewForComponent = {
    page: PageView,
    article: ArticleView,
}

// Resolve URL path. Prefer meta.route; fall back to destination
// (mikser computes this from source path + cleanUrls). Returns null
// to skip documents with neither.
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
// Return a react-router route object — or null/undefined to skip.
// The view receives only entityId; it fetches the full document via
// useDocument. Keeps the sitemap payload lean.
export function mapRoute(doc) {
    const path = routeFor(doc)
    if (!path) return null
    const Component = viewForComponent[doc.meta?.component] ?? NotFound
    return {
        path,
        element: <Component entityId={doc.id} />,
    }
}
```

**Say:** "Two changes from a naive map. First, dispatch is on `meta.component`, not `meta.layout` — layout is reserved for mikser's SSG render pipeline. Second, the route path falls back to `doc.destination` when `meta.route` isn't explicit. Each view gets the entityId and fetches its own live document."

### 5. `src/markdown.js`

Shared markdown helper. One markdown-it instance, used by every view (and by anything the user adds later).

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

**Say:** "One instance of markdown-it shared across every view. Configure it here (footnotes, emoji, syntax highlighting via `highlight`, etc.) and every view picks the change up. `doc.content` arrives as raw markdown over SSE; this is the only place that turns it into HTML."

### 6. `src/views/PageView.jsx`

```jsx
import { useMemo } from 'react'
import { useDocument } from 'mikser-io-sdk-react'
import { renderMarkdown } from '../markdown.js'

export default function PageView({ entityId }) {
    // useDocument fetches the full document from the `public` endpoint
    // and stays subscribed: edit the markdown file and the body
    // re-renders without a refresh. The sitemap router knows only
    // id+meta+destination; this view does the full fetch.
    const { document } = useDocument(entityId)
    const html = useMemo(
        () => (document ? renderMarkdown(document.content) : ''),
        [document?.content],
    )

    if (!document) return null
    return (
        <article className="page" style={{ maxWidth: '70ch', margin: '2rem auto', padding: '0 1rem' }}>
            <h1>{document.meta?.title}</h1>
            <div dangerouslySetInnerHTML={{ __html: html }} />
        </article>
    )
}
```

**Say:** "Generic page view — your fallback. `useDocument(entityId)` subscribes to the document via SSE; edits push here automatically and `useMemo` re-converts the body. The router only needs the id from the sitemap snapshot; this view does the live fetch."

### 7. `src/views/ArticleView.jsx`

```jsx
import { useMemo } from 'react'
import { useDocument } from 'mikser-io-sdk-react'
import { renderMarkdown } from '../markdown.js'

export default function ArticleView({ entityId }) {
    const { document } = useDocument(entityId)
    const html = useMemo(
        () => (document ? renderMarkdown(document.content) : ''),
        [document?.content],
    )

    if (!document) return null
    return (
        <article className="article" style={{ maxWidth: '70ch', margin: '2rem auto', padding: '0 1rem' }}>
            <header>
                <h1>{document.meta?.title}</h1>
                <p style={{ color: '#666', fontSize: '0.9em' }}>
                    By {document.meta?.author} ·{' '}
                    <time dateTime={document.meta?.date}>
                        {new Date(document.meta?.date).toLocaleDateString()}
                    </time>
                </p>
            </header>
            <div dangerouslySetInnerHTML={{ __html: html }} />
        </article>
    )
}
```

**Say:** "Layout-specific view. The article schema requires `author` and `date`, so this view can rely on them."

### 8. `src/views/NotFound.jsx`

```jsx
export default function NotFound() {
    return (
        <section style={{ textAlign: 'center', padding: '4rem 1rem', color: '#888' }}>
            <h1>404</h1>
            <p>This document doesn't exist (yet).</p>
        </section>
    )
}
```

**Say:** "Fallback for unknown routes. Also returned from `mapRoute` when a document's `layout` isn't in the dispatch table."

### 9. `src/main.jsx`

The pattern: render React immediately, mount `MikserProvider` so hooks have a client, and pass the mikser URL down so the connection guard in App.jsx can show a real error if the backend is unreachable. **There is no `await seeded` here** — React renders right away and App.jsx tracks connection state. A forever-loading page with no error is a brutal failure mode; this prevents it.

Preserve the scaffolder's `import './index.css'` — the Vite React template ships a small stylesheet that's still useful even after you replace `App.jsx`.

Two clients now: `documents` (public endpoint, used by `useDocument` inside views) and `sitemap` (narrow endpoint, with the static snapshot for fast first paint, passed to `useMikserRoutes` in App).

#### Variant A — user has no existing router

```jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { createClient } from 'mikser-io-sdk-api'
import { MikserProvider } from 'mikser-io-sdk-react'
import './index.css'
import App from './App.jsx'

const mikserUrl = import.meta.env.VITE_MIKSER_URL
const root = createClient({ baseUrl: mikserUrl })
const documents = root.entities('public')
const sitemap = root.entities('sitemap', {
    initialUrl: '/api/sitemap/entities.json',
})

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MikserProvider client={documents}>
            <BrowserRouter>
                <App mikserUrl={mikserUrl} sitemap={sitemap} />
            </BrowserRouter>
        </MikserProvider>
    </React.StrictMode>,
)
```

#### Variant B — user has an existing router

```jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from 'mikser-io-sdk-api'
import { MikserProvider } from 'mikser-io-sdk-react'
import './index.css'
import App from './App.jsx'  // their existing tree, with its router inside

const mikserUrl = import.meta.env.VITE_MIKSER_URL
const root = createClient({ baseUrl: mikserUrl })
const documents = root.entities('public')
const sitemap = root.entities('sitemap', { initialUrl: '/api/sitemap/entities.json' })

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MikserProvider client={documents}>
            <App mikserUrl={mikserUrl} sitemap={sitemap} />
        </MikserProvider>
    </React.StrictMode>,
)
```

**Say (both variants):** "Two clients now: `documents` (public endpoint, full content fetch — used by `useDocument` inside views) and `sitemap` (narrow endpoint, with the static snapshot at `/data/sitemap.json` for zero-roundtrip first paint). `MikserProvider` registers documents for hooks beneath. The sitemap client is passed as a prop into App, where `useMikserRoutes` consumes it. The sitemap's `meta.component` filter is the load-bearing convention: only documents with a component end up as routes."

### 10. `src/App.jsx`

The integration point — where `useMikserRoutes` lives. For Branch B (blank-project scaffold), **overwrite the scaffolder's stock `App.jsx`** with the Variant A code below. The Vite React template's default `App.jsx` renders the Vite demo page (logos + counter) and won't display any mikser route. Leaving it in place would mean the wiring "works" but the user sees the Vite demo, with no error to debug.

You can also delete `src/App.css` and `src/assets/` if you want to scrub the demo — the styles target the demo page only.

App.jsx does two jobs: render the matched route via `useRoutes`, and surface a connection panel while the mikser backend is reachable but slow, or an error panel after the deadline expires.

#### Variant A (Branch B scaffold, or any case where you also scaffolded the router in main.jsx):

```jsx
import { useRoutes } from 'react-router-dom'
import { useMikserRoutes, useMikserStatus } from 'mikser-io-sdk-react'
import { mapRoute } from './route-mapping.jsx'
import NotFound from './views/NotFound.jsx'

export default function App({ mikserUrl, sitemap }) {
    // useMikserStatus probes the backend once via client.list({ limit: 1 })
    // and returns 'connecting' | 'ready' | 'unreachable'. Settles to one
    // of the terminal states within ~1s on success or 5s on failure.
    // Override timeoutMs if 5s isn't right for your network.
    const status = useMikserStatus()

    // useMikserRoutes subscribes against the sitemap client (passed in
    // from main.jsx). With initialUrl set, the route table is populated
    // from the static snapshot before any SSE event arrives — so the
    // first matched view renders immediately on first paint.
    const routes = useMikserRoutes({
        client: sitemap,
        mapRoute,
        staticRoutes: [
            // { path: '/login', element: <Login /> },
        ],
        notFoundElement: <NotFound />,
    })
    const element = useRoutes(routes)

    if (status === 'ready') return element
    if (status === 'connecting') return <ConnectingPanel url={mikserUrl} />
    return <ErrorPanel url={mikserUrl} />
}

function ConnectingPanel({ url }) {
    return (
        <main style={panelStyle}>
            <p>Connecting to mikser at <code>{url}</code>…</p>
        </main>
    )
}

function ErrorPanel({ url }) {
    return (
        <main style={{ ...panelStyle, color: '#222' }}>
            <h2 style={{ color: '#b94a48', marginTop: 0 }}>Can't reach the mikser backend</h2>
            <p>Tried <code>{url}</code> for 5 seconds. Start it in another terminal:</p>
            <pre style={preStyle}>{`cd mikser-content
npm run dev`}</pre>
            <p>Then reload this page.</p>
        </main>
    )
}

const panelStyle = {
    maxWidth: '60ch',
    margin: '4rem auto',
    padding: '0 1rem',
    font: '14px/1.5 system-ui, -apple-system, sans-serif',
    color: '#666',
}
const preStyle = {
    background: '#f5f5f5',
    padding: '1rem',
    borderRadius: '4px',
    overflowX: 'auto',
}
```

#### If the user has an existing App.jsx:

**Don't overwrite it.** Tell them: "Your `App.jsx` already exists. Two changes:

1. Accept `mikserUrl` as a prop (passed from main.jsx) and wrap your existing `useRoutes` in the same connection-status guard so the page never hangs silently when mikser is down.
2. Replace your `useRoutes(routes)` call with the mikser-augmented version:

```jsx
import { useMikserRoutes } from 'mikser-io-sdk-react'
import { mapRoute } from './route-mapping.jsx'
import NotFound from './views/NotFound.jsx'

const routes = useMikserRoutes({
    mapRoute,
    staticRoutes: yourStaticRoutes,   // your existing array
    notFoundElement: <NotFound />,
})
return useRoutes(routes)
```

If you have non-mikser routes you want navigable even when mikser is unreachable, skip the `status === 'connecting'` gate and only show the error panel when `status === 'unreachable'`."

**Say:** "App.jsx does the dispatch (`useMikserRoutes` + `useRoutes`) and hosts the connection guard. The fetch probe + 5s deadline ensures a missing or unreachable backend produces a clear error message instead of a forever-loading screen. The error panel tells the user exactly how to fix it — start the backend, reload."

## Skip list

Do not touch:

- `package.json` scripts
- ESLint / Prettier / Tailwind / PostCSS configs
- Any existing component, hook, or context
- TypeScript configs — the SDKs ship types
