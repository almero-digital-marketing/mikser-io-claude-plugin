# Inference rules

The exact rules the analyzer script applies, and the reasoning behind the ones that aren't obvious. Read this when you need to defend or refine a choice the analyzer made.

## Primitive types

| Observation across all docs in a group | Inferred Zod type |
|---|---|
| Every value is a string | `z.string()` |
| Every value is a number | `z.number()` |
| Every value is a boolean | `z.boolean()` |
| Every value is null | `z.unknown()` + warning |
| Mixed types (string + number, etc.) | `z.unknown()` + warning |

Mixed-type fields are intentionally bumped to `z.unknown()` rather than `z.union(...)`. Unions in inferred schemas tend to be wrong more often than right — usually the actual intent is one of the types and the other is a typo or a migration artifact. Asking is cheaper than guessing.

## String refinements

Promoted only when **100% of observed values** match the pattern *and* at least 3 documents in the group declare the field. The "3 documents" floor avoids promoting a refinement off a single example.

| Pattern | Promoted to |
|---|---|
| ISO 8601 date or datetime (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SSZ`) | `z.string().datetime()` |
| `https?://...` | `z.string().url()` |
| `local@domain.tld` | `z.string().email()` |

Notes:
- **Datetime over date-only.** Mikser's API serializes Date objects via JSON which means strings on the wire anyway; keeping the schema as `string().datetime()` matches what consumers actually receive. Use `z.coerce.date()` only if the user explicitly wants Date objects in their app — that's a downstream decision.
- **URL is `https?` only.** `mailto:`, `file:`, etc. don't match — the analyzer leaves them as plain strings.
- **Path-like strings** (e.g. `/en/about`) are intentionally not promoted. They look like URLs but they're route references, and there's no good Zod primitive for "absolute internal route." Leaving them as `string()` is correct.

## Enum detection

A string field is promoted to `z.enum([...])` when:
- It has **2–6 distinct values**, *and*
- Every value appears in at least 3 documents (approximated as `field.seen >= 3 * distinctCount` — a per-value floor without per-value bookkeeping).

The threshold is calibrated against the false-positive risk: with only 1–2 occurrences per value, even a 4-value field probably isn't an enum (could be 4 unrelated authors who happen to be in the dataset).

**When in doubt, ask.** The user knows whether `category: 'tutorial'` is one of a closed set or just what one writer happened to type. The analyzer flags candidates; the user decides.

If the user confirms the enum, also ask whether to add an "other" escape hatch — `z.union([z.enum([...]), z.string()])` — for projects expecting growth. Default: closed enum.

## Arrays

| Observation | Inferred |
|---|---|
| All elements same primitive type | `z.array(z.<type>())` |
| All elements are objects with matching shape | `z.array(z.object({...}))` (recurse) |
| All elements are objects with varying shapes | `z.array(z.object({...}))` with union of all observed keys, each optional |
| Mixed primitive types in elements | `z.array(z.unknown())` + warning |
| Always empty array (no elements observed) | `z.array(z.unknown())` + warning (could be anything) |

Array-of-mixed-objects is the trickiest case in practice — most often it means the user has a polymorphic content list (hero blocks, page sections) and the schema should be a `z.discriminatedUnion(...)`. The analyzer can't infer the discriminator field on its own; surface this as a question.

## Objects

Recurse into the field stats. Required/optional is decided **at the level of the parent**, not the leaves — a missing `author` object means every field inside it is N/A, not "all optional." The analyzer handles this by tracking presence at each level separately.

Nested objects emit as inline `z.object({...})` rather than separate exports. If the same nested shape appears across multiple top-level schemas (e.g. an `author` block in both `article` and `landing`), the user can refactor by hand into a shared schema after generation.

## Required vs optional

A field is **required** iff it appears in **every** document in the group. The default is strict — even one missing occurrence makes it `.optional()`.

This is the right default because:
- Optional is recoverable: tightening to required is one edit and the verify pass catches the docs that would break.
- Required is destructive: too-strict required fields cause validation errors that look like "the schema is wrong" rather than "the doc is wrong."

When the analyzer marks a field optional based on one missing doc, surface it: "`summary` appears in 11/12 docs — make it optional, or is `welcome.md` missing it by mistake?"

## Null values

If a field is sometimes present-with-null and sometimes absent, the analyzer treats it as optional + the resolved type (e.g. `z.string().optional()`). If it's *always* null when present, the inferred type is `z.unknown()` + warning — the field has no observable shape.

Don't emit `.nullable()` unless the docs actually carry `null` values frequently enough that the consumer needs to handle them. For YAML-as-frontmatter, "missing key" is the idiomatic absence; `null` is rare and usually a mistake.

## The dispatch field itself

Every group's fields include the field declared by `schemaKey` — e.g. for `meta.component`, the docs all declare `component: 'article'` (etc.).

Two ways to represent this in the schema:

1. **`z.literal('article')`** — strict; catches docs miscategorized after the fact and improves the inferred TS type.
2. **`z.string()`** — loose; permits renaming without schema churn.

Default to `z.literal(<group-name>)`. Ask only if the user has reason to prefer loose (e.g. ongoing migration where component names are changing).

## Single-document groups

A schema inferred from one document reflects that one document — every present field is required, no refinements are promoted (the 3-doc floor isn't met), enums can't be detected (need 2+ distinct values).

This isn't useless — it's a starter scaffold the user will hand-edit anyway. Just **warn**: "I only see 1 `landing` document. The generated schema reflects that one example only and probably needs review before more landing pages are added."

## Empty groups

If the user provides a `schemaKey` that no documents declare, every group is empty and `schemasInferred: 0`. Don't write anything. Ask whether:
- The `schemaKey` is wrong (most likely),
- The documents folder is wrong, or
- The docs really haven't been categorized yet.

## What the analyzer never does

- **No semantic guesses.** A field named `slug` isn't promoted to a slug-pattern refinement just because of the name — only observable patterns drive inference.
- **No cross-group inference.** If `article` and `product` both have a `title: z.string()`, they don't get unified — the schemas are independent.
- **No suggestions beyond the data.** "You probably want a `description` field" isn't a thing the analyzer says. It works from what's there.
