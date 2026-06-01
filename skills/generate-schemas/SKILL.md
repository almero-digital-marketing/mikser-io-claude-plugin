---
name: generate-schemas
description: Bootstrap mikser-io-plugin-schemas schemas by analyzing the shape of documents already in the project. Walks documents/, groups by the configured schemaKey, infers per-field Zod types from what's actually in the front-matter, and writes one schemas/<name>.js per group. Use when a project has documents but no schemas yet, when adopting plugin-schemas mid-project, or when adding a new component type and the user wants a starter schema generated from existing examples rather than written from scratch.
---

# generate-schemas

Generate Zod schemas for [mikser-io-plugin-schemas](https://github.com/almero-digital-marketing/mikser-io-plugin-schemas) from the actual shape of documents already in the project. The skill is for **bootstrap**, not ongoing maintenance — after running it, the schemas are normal `.js` files the user owns and edits by hand.

## What this skill does

1. Reads `mikser.config.js` to find the documents folder, the schemas folder, and `schemas.schemaKey`. Falls back to mikser's defaults (`documents/`, `schemas/`) if they're not set; asks for `schemaKey` if it's missing (no default — see `mikser-io-plugin-schemas` 0.4+).
2. Runs `scripts/analyze-documents.mjs` to walk the docs, parse YAML front-matter, group by the `schemaKey` value, and infer per-field types.
3. Reviews the report with the user, asking about ambiguous cases (mixed types, enum vs free-form string, optional vs always-present).
4. Writes `<schemasFolder>/<name>.js` files. Asks before overwriting any existing schema.
5. Verifies the result by loading each schema and running `safeParse` against every matching doc's `meta`.
6. Offers to wire `plugin-schemas` into `mikser.config.js` if not already there, and to set `schemaKey` if missing.

## When NOT to use this skill

- The user wants to **design** schemas from scratch (intentions first, fields second). Generate-schemas works from existing shape; design work happens by hand or against a different prompt.
- The user wants to **enforce** a stricter shape than what exists. The script proposes the minimal schema that matches the docs as-is; tightening is a separate edit pass.
- The user wants schemas for **non-mikser** content. The skill assumes mikser's catalog conventions (front-matter, `meta.*` paths, `schemaKey` dispatch).

## Workflow

Follow these steps in order. Don't skip ahead — each step builds on the previous one.

### 1. Locate the project's config

Find `mikser.config.js`. Most projects keep it at the repo root or in a `mikser-content/` subfolder. If the user hasn't said where, ask once with the most likely candidates as options. Read it.

Extract:
- `documents.documentsFolder` (default: `'documents'`)
- `schemas.schemasFolder` (default: `'schemas'`)
- `schemas.schemaKey` (no default in plugin-schemas 0.4+ — required)

If `schemaKey` isn't set, **do not guess**. Count `meta.component` vs `meta.layout` across a sample of documents and **ask** the user which to use:

> The project doesn't have `schemas.schemaKey` set. I scanned 12 documents:
> - 10 declare `meta.component`
> - 0 declare `meta.layout`
>
> Which front-matter field should drive schema dispatch?
> - **`meta.component`** (recommended for this project — SPA / runtime-dispatch shape)
> - **`meta.layout`** (SSG / template-dispatch shape)
> - Something else (e.g. `meta.type`)

Use `AskUserQuestion` for this — it's a structured choice that affects everything downstream.

### 2. Run the analyzer

Run the bundled script:

```bash
node skills/generate-schemas/scripts/analyze-documents.mjs \
    --docs <documentsFolder> \
    --key <schemaKey>
```

(Adjust the script path to wherever the plugin is installed — see `references/installation-paths.md` if unsure.)

The script emits a JSON report on stdout. Save it (e.g. `--out /tmp/schemas-report.json`) so you can re-read it without re-running. The report looks like:

```json
{
  "schemaKey": "meta.component",
  "totals": { "documentsScanned": 12, "schemasInferred": 3, ... },
  "schemas": {
    "article": {
      "documents": [ "en/welcome.md", ... ],
      "documentCount": 4,
      "fields": {
        "title": { "type": "string", "optional": false },
        "date":  { "type": "string", "optional": false, "refinement": "datetime" },
        "tags":  { "type": "array",  "optional": false,
                   "element": { "type": "string", "optional": false } },
        "category": {
          "type": "enum", "optional": false,
          "enumValues": ["guide", "release", "tutorial"]
        },
        "summary": { "type": "string", "optional": true },
        ...
      }
    },
    "product": { ... }
  },
  "warnings": { "noFrontmatter": [...], "noDispatchValue": [...] }
}
```

If `warnings.noFrontmatter` or `warnings.noDispatchValue` is non-empty, surface them — these are docs the analyzer couldn't bucket. They might be partials, includes, or genuinely broken — let the user decide whether to fix or ignore.

### 3. Review the inferred schemas with the user

For each schema in the report, present a compact summary:

> **`article`** — 4 documents
>
> | Field | Type | Notes |
> |---|---|---|
> | title | `string` | required |
> | date | `string().datetime()` | required |
> | author | `string` | required |
> | tags | `array(string)` | required |
> | category | `enum(["guide", "release", "tutorial"])` | required |
> | summary | `string` | **optional** (in 3/4 docs) |

Highlight anything the user should confirm:
- **Enums:** "I detected `category` has 3 distinct values across 4 docs — is this a closed set, or just a coincidence and any string is valid?"
- **Optional fields:** "`summary` appears in 3 of 4 docs. Make it optional, or is it actually required and the missing doc is a bug?"
- **Mixed types:** "`tags` is sometimes a string and sometimes an array — which is intended? I'll suggest array(string) and you can refine, or pick one shape."
- **Refinements:** "All `email` values look like emails — apply `.email()`, or keep as plain string?"
- **Single-doc groups:** "Only 1 document declares `landing` — the inferred schema reflects that one doc only. Worth proceeding or wait until you have more examples?"

Use `AskUserQuestion` for binary/structured choices; freeform questions for refinement decisions.

### 4. Decide the schema for the dispatch field itself

The analyzer includes the dispatch field in every group's fields (because the docs declare it). Two choices:

- **Pin it** with `z.literal('article')` for the article schema — strictest, catches docs miscategorized after the fact.
- **Loose** `z.string()` — permits the user to rename without breaking the schema.

Default to `z.literal(<name>)` unless the user says otherwise. The literal also makes the inferred TS types more useful.

### 5. Emit schema files

Write one file per schema to `<schemasFolder>/<name>.js`. Each file follows this shape:

```js
// schemas/article.js — generated by generate-schemas skill, edit freely
import { z } from 'zod'

export default z.object({
    component: z.literal('article'),
    title:     z.string(),
    date:      z.string().datetime(),
    author:    z.string(),
    tags:      z.array(z.string()),
    category:  z.enum(['guide', 'release', 'tutorial']),
    summary:   z.string().optional(),
})
```

Conventions:
- **One `z.object({...})` default export per file.** plugin-schemas duck-types on `safeParse`, so any Zod shape works, but the flat `z.object` is what the type generator (`entities.d.ts`) reads cleanly.
- **Order fields**: required first (alphabetical), then optional (alphabetical). Predictable diffs.
- **Use `.optional()` not `.nullable()`** unless the docs actually contain `null` values. `optional` matches the "missing key" semantics of YAML front-matter.
- **Refinements inline**: `z.string().url()`, `z.string().datetime()`, `z.string().email()`.
- **Enums as string-arrays**, not TS enums: `z.enum(['a', 'b', 'c'])`.
- **Comment generator origin** in a header comment so the user knows it can be edited freely (no round-trip).

#### Overwrite handling

If `<schemasFolder>/<name>.js` already exists:

1. Read the existing file.
2. Show a brief diff or summary of what's changing.
3. Ask: **keep existing**, **overwrite with generated**, or **stop** (skill exits, user resolves manually).

Use `AskUserQuestion` with these three options. Apply per-file, not all-or-nothing — partial overwrites are normal during incremental rollout.

### 6. Verify

After writing, run a quick check that every doc's `meta` actually parses against its new schema. Inline Node script (run via Bash):

```js
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
// ... walk documents, group by schemaKey, safeParse against the matching schema
// Report any failures with the multi-line message format from plugin-schemas:
//   schema(<name>) <doc.id>:
//     - <field>: <issue>
```

You can either inline the script via `node -e '...'` or read `references/verify-script.md` for the canonical version. Each failure means the inference was wrong — surface them and offer to either:
- Refine the schema (tighten/loosen the offending field), or
- Mark the doc as a known exception (rare; usually it's the schema that's wrong).

### 7. Wire plugin-schemas into mikser.config.js (if not yet)

If the project doesn't have `plugin-schemas` in `plugins` yet, propose the edit:

```js
plugins: [
    // ...,
    'plugin-schemas',                // ← add
],

schemas: {
    onError:   'warn',               // 'warn' | 'fail' | 'off'
    schemaKey: 'meta.component',     // matches step 1
    // schemasFolder defaults to 'schemas'
    // typesFile defaults to 'entities.d.ts'
},
```

Apply only with explicit confirmation. If the project already has the plugin, just verify `schemaKey` is set correctly and skip.

## References

When you need more depth on a specific topic, read the matching reference:

- **`references/inference-rules.md`** — full rules the analyzer applies, including edge cases (single-value enums, null-only fields, deeply nested objects, polymorphic content shapes).
- **`references/common-patterns.md`** — recipes for the patterns that show up across real projects: discriminated unions, content references, slugs, multi-locale fields, etc. Read this before deciding how to handle ambiguous cases in step 3.

Don't read both upfront. Load when the user's catalog hits the relevant pattern.

## Failure modes to watch for

- **Empty documents folder.** Script returns `schemasInferred: 0`. Don't write anything; ask the user where their docs actually live.
- **All docs missing the dispatch field.** Script puts everything in `noDispatchValue`. Either the user picked the wrong `schemaKey`, or their docs don't declare it yet. Surface both possibilities.
- **Single document per group.** Inference is correct for that one doc but unlikely to generalize. Warn before writing — single examples are a weak basis for a schema.
- **Mixed shapes within a group.** E.g. `landing` documents with very different field sets — could be a hint that the user has multiple sub-types they should distinguish. Ask whether to split.
- **Generated schemas don't match runtime.** Step 6's verify pass should catch this; if it doesn't, the analyzer has a bug. Report the mismatch verbatim, don't silently "fix" it.

## What success looks like

After this skill runs:

1. Every distinct `meta[schemaKey]` value in the documents has a matching `schemas/<name>.js`.
2. `safeParse(entity.meta)` returns `success: true` for every existing document.
3. `mikser.config.js` has `plugin-schemas` wired up with the right `schemaKey`.
4. The user can run the project and see `entities.d.ts` regenerate without warnings.
5. The user can edit the generated schemas without losing anything — they're plain Zod files, no skill round-trip.
