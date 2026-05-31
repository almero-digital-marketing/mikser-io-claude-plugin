# React 18+/19 + Vite — mikser-io bootstrap recipe

This reference is read by the `add-mikser` skill when `package.json` shows React. It assumes React 18 or 19 + Vite. Not a tutorial — the exact edits, files, and one-line explanations to share as you go.

## Peer deps to install

Always:

```bash
npm install mikser-io-sdk-react mikser-io-sdk-api
```

If the user does **not** already have `react-router-dom`:

```bash
npm install react-router-dom
```

Tell the user: "These three (or two) are the only new deps. The React SDK is the framework wrapper; `sdk-api` is the underlying client; `react-router-dom` is the standard router."

## Files to write or edit

In order. Each step has a "say" line — the one-sentence explanation to give the user after the file is created/edited.

### 1. `.env`

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

### 5. `src/views/PageView.jsx`

```jsx
export default function PageView({ doc }) {
    return (
        <article className="page" style={{ maxWidth: '70ch', margin: '2rem auto', padding: '0 1rem' }}>
            <h1>{doc.meta.title}</h1>
            {/* doc.content is the rendered HTML from render-markdown */}
            <div dangerouslySetInnerHTML={{ __html: doc.content }} />
        </article>
    )
}
```

**Say:** "Generic page view — your fallback. The `doc` prop is the live document; edits in the markdown file push here automatically over SSE."

### 6. `src/views/ArticleView.jsx`

```jsx
export default function ArticleView({ doc }) {
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
            <div dangerouslySetInnerHTML={{ __html: doc.content }} />
        </article>
    )
}
```

**Say:** "Layout-specific view. The article schema requires `author` and `date`, so this view can rely on them."

### 7. `src/views/NotFound.jsx`

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

### 8. `src/main.jsx`

There are two variants. Pick based on the answer to question 2 in the workflow.

#### Variant A — user has no existing router

```jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { createClient } from 'mikser-io-sdk-api'
import { MikserProvider } from 'mikser-io-sdk-react'
import App from './App.jsx'

// One entities client per app — caches, dedups, manages SSE.
const client = createClient({ url: import.meta.env.VITE_MIKSER_URL })

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
import App from './App.jsx'  // their existing tree, with its router inside

const client = createClient({ url: import.meta.env.VITE_MIKSER_URL })

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MikserProvider client={client}>
            <App />
        </MikserProvider>
    </React.StrictMode>,
)
```

**Say (both variants):** "`createClient` from `sdk-api` is the underlying entities client (one per app — caches, dedups, runs the SSE stream). `MikserProvider` is the React context that holds it. Anything below it can call `useMikserRoutes`, `useDocument`, `useSimilar`, etc. It does not own the router — your router stays yours."

### 9. `src/App.jsx`

The integration point — where `useMikserRoutes` lives. This file is the same regardless of variant; what differs is whether the router lives here or upstream.

#### If you scaffolded the router in main.jsx (Variant A):

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
