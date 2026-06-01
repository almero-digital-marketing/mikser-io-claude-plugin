#!/usr/bin/env node
// analyze-documents.mjs
//
// Walks a documents folder, parses YAML front-matter from every .md
// file, groups by the value at the `schemaKey` path, and infers per-
// field types. Emits a JSON report on stdout that the calling skill
// (or any other tool) consumes to write Zod schemas.
//
// Inference is intentionally conservative: when in doubt, fall back
// to `z.unknown()` and flag the field for human review. Better to
// nag the user once than emit a wrong schema that silently mismatches
// half the catalog.
//
// Usage:
//   node analyze-documents.mjs --docs <folder> --key <dotted.path> [--out <file>]
//
//   --docs   Path to the documents folder. Required.
//   --key    Dotted front-matter path that names the schema, e.g.
//            'meta.layout' or 'meta.component'. Required.
//   --out    Optional output file. Stdout by default.
//
// Exits 0 on success, 1 on usage error, 2 on read error.

import { readFile, readdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'

// ────────────────────────────────────────────────────────────────────
// Tiny YAML front-matter parser. We could pull in `gray-matter` or
// `js-yaml`, but those add a dependency and the skill should run with
// nothing more than Node. Front-matter shape is well-defined enough
// for an inline reader: lines between two `---` markers, key:value or
// key: nested-block. This covers everything mikser projects use in
// practice — quoted strings, numbers, booleans, ISO dates, simple
// arrays, single-level nested objects. Anything fancier falls through
// as a raw string; the inferrer treats it as `z.unknown()` and the
// user is asked to refine.
// ────────────────────────────────────────────────────────────────────
function parseFrontmatter(source) {
    const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!m) return null
    return parseYaml(m[1])
}

function parseYaml(text) {
    // Strip blank lines and comments, but keep indentation.
    const lines = text.split(/\r?\n/).filter(l => l.length > 0 && !/^\s*#/.test(l))
    const root = {}
    const stack = [{ obj: root, indent: -1 }]
    for (const line of lines) {
        const indent = line.match(/^\s*/)[0].length
        const content = line.slice(indent)
        // Pop stack until we're at parent depth.
        while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop()
        const parent = stack.length ? stack[stack.length - 1].obj : root
        // Inline arrays: `key: [a, b, c]`
        const arrayInline = content.match(/^([^:]+):\s*\[(.*)\]\s*$/)
        if (arrayInline) {
            parent[arrayInline[1].trim()] = arrayInline[2]
                .split(',')
                .map(s => coerce(s.trim()))
                .filter(v => v !== '')
            continue
        }
        // Inline object: `key: { a: 1, b: 2 }`
        const objInline = content.match(/^([^:]+):\s*\{(.*)\}\s*$/)
        if (objInline) {
            const inner = {}
            for (const pair of objInline[2].split(',')) {
                const [k, ...rest] = pair.split(':')
                if (!k) continue
                inner[k.trim()] = coerce(rest.join(':').trim())
            }
            parent[objInline[1].trim()] = inner
            continue
        }
        // Bullet list item under a parent key.
        const bullet = content.match(/^-\s*(.*)$/)
        if (bullet) {
            // The parent at this point is the object that owns the key
            // declared on the previous line. The bullet contributes to
            // that key's array. We track this via a marker on the
            // parent for the most-recent-key-with-bullets.
            const key = parent.__pendingArrayKey
            if (!key) continue                     // malformed, skip
            parent[key] = parent[key] || []
            parent[key].push(coerce(bullet[1].trim()))
            continue
        }
        // Plain `key: value` or `key:` (block follows).
        const m = content.match(/^([^:]+):\s*(.*)$/)
        if (!m) continue
        const key = m[1].trim()
        const rawValue = m[2]
        if (rawValue === '') {
            // Block follows — could be a list (bullets) or a nested
            // object. Either way, push a fresh container onto the
            // stack. We can't decide which until we see the next line
            // so prep both — the bullet handler upgrades into an
            // array; otherwise children become object keys.
            const child = {}
            parent[key] = child
            parent.__pendingArrayKey = key
            stack.push({ obj: child, indent })
            continue
        }
        parent[key] = coerce(rawValue)
        delete parent.__pendingArrayKey
    }
    return cleanPending(root)
}

function cleanPending(obj) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        delete obj.__pendingArrayKey
        for (const v of Object.values(obj)) cleanPending(v)
    }
    return obj
}

