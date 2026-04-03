# Metadata Reconciliation System Plan

## Context

Comics in the library can have metadata from multiple sources: ComicVine, Metron, GCD, LOCG, ComicInfo.xml, Shortboxed, Marvel, DC, and Manual. The existing `canonicalMetadata` + `sourcedMetadata` architecture already stores raw per-source data and has a resolution algorithm, but there's no way for a user to interactively compare and cherry-pick values across sources field-by-field. This plan adds that manual reconciliation workflow (Phase 1) and lays the groundwork for ranked auto-resolution (Phase 2).

---

## Current State (what already exists)

- `sourcedMetadata.{comicvine,metron,gcd,locg,comicInfo}` — raw per-source data (Mongoose Mixed) — **Shortboxed, Marvel, DC not yet added**
- `canonicalMetadata` — resolved truth, each field is `{ value, provenance, userOverride }`
- `analyzeMetadataConflicts(comicId)` GraphQL query — conflict view for 5 fields only
- `setMetadataField(comicId, field, value)` — stores MANUAL override with raw string
- `resolveMetadata(comicId)` / `bulkResolveMetadata(comicIds)` — trigger auto-resolution
- `previewCanonicalMetadata(comicId, preferences)` — dry run
- `buildCanonicalMetadata()` in `utils/metadata.resolution.utils.ts` — covers only 7 fields
- `UserPreferences` model with `sourcePriorities`, `conflictResolution`, `autoMerge`
- `updateUserPreferences` resolver — fully implemented
- `autoResolveMetadata()` in `services/graphql.service.ts` — exists but only for scalar triggers

---

## Phase 1: Manual Cherry-Pick Reconciliation

### Goal
For any comic, a user can open a comparison table: each row is a canonical field, each column is a source. They click a cell to "pick" that source's value for that field. The result is stored as `canonicalMetadata.<field>` with the original source's provenance intact and `userOverride: true` to prevent future auto-resolution from overwriting it.

### Expand `MetadataSource` enum (`models/comic.model.ts` + `models/graphql/typedef.ts`)

Add new sources to the enum:

```ts
enum MetadataSource {
  COMICVINE       = "comicvine",
  METRON          = "metron",
  GRAND_COMICS_DATABASE = "gcd",
  LOCG            = "locg",
  COMICINFO_XML   = "comicinfo",
  SHORTBOXED      = "shortboxed",
  MARVEL          = "marvel",
  DC              = "dc",
  MANUAL          = "manual",
}
```

Also add to `sourcedMetadata` in `ComicSchema` (`models/comic.model.ts`):
```ts
shortboxed: { type: mongoose.Schema.Types.Mixed, default: {} },
marvel:     { type: mongoose.Schema.Types.Mixed, default: {} },
dc:         { type: mongoose.Schema.Types.Mixed, default: {} },
```

And in GraphQL schema enum:
```graphql
enum MetadataSource {
  COMICVINE
  METRON
  GRAND_COMICS_DATABASE
  LOCG
  COMICINFO_XML
  SHORTBOXED
  MARVEL
  DC
  MANUAL
}
```

> **Note:** Shortboxed, Marvel, and DC field paths in `SOURCE_FIELD_PATHS` will be stubs (`{}`) until those integrations are built. The comparison view will simply show no data for those sources until then — no breaking changes.

---

### New types (GraphQL — `models/graphql/typedef.ts`)

```graphql
# One source's value for a single field
type SourceFieldValue {
  source: MetadataSource!
  value: JSON            # null if source has no value for this field
  confidence: Float
  fetchedAt: String
  url: String
}

# All sources' values for a single canonical field
type MetadataFieldComparison {
  field: String!
  currentCanonical: MetadataField  # what is currently resolved
  sourcedValues: [SourceFieldValue!]!  # one entry per source that has data
  hasConflict: Boolean!            # true if >1 source has a different value
}

type MetadataComparisonView {
  comicId: ID!
  comparisons: [MetadataFieldComparison!]!
}
```

Add to `Query`:
```graphql
getMetadataComparisonView(comicId: ID!): MetadataComparisonView!
```

