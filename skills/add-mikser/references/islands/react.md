# React + Islands — not a canonical example yet (but trivial to write)

The Islands pattern (mikser-rendered HTML + small framework bundles mounted on `data-island="…"` elements) is straightforward in React — most of the work is in the Vite config + entry script shape, which is framework-agnostic. There just isn't a canonical example in `mikser-io-sdk-react/examples/` yet.

The Vue Islands recipe (`references/islands/vue.md`) translates cleanly to React. The only Vue-specific pieces are:

| Vue | React equivalent |
|---|---|
| `createApp(SearchBox).mount(el)` | `createRoot(el).render(<SearchBox />)` |
| `createMikserPlugin({ client })` + `.use(...)` | `<MikserProvider client={client}><SearchBox /></MikserProvider>` |
| `useDocuments(() => query)` composable | `useDocuments(query)` hook (same signature, just no getter) |
| `<script setup>` SFC | `function SearchBox()` component |

Everything else — multi-entry Vite build, `data-island` mount selector, `data-*` config attributes, predictable filenames, mikser-side template integration — is identical.

## What to tell the user

> Islands for React is genuinely a one-line-per-island affair — the Vue recipe at `references/islands/vue.md` is the structural template, and the only differences are the React idiom (createRoot + MikserProvider instead of createApp + plugin). The patterns translate cleanly.
>
> Want me to scaffold a React Islands setup using the Vue recipe as the template? I'll:
>
> 1. Set up `vite.config.js` with the multi-entry build (identical to the Vue version).
> 2. Write `src/islands/search.js` and `src/islands/cart-counter.js` as React entry scripts.
> 3. Write `src/components/SearchBox.jsx` and `src/components/CartCounter.jsx`.
> 4. Write `public/example-page.html` as the simulated mikser-rendered page.
>
> This isn't a canonical SDK example yet but it's a faithful port. If it goes well it can become one — open a PR against `mikser-io-sdk-react/examples/`.

## If the user agrees

Walk through the Vue Islands recipe step by step, substituting React equivalents at each component-construction point. The Vite config, HTML template, and entry-script shape all stay the same. Most files are <30 lines.

Sample entry script (search.js):

```js
import { createRoot } from 'react-dom/client'
import { createClient } from 'mikser-io-sdk-api'
import { MikserProvider } from 'mikser-io-sdk-react'
import SearchBox from '../components/SearchBox.jsx'

const el = document.querySelector('[data-island="search"]')
if (el) {
    const endpoint = el.dataset.endpoint ?? 'public'
    const baseUrl  = el.dataset.baseUrl  ?? import.meta.env.VITE_MIKSER_URL ?? '/'
    const client = createClient({ baseUrl }).entities(endpoint)

    createRoot(el).render(
        <MikserProvider client={client}>
            <SearchBox />
        </MikserProvider>,
    )
}
```

Sample component (SearchBox.jsx):

```jsx
import { useState, useMemo } from 'react'
import { useDocuments } from 'mikser-io-sdk-react'

export default function SearchBox() {
    const [q, setQ] = useState('')
    const query = useMemo(() => ({
        filter: q
            ? { 'meta.title': { $regex: q, $options: 'i' }, 'meta.published': true }
            : { id: '__empty__' },
        fields: ['id', 'meta.title', 'meta.summary', 'meta.route'],
        limit:  10,
    }), [q])
    const { documents: results, loading } = useDocuments(query)

    return (
        <div className="search-box">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" />
            {loading && q && <p>Searching…</p>}
            {results.length > 0 && (
                <ul>
                    {results.map(r => (
                        <li key={r.id}>
                            <a href={r.meta.route}>
                                <strong>{r.meta.title}</strong>
                                <p>{r.meta.summary}</p>
                            </a>
                        </li>
                    ))}
                </ul>
            )}
            {q && !loading && results.length === 0 && <p>No results.</p>}
        </div>
    )
}
```

This is enough scaffolding that the user can ship a real Islands setup today; the missing canonical example is just a polished version of this with PRs welcome.
