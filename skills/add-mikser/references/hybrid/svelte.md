# SvelteKit + Hybrid SSG — not a canonical example yet (but close)

SvelteKit already does most of what the Hybrid SSG pattern wants — its `prerender = true` mode + `entries()` hook produce a static site from a single codebase. So "Hybrid SSG with SvelteKit" is partly a question of how to split the editor from the public side rather than how to do SSG at all.

The Pure SPA SvelteKit recipe (`references/spa/svelte.md`) already uses `entries()` + `generateMikserRoutes` for prerender (defaulted off in the recipe so first build doesn't need the backend running). That covers the **public** half of Hybrid SSG.

What's missing is a **separate editor surface** with live SSE — the typical agency pattern of `/` for SEO + `/admin/` for editors with live previews.

## What to tell the user

> SvelteKit's own prerender path covers most of Hybrid SSG already. The Pure SPA SvelteKit recipe (which uses `entries()` + `generateMikserRoutes` for prerender) is closer to "Hybrid" than to "pure SPA" in spirit.
>
> The piece that needs explicit scaffolding for Hybrid is a separate editor surface at `/admin/` with live SSE. Two approaches:
>
> 1. **One SvelteKit app, prerender = true for public routes, false for `/admin/*`.** The simplest path. Public routes get pre-rendered HTML; the `/admin/*` route group runs as a SPA against the live mikser server. SvelteKit's per-route `prerender` toggle handles this naturally.
> 2. **Two SvelteKit apps, separate builds.** Cleaner separation of public and editor concerns at the cost of two deploy targets. The `/admin/` app is essentially the Pure SPA SvelteKit recipe with prerender disabled.
>
> Want me to:
> - Scaffold option 1 (per-route prerender)? Mostly inherits from `references/spa/svelte.md` with a per-route adjustment.
> - Scaffold the editor side of option 2? Falls through to Pure SPA with `prerender = false`.

## If they pick option 1 (per-route prerender)

Use `references/spa/svelte.md` as the base. Then:

- For public routes (the catch-all `[...slug]/+page.server.js`): `export const prerender = true`. Start mikser before `npm run build`.
- For `/admin/` routes: a separate route group. The `+page.server.js` for `/admin/*` sets `export const prerender = false`. Inside, build an editor home page and any admin-only views; use `useDocuments` and other runes the same way as the Pure SPA catch-all.

## If they pick option 2 (separate apps)

Fall through to `references/spa/svelte.md` for the editor app in a separate directory. The public app uses the existing Pure SPA recipe with `prerender = true`.

## Open question / contribution invite

A canonical SvelteKit Hybrid example would help:

- Pin a layout for the `/admin/` route group (with the editor-bar header, recently-edited list, etc.)
- Cover deployment: one adapter for both, or `adapter-static` for public + `adapter-node`/etc. for editor?

Track at [github.com/almero-digital-marketing/mikser-io-claude-plugin/issues](https://github.com/almero-digital-marketing/mikser-io-claude-plugin/issues) if you want to pick this up.