Add to `Mutation`:
```graphql
# Cherry-pick a single field from a named source
pickFieldFromSource(comicId: ID!, field: String!, source: MetadataSource!): Comic!

# Batch cherry-pick multiple fields at once
batchPickFieldsFromSources(
  comicId: ID!
  picks: [FieldSourcePick!]!
): Comic!

input FieldSourcePick {
  field: String!
  source: MetadataSource!
}
```

### Changes to `utils/metadata.resolution.utils.ts`

Add `SOURCE_FIELD_PATHS` — a complete mapping of every canonical field to its path in each sourced-metadata blob:

```ts
export const SOURCE_FIELD_PATHS: Record<
  string,         // canonical field name
  Partial<Record<MetadataSource, string>>  // source → dot-path in sourcedMetadata[source]
> = {
  title:         { comicvine: "name", metron: "name", comicinfo: "Title", locg: "name" },
  series:        { comicvine: "volumeInformation.name", comicinfo: "Series" },
  issueNumber:   { comicvine: "issue_number", metron: "number", comicinfo: "Number" },
  publisher:     { comicvine: "volumeInformation.publisher.name", locg: "publisher", comicinfo: "Publisher" },
  coverDate:     { comicvine: "cover_date", metron: "cover_date", comicinfo: "CoverDate" },
  description:   { comicvine: "description", locg: "description", comicinfo: "Summary" },
  pageCount:     { comicinfo: "PageCount", metron: "page_count" },
  ageRating:     { comicinfo: "AgeRating", metron: "rating.name" },
  format:        { metron: "series.series_type.name", comicinfo: "Format" },
  // creators → array field, handled separately
  storyArcs:     { comicvine: "story_arc_credits", metron: "arcs", comicinfo: "StoryArc" },
  characters:    { comicvine: "character_credits", metron: "characters", comicinfo: "Characters" },
  teams:         { comicvine: "team_credits", metron: "teams", comicinfo: "Teams" },
  locations:     { comicvine: "location_credits", metron: "locations", comicinfo: "Locations" },
  genres:        { metron: "series.genres", comicinfo: "Genre" },
  tags:          { comicinfo: "Tags" },
  communityRating: { locg: "rating" },
  coverImage:    { comicvine: "image.original_url", locg: "cover", metron: "image" },
  // Shortboxed, Marvel, DC — paths TBD when integrations are built
  // shortboxed: {},  marvel: {},  dc: {}
};
```

Add `extractAllSourceValues(field, sourcedMetadata)` — returns `SourceFieldValue[]` for every source that has a non-null value for the given field.

Update `buildCanonicalMetadata()` to use `SOURCE_FIELD_PATHS` instead of the hard-coded 7-field mapping. This single source of truth drives both auto-resolve and the comparison view.

### Changes to `models/graphql/resolvers.ts`

**`getMetadataComparisonView` resolver:**
- Fetch comic by ID
- For each key in `SOURCE_FIELD_PATHS`, call `extractAllSourceValues()`
- Return the comparison array with `hasConflict` flag
- Include `currentCanonical` from `comic.canonicalMetadata[field]` if it exists

**`pickFieldFromSource` resolver:**
- Fetch comic, validate source has a value for the field
- Extract value + provenance from `sourcedMetadata[source]` via `SOURCE_FIELD_PATHS`
- Write to `canonicalMetadata[field]` with original source provenance + `userOverride: true`
- Save and return comic

**`batchPickFieldsFromSources` resolver:**
- Same as above but iterate over `picks[]`, do a single `comic.save()`

### Changes to `services/library.service.ts`

Add Moleculer actions that delegate to GraphQL:

```ts
getMetadataComparisonView: {
  rest: "POST /getMetadataComparisonView",
  async handler(ctx) { /* call GraphQL query */ }
},
pickFieldFromSource: {
  rest: "POST /pickFieldFromSource",
  async handler(ctx) { /* call GraphQL mutation */ }
},
batchPickFieldsFromSources: {
  rest: "POST /batchPickFieldsFromSources",
  async handler(ctx) { /* call GraphQL mutation */ }
},
```

### Changes to `utils/import.graphql.utils.ts`

