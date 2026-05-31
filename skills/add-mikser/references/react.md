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
// Map each document's `meta.layout` to the view component that renders it.
// Add a new layout here when you add a new schema in mikser-content/schemas/.
import PageView from './views/PageView.jsx'
import ArticleView from './views/ArticleView.jsx'
import NotFound from './views/NotFound.jsx'

const viewForLayout = {
    page: PageView,
    article: ArticleView,
}

// useMikserRoutes calls this for every document. Return a react-router
// route object — or null/undefined to skip the document.
export function mapRoute(doc) {
    const Component = viewForLayout[doc.meta?.layout] ?? NotFound
    return {
        path: doc.meta.route,
        // Pass the live document into the view so it doesn't have to refetch.
        element: <Component doc={doc} />,
    }
}
```

**Say:** "This is the dispatch point. `meta.layout: 'article'` in a markdown file lands here and picks `ArticleView`. New layout = one entry here + one schema file."

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
import { renderMarkdown } from '../markdown.js'

export default function PageView({ doc }) {
    // useMemo re-runs when doc.content changes. SSE → mikser pushes a new
    // doc → React re-renders this view → the memo recomputes the HTML.
    const html = useMemo(() => renderMarkdown(doc.content), [doc.content])

    return (
        <article className="page" style={{ maxWidth: '70ch', margin: '2rem auto', padding: '0 1rem' }}>
            <h1>{doc.meta.title}</h1>
            <div dangerouslySetInnerHTML={{ __html: html }} />
        </article>
    )
}
```

**Say:** "Generic page view — your fallback. The `doc` prop is the live document; edits push here automatically over SSE and `useMemo` re-converts the body."

### 7. `src/views/ArticleView.jsx`

```jsx
import { useMemo } from 'react'
import { renderMarkdown } from '../markdown.js'

export default function ArticleView({ doc }) {
    const html = useMemo(() => renderMarkdown(doc.content), [doc.content])

    return (
        <article className="article" style={{ maxWidth: '70ch', margin: '2rem auto', padding: '0 1rem' }}>
            <header>
                <h1>{doc.meta.title}</h1>
                <p style={{ color: '#666', fontSize: '0.9em' }}>
                    By {doc.meta.author} ·{' '}
                    <time dateTime={doc.meta.date}>
                        {new Date(doc.meta.date).toLocaleDateString()}
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

There are two variants. Pick based on the answer to question 2 in the workflow.

In both variants, preserve the scaffolder's `import './index.css'` — the Vite React template ships a small stylesheet that's still useful even after you replace `App.jsx`.

#### Variant A — user has no existing router

```jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { createClient } from 'mikser-io-sdk-api'
import { MikserProvider } from 'mikser-io-sdk-react'
import './index.css'
import App from './App.jsx'

// `baseUrl` is required (the SDK throws on import otherwise).
// `.entities('public')` returns the per-endpoint entities client the
// React hooks actually use — list, listAll, live, urlFor, render. The
// endpoint name matches the key under `api.endpoints` in
// mikser-content/mikser.config.js (`public`).
const client = createClient({ baseUrl: import.meta.env.VITE_MIKSER_URL }).entities('public')

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MikserProvider client={client}>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </MikserProvider>
    </React.StrictMode>,
)
```

#### Variant B — user has an existing router

Leave their router as-is. Wrap their entry tree in `<MikserProvider>` only:

```jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from 'mikser-io-sdk-api'
import { MikserProvider } from 'mikser-io-sdk-react'
import './index.css'
import App from './App.jsx'  // their existing tree, with its router inside

const client = createClient({ baseUrl: import.meta.env.VITE_MIKSER_URL }).entities('public')

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MikserProvider client={client}>
            <App />
        </MikserProvider>
    </React.StrictMode>,
)
```

**Say (both variants):** "Two-call setup: `createClient({ baseUrl })` returns a root client; `.entities('public')` returns the entities client the React hooks actually use (list / live / urlFor / render). `MikserProvider` is the React context that holds it. Anything below it can call `useMikserRoutes`, `useDocument`, `useSimilar`, etc. It does not own the router — your router stays yours."

### 10. `src/App.jsx`

The integration point — where `useMikserRoutes` lives. For Branch B (blank-project scaffold), **overwrite the scaffolder's stock `App.jsx`** with the Variant A code below. The Vite React template's default `App.jsx` renders the Vite demo page (logos + counter) and won't display any mikser route. Leaving it in place would mean the wiring "works" but the user sees the Vite demo, with no error to debug.

You can also delete `src/App.css` and `src/assets/` if you want to scrub the demo — the styles target the demo page only.

#### Variant A (Branch B scaffold, or any case where you also scaffolded the router in main.jsx):

```jsx
import { useRoutes } from 'react-router-dom'
import { useMikserRoutes } from 'mikser-io-sdk-react'
import { mapRoute } from './route-mapping.jsx'
import NotFound from './views/NotFound.jsx'

export default function App() {
    // The hook builds a live route table: your static routes first,
    // then mikser's content routes (one per matching document), then
    // the catch-all 404. Pass everything in; you get one array back.
    // Re-renders on every SSE update — add/remove a markdown file and
    // the routes follow.
    const routes = useMikserRoutes({
        mapRoute,
        staticRoutes: [
            // { path: '/login', element: <Login /> },
        ],
        notFoundElement: <NotFound />,
    })

    return useRoutes(routes)
}
```

#### If the user has an existing App.jsx:

**Don't overwrite it.** Tell them: "Your `App.jsx` already exists. To wire mikser into it, replace your `useRoutes(routes)` call with:

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

The hook merges your static routes with the live content routes and re-renders on every SSE update."

**Say (Variant A):** "`useMikserRoutes` builds the full route table for you — static routes first (yours), then content routes (mikser's), then the 404. To add static routes like `/login`, slot them into `staticRoutes`."

## Skip list

Do not touch:

- `package.json` scripts
- ESLint / Prettier / Tailwind / PostCSS configs
- Any existing component, hook, or context
- TypeScript configs — the SDKs ship types
