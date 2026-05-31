# React + Hybrid SSG — not a canonical example yet

The Hybrid SSG pattern (static public site + SPA editor, shared route mapping) is not yet shipped as a canonical example in `mikser-io-sdk-react/examples/`. The closest equivalent in the React ecosystem would pair:

- **Public build**: a static generator like [react-static](https://github.com/react-static/react-static), [vite-react-ssg](https://github.com/kingyue737/vite-react-ssg), or hand-rolled `react-dom/server.renderToString` + a route enumerator.
- **Editor build**: the Pure SPA recipe (`references/spa/react.md`), mounted at `/admin/`.

The shared piece is the route-mapping: one `mapRoute` function used by both the build-time generator and the editor's `useMikserRoutes(...)`. That part is straightforward because `generateMikserRoutes` (from `mikser-io-sdk-react`) is already framework-portable — it takes a `client` and a `mapRoute`, returns whatever the mapper returns.

## What to tell the user

Be honest about the state of the world:

> Hybrid SSG isn't shipped as a canonical example for React in the SDK yet. The two real options:
>
> 1. **Build it.** Pair a React SSG (vite-react-ssg, react-static) with the Pure SPA recipe for the editor. You'd write the public-side router yourself (the Vue recipe's `src/public/router.js` is a good template — read it for structure). I can scaffold the editor side via the Pure SPA React recipe right now; you'd add the SSG side as a follow-up.
> 2. **Use Pure SPA instead.** It gives you live updates everywhere. SEO is the main thing you'd give up — and for many sites that's manageable with SSR-on-demand at a CDN layer (Cloudflare Workers, Vercel ISR, etc).
>
> If you want option 1 and need a hand turning it into a canonical example, the Vue Hybrid recipe at `references/hybrid/vue.md` is the closest reference and the patterns translate directly.

## If they pick "scaffold the editor side now"

Fall through to `references/spa/react.md`, but adjust:

- Mount path: `/admin/` (router uses `createBrowserRouter` with `basename: '/admin'` or similar)
- Connection guard messaging: "Mikser is down — editor disabled" rather than "Can't reach mikser"
- No public site is generated — that's a TODO the user owns

## If they pick "use Pure SPA"

Fall through to `references/spa/react.md` as-is.

## Open question / contribution invite

The canonical React Hybrid example needs:

- A pinned choice of SSG (vite-react-ssg is the closest to vite-ssg's API)
- A working `build/generate-routes.mjs` (basically identical to the Vue version — `generateMikserRoutes({ client, mapRoute })`)
- An equivalent of `src/public/router.js` that consumes the manifest and rehydrates `createBrowserRouter`

This is a 3–4 hour task for someone familiar with React + the chosen SSG. Track at [github.com/almero-digital-marketing/mikser-io-claude-plugin/issues](https://github.com/almero-digital-marketing/mikser-io-claude-plugin/issues) if you want to pick it up.