Add three helper functions mirroring the pattern of existing utils:
- `getMetadataComparisonViewViaGraphQL(broker, comicId)`
- `pickFieldFromSourceViaGraphQL(broker, comicId, field, source)`
- `batchPickFieldsFromSourcesViaGraphQL(broker, comicId, picks)`

---

## Architectural Guidance: GraphQL vs REST

The project has two distinct patterns — use the right one:

| Type of operation | Pattern |
|---|---|
| Complex metadata logic (resolution, provenance, conflict analysis) | **GraphQL mutation/query** in `typedef.ts` + `resolvers.ts` |
| User-facing operation the UI calls | **REST action** in `library.service.ts` → delegates to GraphQL via `broker.call("graphql.graphql", {...})` |
| Pure acquisition tracking (no resolution) | Direct DB write in `library.service.ts`, no GraphQL needed |

**All three new reconciliation operations** (`getMetadataComparisonView`, `pickFieldFromSource`, `batchPickFieldsFromSources`) follow the first two rows: GraphQL for the logic + REST wrapper for UI consumption.

### Gap: `applyComicVineMetadata` bypasses canonicalMetadata

Currently `library.applyComicVineMetadata` writes directly to `sourcedMetadata.comicvine` in MongoDB without triggering `buildCanonicalMetadata`. This means `canonicalMetadata` goes stale when ComicVine data is applied.

The fix: change `applyComicVineMetadata` to call the existing `updateSourcedMetadata` GraphQL mutation instead of the direct DB write. `updateSourcedMetadata` already triggers re-resolution via `autoMerge.onMetadataUpdate`.

**File**: `services/library.service.ts` lines ~937–990 (applyComicVineMetadata handler)
**Change**: Replace direct `Comic.findByIdAndUpdate` with `broker.call("graphql.graphql", { query: updateSourcedMetadataMutation, ... })`

---

## Phase 2: Source Ranking + AutoResolve (design — not implementing yet)

The infrastructure already exists:
- `UserPreferences.sourcePriorities[]` with per-source `priority` (1=highest)
- `conflictResolution` strategy enum (PRIORITY, CONFIDENCE, RECENCY, HYBRID, MANUAL)
- `autoMerge.enabled / onImport / onMetadataUpdate`
- `updateUserPreferences` resolver

When this phase is implemented, the additions will be:
1. A "re-resolve all comics" action triggered when source priorities change (`POST /reResolveAllWithPreferences`)
2. `autoResolveMetadata` in graphql.service.ts wired to call `resolveMetadata` on save rather than only on import/update hooks
3. Field-specific source overrides UI (the `fieldOverrides` Map in `SourcePrioritySchema` is already modeled)

---

## TDD Approach

Each step follows Red → Green → Refactor:
1. Write failing spec(s) for the unit being built
2. Implement the minimum code to make them pass
3. Refactor if needed

**Test framework:** Jest + ts-jest (configured in `package.json`, zero existing tests — these will be the first)
**File convention:** `*.spec.ts` alongside the source file (e.g., `utils/metadata.resolution.utils.spec.ts`)
**No DB needed for unit tests** — mock `Comic.findById` etc. with `jest.spyOn` / `jest.mock`

---

## Implementation Order

### Step 1 — Utility layer (prerequisite for everything)
**Write first:** `utils/metadata.resolution.utils.spec.ts`
- `SOURCE_FIELD_PATHS` has entries for all canonical fields
- `extractAllSourceValues("title", { comicvine: { name: "A" }, metron: { name: "B" } })` returns 2 entries with correct source + value
- `extractAllSourceValues` returns empty array when no source has the field
- `buildCanonicalMetadata()` covers all fields in `SOURCE_FIELD_PATHS` (not just 7)
- `buildCanonicalMetadata()` never overwrites fields with `userOverride: true`

**Then implement:**
- `models/comic.model.ts` — add `SHORTBOXED`, `MARVEL`, `DC` to `MetadataSource` enum; add 3 new `sourcedMetadata` fields
- `models/userpreferences.model.ts` — add SHORTBOXED (priority 7), MARVEL (8), DC (9) to default `sourcePriorities`
- `utils/metadata.resolution.utils.ts` — add `SOURCE_FIELD_PATHS`, `extractAllSourceValues()`, rewrite `buildCanonicalMetadata()`

