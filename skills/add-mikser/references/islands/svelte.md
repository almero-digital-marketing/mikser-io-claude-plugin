# Svelte + Islands — not a canonical example yet (but trivial to write)

The Islands pattern (mikser-rendered HTML + small framework bundles mounted on `data-island="…"` elements) works in Svelte 5 — most of the work is in the Vite config + entry script shape, which is framework-agnostic. There just isn't a canonical example in `mikser-io-sdk-svelte/examples/` yet.

**Note:** Use plain Svelte (no SvelteKit) for Islands. SvelteKit's runtime is built around page-level navigation and routing; for the Islands pattern you want lightweight per-island bundles without an SPA shell. The `mikser-io-sdk-svelte` package works with both — it doesn't require SvelteKit.

The Vue Islands recipe (`references/islands/vue.md`) translates cleanly. The Vue → Svelte mapping:

| Vue | Svelte 5 equivalent |
|---|---|
| `createApp(SearchBox).mount(el)` | `mount(SearchBox, { target: el })` (from `svelte`) |
| `createMikserPlugin({ client })` + `.use(...)` | `setMikserClient(client)` inside the component's `<script>` |
| `useDocuments(() => query)` composable | `useDocuments(() => query)` rune (same shape — takes a getter, returns a reactive object with `.documents`, `.loading`, `.error`) |
| `<script setup>` SFC | `<script>` block in `.svelte` file |

The multi-entry Vite build, `data-island` mount selector, `data-*` config attributes, and mikser-side template integration are identical.

## What to tell the user

> Islands for Svelte is a faithful port of the Vue recipe — the Vue version at `references/islands/vue.md` is the structural template, and the only differences are the Svelte idiom (mount + setMikserClient instead of createApp + plugin).
>
> Want me to scaffold a Svelte Islands setup using the Vue recipe as the template? I'll:
>
> 1. Set up `vite.config.js` with the multi-entry build (identical to the Vue version).
> 2. Write `src/islands/search.js` and `src/islands/cart-counter.js` as Svelte 5 entry scripts.
> 3. Write `src/components/SearchBox.svelte` and `src/components/CartCounter.svelte`.
> 4. Write `public/example-page.html` as the simulated mikser-rendered page.
>
> This isn't a canonical SDK example yet but it's a faithful port. If it goes well it can become one — open a PR against `mikser-io-sdk-svelte/examples/`.

## If the user agrees

Walk through the Vue Islands recipe step by step, substituting Svelte 5 equivalents at each component-construction point. The Vite config, HTML template, and entry-script shape all stay the same.

Sample entry script (search.js):

```js
import { mount } from 'svelte'
import { createClient } from 'mikser-io-sdk-api'
import { setMikserClient } from 'mikser-io-sdk-svelte'
import SearchBox from '../components/SearchBox.svelte'

const el = document.querySelector('[data-island="search"]')
if (el) {
    const endpoint = el.dataset.endpoint ?? 'public'
    const baseUrl  = el.dataset.baseUrl  ?? import.meta.env.VITE_MIKSER_URL ?? '/'
    const client = createClient({ baseUrl }).entities(endpoint)

    // setMikserClient must run inside a component lifecycle for context
    // to take, so we mount a small bootstrap component that wraps
    // SearchBox and does the registration in its own <script>.
    // Alternative: do mount() inside an onMount on a parent island
    // wrapper that takes `client` as a prop and calls setMikserClient.
    mount(SearchBox, {
        target: el,
        props: { mikserClient: client },
    })
}
```

Sample component (SearchBox.svelte):

```svelte
<script>
    import { setMikserClient, useDocuments } from 'mikser-io-sdk-svelte'

    let { mikserClient } = $props()
    setMikserClient(mikserClient)

    let q = $state('')

    const query = $derived(q
        ? { filter: { 'meta.title': { $regex: q, $options: 'i' }, 'meta.published': true },
            fields: ['id', 'meta.title', 'meta.summary', 'meta.route'],
            limit: 10 }
        : { filter: { id: '__empty__' }, limit: 0 })

    const result = useDocuments(() => query)
</script>

<div class="search-box">
    <input bind:value={q} placeholder="Search…" />
    {#if result.loading && q}<p>Searching…</p>{/if}
    {#if result.documents.length}
        <ul>
            {#each result.documents as r (r.id)}
                <li>
                    <a href={r.meta.route}>
                        <strong>{r.meta.title}</strong>
                        <p>{r.meta.summary}</p>
                    </a>
                </li>
            {/each}
        </ul>
    {:else if q && !result.loading}
        <p>No results.</p>
    {/if}
</div>
```

This is enough scaffolding that the user can ship a real Islands setup today; the missing canonical example is just a polished version of this with PRs welcome.
