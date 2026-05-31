# React + Islands — mikser-io bootstrap recipe

This reference is read by the `add-mikser` skill when the user picks the **Islands** architecture and the framework is React. Mikser produces the static HTML; small React bundles mount onto specific DOM nodes for interactivity. No router, no SPA shell, no hydration tax.

This is the right shape for content-heavy sites with focused interactivity — search, cart, contact form — where the bulk of the page is just content (mikser renders it) and JavaScript is needed only at a few spots.

> **Branch A warning:** This recipe assumes you'll move the page-layout pipeline into mikser-content's render-* plugins (hbs / eta / liquid). If your existing app is a React SPA today, that's a big restructure — confirm with the user that they really want Islands. The Pure SPA recipe is a closer fit if they want to keep the SPA shell.

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
                              [data-island=...] nodes and createRoot()s them
```

## Peer deps

```bash
npm install mikser-io-sdk-react mikser-io-sdk-api react react-dom
```

Tell the user: "Standard React 18+/19 deps plus the mikser SDKs. No router — islands don't need one. No markdown-it — mikser renders the markdown into HTML at build time."

## Files to write or edit

### 1. `.env`

Project root:

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
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
})
```

**Say:** "Plain Vite config. The single `main.jsx` entry below calls every island's mount function — they each look up their own `[data-island=...]` nodes, so the same bundle works on any page (mounts only what's actually present)."

### 4. `index.html` — dev entry (points the user at the demo page)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>islands · dev</title>
</head>
<body>
    <p>See <a href="/example-page.html">/example-page.html</a> for the islands demo.</p>
</body>
</html>
```

### 5. `public/example-page.html` — simulated mikser-rendered page

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
    <!-- A simulated mikser-rendered page. In production, mikser's
         render-hbs plugin emits something very similar. -->
    <header>
        <h2>Acme Co</h2>
        <div data-island="cart" data-initial="0"></div>
    </header>

    <article>
        <h1>Welcome</h1>
        <p>Static content rendered by mikser. The interactive bits below are React islands.</p>

        <h2>Find something</h2>
        <div data-island="search"></div>
    </article>

    <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

**Say:** "The simulated mikser-rendered page. In production, your mikser layouts emit something like this with `data-island="..."` mount points. `data-*` attributes become React props on the mounted component (e.g. `data-initial="0"` → `<CartCounter initial="0" />`)."

### 6. `src/main.jsx` — runs every mount function

```jsx
import { mountSearch } from './islands/search.jsx'
import { mountCart } from './islands/cart.jsx'

// mikser owns the page HTML. We find each [data-island] node and mount
// the matching React component into it — independent roots, not one
// app root. Data attributes on the node are passed in as props.
//
// Each mount function is idempotent and a no-op if its selector matches
// nothing, so the same bundle is safe to load on every page.
mountSearch()
mountCart()
```

**Say:** "One entry that calls every island. Each mount function is safe to call on every page — it's a no-op if its target nodes don't exist. Add a new island by adding its mount function here."

### 7. `src/islands/search.jsx` — mikser-aware island

```jsx
import { createRoot } from 'react-dom/client'
import { createClient } from 'mikser-io-sdk-api'
import { MikserProvider } from 'mikser-io-sdk-react'
import SearchBox from '../components/SearchBox.jsx'

const MIKSER_URL = import.meta.env.VITE_MIKSER_URL || 'http://localhost:3001'
const client = createClient({ baseUrl: MIKSER_URL }).entities('public')

export function mountSearch(selector = '[data-island="search"]') {
    for (const el of document.querySelectorAll(selector)) {
        const props = { ...el.dataset }
        createRoot(el).render(
            <MikserProvider client={client}>
                <SearchBox {...props} />
            </MikserProvider>,
        )
    }
}
```

**Say:** "Search island — talks to mikser. Each mount wraps the component in its own `MikserProvider` so hooks can `useMikserClient()`. `data-*` attributes on the mount node spread into props, so the same bundle handles different endpoints / configurations across pages."

### 8. `src/islands/cart.jsx` — pure-client island

```jsx
import { createRoot } from 'react-dom/client'
import CartCounter from '../components/CartCounter.jsx'

