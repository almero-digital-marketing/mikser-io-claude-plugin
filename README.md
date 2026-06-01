# mikser-io-claude-plugin

Claude Code skills for bootstrapping [mikser-io](https://github.com/almero-digital-marketing/mikser-io) content backends into existing Vue 3, React 18+/19, and SvelteKit projects — or into a blank directory.

The skills augment what you already have — they edit your `main.js`/`main.jsx`/`+layout.svelte`, wire the framework SDK, and optionally scaffold a sibling `mikser-content/` folder so the backend has something to serve on first run. They don't take over your router, your build, or your style.

## What's inside

The `add-mikser` skill supports three architectures (you pick the one that fits):

| Architecture | When to use | Trade-off |
| --- | --- | --- |
| **Pure SPA** *(default)* | Internal tools, editors, dashboards. Fastest setup. Live SSE everywhere. | Public HTML is empty until JS loads — bad SEO. |
| **Hybrid SSG** | Marketing sites with non-developer editors. Static public site + SPA editor with live preview. | Two build steps. Two entry points. More wiring. |
| **Islands** | Content-heavy sites with focused interactivity (search, cart, contact). Mikser-rendered HTML + small framework bundles. | Mikser-side templating (hbs/eta) for the page shell. |

Framework support per architecture:

| | Vue 3 | React 18+/19 | SvelteKit |
| --- | --- | --- | --- |
| Pure SPA | ✓ | ✓ | ✓ |
| Hybrid SSG | ✓ (vite-ssg) | ✓ (manifest SPA) | ✓ (per-route prerender) |
| Islands | ✓ | ✓ | ✓ (plain Svelte 5, no SvelteKit) |

Each cell maps to a canonical example shipped in the matching SDK's `examples/` directory. The recipes are extracted inline so you can read them in the skill without leaving Claude Code.

## Live updates

Every architecture the skill scaffolds includes live SSE support — just applied at different surfaces:

| Architecture | Live surface | What edits push to |
| --- | --- | --- |
| **Pure SPA** | The whole app | Edit a `.md` file → SSE → views re-render. Every page updates without refresh. |
| **Hybrid SSG** | Editor only (`/admin/`); public side is static | Editor views update live; public visitors get the rebuilt HTML on next deploy. |
| **Islands** | Per-island; only islands that use `useDocuments` / `useDocument` | Search island stays in sync as docs land; the surrounding mikser-rendered HTML is static (rebuild to update). Pure-client islands (e.g. a cart counter) aren't tied to mikser. |

The mechanism is identical across all three: `mikser-content`'s `api` plugin exposes a `/subscribe` SSE endpoint, [`mikser-io-sdk-api`](https://github.com/almero-digital-marketing/mikser-io-sdk-api)'s `client.live()` subscribes to it, and the framework SDKs (`useDocument` / `useDocuments` / `useMikserRoutes` / `useMikserStatus`) wrap that into reactive primitives. Even the connection guard ("Can't reach mikser backend") is live — if the backend comes back up while the page is open, the next probe sees it and the guard clears.

**Outage resilience — two mechanisms, one story.** Two different parts of the stack survive a brief mikser outage:

1. **First-paint routing** — the `data` plugin's `catalog` config writes a static `out/data/sitemap.json` snapshot at finalize. The SDK loads it via `entities('public', { data: { catalog: 'sitemap', entities: 'page' } })`. One CDN-cacheable file, no API roundtrip; whatever is fronting your static assets keeps serving it during an outage.
2. **Live per-id reads** — the api plugin's `cache: true` option (mikser-io ^6.25.1) writes every GET `/entities?...` response to disk, keyed by the request URL's raw query string. Calls like `useDocument(id)` survive an outage out of the proxy's cached responses.

| Surface                              | Source                                      | What survives an outage                          |
|---|---|---|
| First-paint route table              | `/data/sitemap.json` (data plugin)          | Whatever the CDN / static layer is serving       |
| `useDocument(id)` and similar reads  | `/api/public/entities/...` with `cache: true` | The proxy's cached response per request URL    |
| Live updates (SSE)                   | `/api/public/subscribe`                     | Nothing — SSE pauses, `useMikserStatus` reports it |

For the per-id cache, a reverse proxy fails over to disk using **stock nginx** — no Lua, no extra modules:

```nginx
location /api/public/entities {
    proxy_pass http://localhost:3001;
    proxy_intercept_errors on;
    error_page 502 503 504 = @cache;
}
location @cache {
    root /var/www/out;
    try_files /api/public/entities/$args.json
              /api/public/entities/index.json
              =502;
}
```

`$args` is whatever query string the client sent — same string mikser used as the cache filename. Path match, no hashing on either side.

The SDK (`mikser-io-sdk-api ^2.4.2`) uses GET for `list()` calls so the cache fills from real traffic automatically. On invalidation (any entity change), mikser drops the whole cache directory; subsequent requests re-warm it on demand. See [mikser-io's caching docs](https://github.com/almero-digital-marketing/mikser-io/blob/main/documentation/caching.md) for the full nginx / Caddy / Cloudflare / Apache configs.

The SPA's connection guard still triggers if the live backend is unreachable from the browser — but with the cache in place, navigation reads succeed and the guard only surfaces if the user tries to mutate or open SSE.

What is **not** live in any architecture:

- **Hybrid SSG public-side routes** — those come from a build-time manifest. New documents need a rebuild + redeploy to appear on the public site. The editor sees them immediately via SSE.
- **Schema validation results** — schemas validate on `mikser-content`'s side at document load time. The browser sees an updated `entities.d.ts` only after a TypeScript reload (Vite usually picks it up via HMR).

If you want a particular surface to be live and it isn't by default, that's almost always doable by leaning harder on the SDK's `live()` primitive. The architectures are starting points, not constraints.

More skills (multilingual routes, vector search wiring, schema design) will land here over time.

## Installing

In Claude Code, add this repo as a marketplace and install the plugin from it:

```
/plugin marketplace add almero-digital-marketing/mikser-io-claude-plugin
/plugin install mikser-io-claude-plugin@mikser-io
```

The first command registers the repo as a marketplace (named `mikser-io`); the second installs the `mikser-io-claude-plugin` plugin from it.

Or for local development:

```bash
git clone https://github.com/almero-digital-marketing/mikser-io-claude-plugin.git
# then add the local path as a marketplace:
#   /plugin marketplace add ./mikser-io-claude-plugin
#   /plugin install mikser-io-claude-plugin@mikser-io
```

## Using

Open your Vue/React/SvelteKit project in Claude Code and say something like:

> Add mikser to this app.

Or any of these — the skill triggers on all of them:

> I want a live content backend where I can edit markdown files and see them in the browser.
> Set up mikser with a hybrid SSG + editor for our marketing site.
> I want to add a Vue search island to a content site.

Claude will pick the `add-mikser` skill, detect your framework, ask you to pick the architecture (Pure SPA / Hybrid SSG / Islands), then ask a few more questions (mikser URL, existing router, content starter) and apply the wiring. After that you run the right combination of dev servers (Pure SPA: two terminals; Hybrid: up to three; Islands: two builds, one deploy):

```
# Terminal 1
cd mikser-content && npm run dev      # mikser backend on :3001

# Terminal 2
npm run dev                            # your frontend
```

Edit any document in `mikser-content/documents/` and watch the browser update over SSE.

## Philosophy

- **Augment, don't own.** The skill edits your existing app. Your routes, your shell, your config conventions all survive.
- **Content lives in the skill, not in boilerplate.** The starter documents, schemas, and `mikser.config.js` are inline in the skill so you can fork or edit them in place. There's no separate template package to update.
- **Teach as you go.** Every file the skill creates gets a one-line explanation — where the dispatch lives, what each part of the config does — so you own the project from day one.

## License

MIT — Almero Digital Marketing.
