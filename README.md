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
| Hybrid SSG | ✓ canonical | stub (port the Vue recipe) | stub (per-route prerender) |
| Islands | ✓ canonical | stub (port the Vue recipe) | stub (port the Vue recipe) |

The stubs are honest about the state of the world — they explain the pattern, point at the Vue version as the structural template, and offer to scaffold a faithful port. They don't pretend to be canonical SDK examples (yet).

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
