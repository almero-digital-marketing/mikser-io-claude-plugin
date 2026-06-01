# Common patterns

Recipes for patterns that show up across real mikser projects but that the analyzer can't infer on its own. Read this in step 3 of the workflow when the inferred schema for a group looks awkward — the right answer is often one of these patterns, and the right question to ask the user is "is this what you have?"

## Discriminated unions (polymorphic content)

Some content types have multiple sub-shapes that share a discriminator field. The most common case is **landing pages** — the same `component: 'landing'` can house wildly different page layouts (hero + features, story-driven, product showcase, etc.).

If the analyzer reports a `landing` group where:
- Field set varies a lot across docs (lots of optional fields, low overlap), and
- One field looks like it could be a discriminator (`variant`, `template`, `style`),

ask whether to model this as a `z.discriminatedUnion`. Example shape:

```js
// schemas/landing.js
import { z } from 'zod'

const Hero = z.object({
    variant: z.literal('hero'),
    headline: z.string(),
    subheadline: z.string().optional(),
    cta: z.object({ label: z.string(), href: z.string() }),
})

const Story = z.object({
    variant: z.literal('story'),
    title: z.string(),
    paragraphs: z.array(z.string()),
})

export default z.discriminatedUnion('variant', [Hero, Story])
```

The discriminated union gives much better inferred TypeScript types than `z.unknown()` for the variant-specific fields. But it's a meaningful design call — only emit one if the user confirms the docs actually fall into clean sub-shapes.

## Content references — internal routes

A field like `next_article: '/en/articles/welcome'` is a reference to another document, not an arbitrary string. The analyzer leaves it as `z.string()` (correct — there's no URL scheme to test against), but the user may want to express intent:

```js
// Document-internal route — starts with /, no scheme
next_article: z.string().regex(/^\//, 'must be an internal route starting with /').optional(),
```

Or, if the project uses `meta.href` for the logical-reference pattern (see Vue/React SDK READMEs):

```js
related: z.array(z.string().regex(/^\/[a-z0-9-/]+$/)).optional(),
```

Ask before emitting — refinements that look like style preferences shouldn't be added by the analyzer alone.

## Multi-locale fields

When the same field appears in multiple language variants of a doc, the analyzer correctly infers the per-language shape — but the user may want a tagged-locale convention. Two common shapes:

**Locale-per-doc (idiomatic mikser):** the doc lives at `documents/en/...` and `documents/fr/...`, each with their own front-matter. Nothing special in the schema:

```js
export default z.object({
    title: z.string(),
    summary: z.string().optional(),
    ...
})
```

**Inline per-locale fields:** when a single doc carries multiple translations:

```js
title: z.object({ en: z.string(), fr: z.string(), de: z.string().optional() }),
```

The analyzer can't disambiguate — it just sees an object. Ask if the structure is "translations of one thing" or "actual nested data."

## Slug, id, sku — opaque identifiers

Fields like `sku: 'LMP-001'`, `slug: 'welcome'`, `code: 'A-123'` are opaque identifiers — they look like strings but they're keys, not human text. Default `z.string()` is fine; users sometimes want a regex:

```js
sku:  z.string().regex(/^[A-Z]{3}-\d{3}$/),
slug: z.string().regex(/^[a-z0-9-]+$/),
```

Default to plain `z.string()`. Only add the regex if the user explicitly asks, or if every observed value cleanly matches a strict pattern and the user confirms it's a contract, not a coincidence.

## Date semantics — `datetime()` vs `date()` vs `coerce.date()`

The analyzer promotes ISO 8601 strings to `z.string().datetime()`. That's the right default because mikser's API returns dates as JSON strings — keeping them as `string().datetime()` matches the wire shape consumers receive.

Two cases where the user may want something else:

- **`z.coerce.date()`** — useful when the consumer is server-side and wants Date objects to flow through. Coerces strings to Date on parse. Don't propose by default; ask only if the consumer is explicit about wanting Date.
- **`z.string().date()`** (Zod 3.20+) — for date-only strings (`2026-05-01`) where the time component should be rejected as invalid. The analyzer can't tell `2026-05-01` from `2026-05-01T00:00:00Z` apart for purposes of "what does the user want" — both pass `datetime()`. Ask only if the user is strict about format.

## Tags / categories — arrays of free-form strings

Default for `tags: array<string>` is `z.array(z.string())`. Two refinements that show up:

- **Min length:** the user wants at least one tag — `z.array(z.string()).nonempty()`.
- **Enum within array:** the user has a closed taxonomy — `z.array(z.enum(['guide', 'release', 'tutorial']))`. The analyzer can detect this case (enum-style distribution within array elements), but should ask before emitting — closed taxonomies are policy decisions, not data observations.

## Image / asset references

A field like `image: '/assets/desk-lamp.jpg'` could be:
- A local asset path (mikser's asset handling),
- An absolute URL (`https://cdn.example.com/lamp.jpg`),
- A reference into a separate asset index.

The analyzer sees the literal string and infers `z.string()` (or `z.string().url()` if every value is `https://...`). For mixed local+remote, leave as plain string. The user can refine downstream if they want stricter rules — most projects don't bother.

## Things the analyzer should never emit without asking

- **`.refine()` callbacks.** Custom validation logic should be hand-written, not generated. The analyzer's job is shape; semantics belong to the schema author.
- **`.transform()` chains.** Transforming output during parse changes the runtime shape and surprises downstream consumers. Out of scope.
- **Cross-field validation** (`z.object({...}).refine(obj => obj.a === obj.b)`). Same reason — semantic, not structural.
- **Custom error messages** beyond what plugin-schemas's friendly errorMap already produces. The default messages are calibrated for the editor experience; per-schema overrides are a separate decision.

## How to ask the user about ambiguous cases

When you find a pattern from this doc and want to confirm with the user, use `AskUserQuestion` with concrete options. Bad pattern:

> Should I make this an enum?

Good pattern:

> The `category` field has 3 distinct values across 12 documents: `guide`, `release`, `tutorial`. Looks like a closed set.
>
> Options:
> - **Closed enum** — `z.enum(['guide', 'release', 'tutorial'])`. Future docs must use one of these three.
> - **Enum with escape hatch** — `z.union([z.enum([...]), z.string()])`. Existing three are first-class but anything else is also valid.
> - **Free string** — `z.string()`. Treat the 3 values as coincidence.

The user picks. You write the schema accordingly.