### Step 2 — GraphQL schema (no tests — type definitions only)
**`models/graphql/typedef.ts`**
- Expand `MetadataSource` enum (add SHORTBOXED, MARVEL, DC)
- Add `SourceFieldValue`, `MetadataFieldComparison`, `MetadataComparisonView`, `FieldSourcePick` types
- Add `getMetadataComparisonView` to `Query`
- Add `pickFieldFromSource`, `batchPickFieldsFromSources` to `Mutation`

### Step 3 — GraphQL resolvers
**Write first:** `models/graphql/resolvers.spec.ts`
- `getMetadataComparisonView`: returns one entry per field in `SOURCE_FIELD_PATHS`; `hasConflict` true when sources disagree; `currentCanonical` reflects DB state
- `pickFieldFromSource`: sets field with source provenance + `userOverride: true`; throws when source has no value
- `batchPickFieldsFromSources`: applies all picks in a single save
- `applyComicVineMetadata` fix: calls `updateSourcedMetadata` mutation (not direct DB write)

**Then implement:** `models/graphql/resolvers.ts`

### Step 4 — GraphQL util helpers
**Write first:** `utils/import.graphql.utils.spec.ts`
- Each helper calls `broker.call("graphql.graphql", ...)` with correct query/variables
- GraphQL errors are propagated

**Then implement:** `utils/import.graphql.utils.ts`

### Step 5 — REST surface
**Write first:** `services/library.service.spec.ts`
- Each action delegates to the correct GraphQL util helper
- Context params pass through correctly

**Then implement:** `services/library.service.ts`

---

## Critical Files

| File | Step | Change |
|---|---|---|
| `models/comic.model.ts` | 1 | Add `SHORTBOXED`, `MARVEL`, `DC` to `MetadataSource` enum; add 3 new `sourcedMetadata` fields |
| `models/userpreferences.model.ts` | 1 | Add SHORTBOXED (priority 7), MARVEL (8), DC (9) to default `sourcePriorities` |
| `utils/metadata.resolution.utils.ts` | 1 | Add `SOURCE_FIELD_PATHS`, `extractAllSourceValues()`; rewrite `buildCanonicalMetadata()` |
| `models/graphql/typedef.ts` | 2 | Expand `MetadataSource` enum; add 4 new types + query + 2 mutations |
| `models/graphql/resolvers.ts` | 3 | Implement 3 resolvers + fix `applyComicVineMetadata` |
| `utils/import.graphql.utils.ts` | 4 | Add 3 GraphQL util functions |
| `services/library.service.ts` | 5 | Add 3 Moleculer REST actions |

---

## Reusable Existing Code

- `resolveMetadataField()` in `utils/metadata.resolution.utils.ts` — reused inside `buildCanonicalMetadata()`
- `getNestedValue()` in same file — reused in `extractAllSourceValues()`
- `convertPreferences()` in `models/graphql/resolvers.ts` — reused in `getMetadataComparisonView`
- `autoResolveMetadata()` in `services/graphql.service.ts` — called after `pickFieldFromSource` if `autoMerge.onMetadataUpdate` is true

---

## Verification

1. **Unit**: `extractAllSourceValues("title", { comicvine: { name: "A" }, metron: { name: "B" } })` → 2 entries with correct provenance
2. **GraphQL**: `getMetadataComparisonView(comicId)` on a comic with comicvine + comicInfo data → all fields populated
3. **Cherry-pick**: `pickFieldFromSource(comicId, "title", COMICVINE)` → `canonicalMetadata.title.provenance.source == "comicvine"` and `userOverride == true`
4. **Batch**: `batchPickFieldsFromSources` with 3 fields → single DB write, all 3 updated
5. **Lock**: After cherry-picking, `resolveMetadata(comicId)` must NOT overwrite picked fields (`userOverride: true` takes priority)
6. **REST**: `POST /api/library/getMetadataComparisonView` returns expected JSON
