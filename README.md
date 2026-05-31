# mikser-io-claude-plugin

Claude Code skills for bootstrapping [mikser-io](https://github.com/almero-digital-marketing/mikser-io) content backends into existing Vue 3, React 18+/19, and SvelteKit projects.

The skills augment what you already have — they edit your `main.js`/`main.jsx`/`+layout.svelte`, wire the framework SDK, and optionally scaffold a sibling `mikser-content/` folder so the backend has something to serve on first run. They don't take over your router, your build, or your style.

## What's inside

| Skill | What it does |
| --- | --- |
| `add-mikser` | Detects Vue / React / SvelteKit from your `package.json` and wires the matching mikser SDK into the project. Optionally scaffolds a `mikser-content/` sibling folder with Zod schemas and starter documents. |

More skills (multilingual routes, vector search wiring, schema design) will land here over time.

## Installing

In Claude Code:

```
/plugin add almero-digital-marketing/mikser-io-claude-plugin
```

Or for local development:

```bash
git clone https://github.com/almero-digital-marketing/mikser-io-claude-plugin.git
# then point Claude Code at the local path via /plugin or your settings.json
```

## Using

Open your Vue/React/SvelteKit project in Claude Code and say something like:

> Add mikser to this app.

Or:

> I want a live content backend where I can edit markdown files and see them in the browser.

Claude will pick the `add-mikser` skill, detect your framework, ask three quick questions (mikser server URL, integrate into existing router, scaffold a content starter), and apply the wiring. After that you run two terminals:

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