function coerce(raw) {
    if (raw === undefined || raw === null) return raw
    if (raw === 'null' || raw === '~') return null
    if (raw === 'true') return true
    if (raw === 'false') return false
    if (/^-?\d+$/.test(raw)) return Number(raw)
    if (/^-?\d*\.\d+$/.test(raw)) return Number(raw)
    // Quoted string — strip the quotes.
    const q = raw.match(/^(['"])(.*)\1$/)
    if (q) return q[2]
    return raw
}

// ────────────────────────────────────────────────────────────────────
// Pattern detectors. Each takes a string and returns true if the
// string fits the pattern across every sample. The inferrer only
// promotes the type when 100% of samples match — one outlier and we
// stay with the looser type.
// ────────────────────────────────────────────────────────────────────
const isIsoDate     = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)
const isUrl         = s => typeof s === 'string' && /^https?:\/\//.test(s)
const isEmail       = s => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
const isAbsPath     = s => typeof s === 'string' && /^\/[A-Za-z0-9_\-./]+$/.test(s)

// ────────────────────────────────────────────────────────────────────
// Field stat aggregator. For each field encountered, we track:
//   - presence count (how many documents have it)
//   - type counts per primitive kind
//   - distinct string values (capped at 32; over → free-form string)
//   - sample values for the report
// ────────────────────────────────────────────────────────────────────
function newFieldStat() {
    return {
        seen: 0,
        types: new Map(),               // 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null'
        distinct: new Set(),            // for enum + URL/email/date detection (only string values)
        nested: {},                     // recursive stats for object-typed values
        elements: null,                 // recursive stats for array-element types
        samples: [],
    }
}

function recordValue(stat, value) {
    stat.seen += 1
    const kind = typeofKind(value)
    stat.types.set(kind, (stat.types.get(kind) ?? 0) + 1)
    if (kind === 'string') {
        if (stat.distinct.size < 64) stat.distinct.add(value)
    }
    if (kind === 'object') {
        for (const [k, v] of Object.entries(value)) {
            stat.nested[k] = stat.nested[k] ?? newFieldStat()
            recordValue(stat.nested[k], v)
        }
    }
    if (kind === 'array') {
        stat.elements = stat.elements ?? newFieldStat()
        for (const el of value) recordValue(stat.elements, el)
    }
    if (stat.samples.length < 8) stat.samples.push(value)
}

function typeofKind(v) {
    if (v === null) return 'null'
    if (Array.isArray(v)) return 'array'
    return typeof v
}

// ────────────────────────────────────────────────────────────────────
// Inference. Given a field stat, produce a Zod-shaped descriptor:
//   { type: 'string'|'number'|...,
//     optional: boolean,
//     refinement: 'datetime'|'url'|'email'|null,
//     enumValues: [...] | null,
//     element: <recursive> | null,
//     fields: { name: <recursive> } | null,
//     warning: string | null }
//
// Optional iff presence count < total docs in this group.
// ────────────────────────────────────────────────────────────────────
function inferField(stat, groupSize) {
    const kinds = [...stat.types.keys()].filter(k => k !== 'null')
    const optional = stat.seen < groupSize || stat.types.has('null')
    if (kinds.length === 0) {
        return { type: 'unknown', optional, warning: 'field is always null' }
    }
    if (kinds.length > 1) {
        return {
            type: 'unknown', optional,
            warning: `mixed types: ${kinds.join(', ')}`,
        }
    }
    const kind = kinds[0]
    if (kind === 'string') {
        const values = [...stat.distinct]
        const allValues = stat.samples.filter(v => typeof v === 'string')
        if (values.length === 0) {
            return { type: 'string', optional }
        }
        if (allValues.length >= 3 && values.length > 0 && values.every(isIsoDate)) {
            return { type: 'string', optional, refinement: 'datetime' }
        }
        if (allValues.length >= 3 && values.length > 0 && values.every(isUrl)) {
            return { type: 'string', optional, refinement: 'url' }
        }
        if (allValues.length >= 3 && values.length > 0 && values.every(isEmail)) {
            return { type: 'string', optional, refinement: 'email' }
        }
        // Enum detection: ≤6 distinct values AND each appears in ≥3
        // documents (we approximate with seen/distinct.size as a per-
        // value floor; perfectly fair would track per-value counts).
        if (
            values.length >= 2 && values.length <= 6 &&
            stat.seen >= 3 * values.length
        ) {
            return { type: 'enum', optional, enumValues: values.sort() }
        }
        return { type: 'string', optional }
    }
    if (kind === 'number')  return { type: 'number', optional }
    if (kind === 'boolean') return { type: 'boolean', optional }
    if (kind === 'array') {
        const element = stat.elements
            ? inferField(stat.elements, stat.elements.seen)
            : { type: 'unknown' }
        return { type: 'array', optional, element }
    }
    if (kind === 'object') {
        const fields = {}
        for (const [k, s] of Object.entries(stat.nested)) {
            fields[k] = inferField(s, stat.seen)
        }
        return { type: 'object', optional, fields }
    }
    return { type: 'unknown', optional }
}

// ────────────────────────────────────────────────────────────────────
// Walk a folder for .md files, recursively.
// ────────────────────────────────────────────────────────────────────
async function findMarkdownFiles(root) {
    const out = []
    async function walk(dir) {
        let entries
        try { entries = await readdir(dir, { withFileTypes: true }) }
        catch (err) { throw new Error(`Cannot read ${dir}: ${err.message}`) }
        for (const entry of entries) {
            const p = path.join(dir, entry.name)
            if (entry.isDirectory()) await walk(p)
            else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) out.push(p)
        }
    }
    await walk(root)
    return out.sort()
}

function lookup(obj, dottedPath) {
    return dottedPath.split('.').reduce((acc, k) => acc?.[k], obj)
}

// ────────────────────────────────────────────────────────────────────
// Main.
// ────────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2))
if (!args.docs || !args.key) {
    process.stderr.write(
        'usage: analyze-documents.mjs --docs <folder> --key <dotted.path> [--out <file>]\n',
    )
    process.exit(1)
}

const docsRoot = path.resolve(args.docs)
try {
    const s = await stat(docsRoot)
    if (!s.isDirectory()) throw new Error('not a directory')
} catch (err) {
    process.stderr.write(`Cannot use --docs '${args.docs}': ${err.message}\n`)
    process.exit(2)
}

const files = await findMarkdownFiles(docsRoot)

// schemaName → { sources: [path...], stats: rootStat }
const groups = new Map()
const noDispatch = []                            // docs missing the dispatch field
const noFrontmatter = []                         // docs missing front-matter

for (const file of files) {
    let source
    try { source = await readFile(file, 'utf8') }
    catch { continue }
    const fm = parseFrontmatter(source)
    if (!fm) { noFrontmatter.push(file); continue }
    const wrappedFm = { meta: fm }       // expose front-matter as `meta.*` so key path matches mikser's runtime shape
    const dispatchValue = lookup(wrappedFm, args.key)
    if (!dispatchValue || typeof dispatchValue !== 'string') {
        noDispatch.push(file); continue
    }
    if (!groups.has(dispatchValue)) {
        groups.set(dispatchValue, {
            sources: [],
            stats: newFieldStat(),
        })
    }
    const g = groups.get(dispatchValue)
    g.sources.push(path.relative(docsRoot, file))
    recordValue(g.stats, fm)
}

const schemas = {}
for (const [name, g] of groups.entries()) {
    const groupSize = g.stats.seen
    const inferred = inferField(g.stats, groupSize)
    // The root of every group is an object: roll up its fields directly.
    schemas[name] = {
        documents: g.sources,
        documentCount: groupSize,
        fields: inferred.fields ?? {},
    }
}

const report = {
    docsFolder: path.relative(process.cwd(), docsRoot),
    schemaKey: args.key,
    totals: {
        documentsScanned: files.length,
        documentsGrouped: [...groups.values()].reduce((n, g) => n + g.sources.length, 0),
        schemasInferred: groups.size,
        skippedNoFrontmatter: noFrontmatter.length,
        skippedNoDispatchValue: noDispatch.length,
    },
    schemas,
    warnings: {
        noFrontmatter: noFrontmatter.map(f => path.relative(docsRoot, f)),
        noDispatchValue: noDispatch.map(f => path.relative(docsRoot, f)),
    },
}

const out = JSON.stringify(report, null, 2)
if (args.out) await writeFile(args.out, out, 'utf8')
else process.stdout.write(out + '\n')

function parseArgs(argv) {
    const out = {}
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--docs') out.docs = argv[++i]
        else if (a === '--key') out.key = argv[++i]
        else if (a === '--out') out.out = argv[++i]
    }
    return out
}