// The cart island is a self-contained interactive widget — it doesn't
// read from mikser, so no provider is needed. Just mount.
export function mountCart(selector = '[data-island="cart"]') {
    for (const el of document.querySelectorAll(selector)) {
        const props = { ...el.dataset }
        createRoot(el).render(<CartCounter {...props} />)
    }
}
```

**Say:** "Minimal island. No `MikserProvider` because this island manages local state only. Reach for this shape whenever the interactive feature doesn't need server data."

### 9. `src/components/SearchBox.jsx`

```jsx
import { useMemo, useState } from 'react'
import { useDocuments } from 'mikser-io-sdk-react'

export default function SearchBox() {
    const [query, setQuery] = useState('')
    const { documents } = useDocuments({
        fields: ['id', 'route', 'meta'],
        limit: 100,
    })

    // Client-side filter against the live document list. SSE keeps
    // `documents` fresh, so adding a new mikser doc updates this list
    // without a refetch.
    const results = useMemo(() => {
        const term = query.trim().toLowerCase()
        if (!term) return []
        return documents
            .filter(d => (d.meta?.title ?? '').toLowerCase().includes(term))
            .slice(0, 8)
    }, [query, documents])

    return (
        <div className="search">
            <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                type="search"
                placeholder="Search…"
                className="search__input"
            />
            {results.length > 0 && (
                <ul className="search__results">
                    {results.map(hit => (
                        <li key={hit.id}>
                            <a href={hit.route}>{hit.meta?.title ?? hit.route}</a>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
```

**Say:** "Live-search component. `useDocuments` subscribes via SSE — the document list stays current automatically. Client-side substring match is fine for ~100 docs; for larger catalogs, build a sift `$regex` filter and let mikser do the matching server-side."

### 10. `src/components/CartCounter.jsx`

```jsx
import { useState } from 'react'

export default function CartCounter({ initial = '0' }) {
    const [count, setCount] = useState(Number(initial) || 0)

    return (
        <div className="cart">
            <button className="cart__btn" onClick={() => setCount(prev => prev + 1)}>
                Add to cart
            </button>
            <span className="cart__count">{count} item(s)</span>
        </div>
    )
}
```

**Say:** "Minimal client-only component. The `initial` prop comes from `data-initial` on the mount node — the same bundle can start at any count per-page. Replace with a real cart store (zustand/jotai/etc.) when you outgrow this."

## How mikser produces the HTML

Add a Handlebars (or Eta / Liquid) layout in `mikser-content/layouts/page.html.hbs`:

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
        <div data-island="search"></div>
    {{/if}}

    <script type="module" src="/main.js"></script>
</body>
</html>
```

Add the render plugins to `mikser-content/mikser.config.js`:

```js
export default {
    plugins: [
        'documents', 'front-matter', 'yaml', 'plugin-schemas',
        'layouts', 'render-hbs', 'render-markdown',
        'data', 'api',
    ],
    layouts: { cleanUrls: true },
}
```

Then build:

```bash
cd mikser-content && npm run build          # produces out/
cd .. && npm run build                       # produces dist/main.js
cp -r dist/* mikser-content/out/
# deploy mikser-content/out/ as a static site
```

## Run it

Two terminals during development:

```bash
cd mikser-content && npm run dev    # → mikser :3001
npm run dev                          # → vite :5173, /example-page.html demo
```

For production, there's no runtime mikser server — everything is baked into static HTML + JS at build time.

## Skip list

Do not touch: TypeScript / ESLint / Prettier / Tailwind / PostCSS configs, any existing component the user has, the user's existing `vite.config.js` if it has heavy customisation (just merge `plugins: [react()]` in).
