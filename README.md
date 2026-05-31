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
