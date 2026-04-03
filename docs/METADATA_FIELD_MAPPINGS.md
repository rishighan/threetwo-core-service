# Metadata Field Mappings

Maps each canonical field to the dot-path where its value lives inside `sourcedMetadata.<source>`.

Used by `SOURCE_FIELD_PATHS` in `utils/metadata.resolution.utils.ts` and drives both the auto-resolution algorithm and the cherry-pick comparison view.

Dot-notation paths are relative to `sourcedMetadata.<source>`
(e.g. `volumeInformation.name` → `comic.sourcedMetadata.comicvine.volumeInformation.name`).

---

## Source API Notes

| Source | API | Auth | Notes |
|---|---|---|---|
| ComicVine | `https://comicvine.gamespot.com/api/` | Free API key | Covers Marvel, DC, and independents |
| Metron | `https://metron.cloud/api/` | Free account | Modern community DB, growing |
| GCD | `https://www.comics.org/api/` | None | Creators/characters live inside `story_set[]`, not top-level |
| LOCG | `https://leagueofcomicgeeks.com` | No public API | Scraped or partner access |
| ComicInfo.xml | Embedded in archive | N/A | ComicRack standard |
| Shortboxed | `https://api.shortboxed.com` | Partner key | Release-focused; limited metadata |
| Marvel | `https://gateway.marvel.com/v1/public/` | API key | Official Marvel API |
| DC | No official public API | — | Use ComicVine for DC issues |

---

## Scalar Fields

| Canonical Field | ComicVine | Metron | GCD | LOCG | ComicInfo.xml | Shortboxed | Marvel |
|---|---|---|---|---|---|---|---|
| `title` | `name` | `name` | `title` | `name` | `Title` | `title` | `title` |
| `series` | `volumeInformation.name` | `series.name` | `series_name` | TBD | `Series` | TBD | `series.name` |
| `issueNumber` | `issue_number` | `number` | `number` | TBD | `Number` | TBD | `issueNumber` |
| `volume` | `volume.name` | `series.volume` | `volume` | TBD | `Volume` | TBD | TBD |
| `publisher` | `volumeInformation.publisher.name` | `publisher.name` | `indicia_publisher` | `publisher` | `Publisher` | `publisher` | `"Marvel"` (static) |
| `imprint` | TBD | `imprint.name` | `brand_emblem` | TBD | `Imprint` | TBD | TBD |
| `coverDate` | `cover_date` | `cover_date` | `key_date` | TBD | `CoverDate` | TBD | `dates[onsaleDate].date` |
| `publicationDate` | `store_date` | `store_date` | `on_sale_date` | TBD | TBD | `release_date` | `dates[focDate].date` |
| `description` | `description` | `desc` | `story_set[0].synopsis` | `description` | `Summary` | `description` | `description` |
| `notes` | TBD | TBD | `notes` | TBD | `Notes` | TBD | TBD |
| `pageCount` | TBD | `page_count` | `page_count` | TBD | `PageCount` | TBD | `pageCount` |
| `ageRating` | TBD | `rating.name` | `rating` | TBD | `AgeRating` | TBD | TBD |
| `format` | TBD | `series.series_type.name` | `story_set[0].type` | TBD | `Format` | TBD | `format` |
| `communityRating` | TBD | TBD | TBD | `rating` | TBD | TBD | TBD |
| `coverImage` | `image.original_url` | `image` | `cover` | `cover` | TBD | TBD | `thumbnail.path + "." + thumbnail.extension` |

---

## Array / Nested Fields

GCD creator credits live as free-text strings inside `story_set[0]` (e.g. `"script": "Grant Morrison, Peter Milligan"`), not as structured arrays. These need to be split on commas during mapping.

| Canonical Field | ComicVine | Metron | GCD | LOCG | ComicInfo.xml | Shortboxed | Marvel |
|---|---|---|---|---|---|---|---|
| `creators` (writer) | `person_credits[role=writer]` | `credits[role=writer]` | `story_set[0].script` | TBD | `Writer` | `creators` | `creators.items[role=writer]` |
| `creators` (penciller) | `person_credits[role=penciller]` | `credits[role=penciller]` | `story_set[0].pencils` | TBD | `Penciller` | TBD | `creators.items[role=penciler]` |
| `creators` (inker) | `person_credits[role=inker]` | `credits[role=inker]` | `story_set[0].inks` | TBD | `Inker` | TBD | `creators.items[role=inker]` |
| `creators` (colorist) | `person_credits[role=colorist]` | `credits[role=colorist]` | `story_set[0].colors` | TBD | `Colorist` | TBD | `creators.items[role=colorist]` |
| `creators` (letterer) | `person_credits[role=letterer]` | `credits[role=letterer]` | `story_set[0].letters` | TBD | `Letterer` | TBD | `creators.items[role=letterer]` |
| `creators` (editor) | `person_credits[role=editor]` | `credits[role=editor]` | `story_set[0].editing` | TBD | `Editor` | TBD | `creators.items[role=editor]` |
| `characters` | `character_credits` | `characters` | `story_set[0].characters` | TBD | `Characters` | TBD | `characters.items` |
| `teams` | `team_credits` | `teams` | TBD | TBD | `Teams` | TBD | TBD |
| `locations` | `location_credits` | `locations` | TBD | TBD | `Locations` | TBD | TBD |
| `storyArcs` | `story_arc_credits` | `arcs` | TBD | TBD | `StoryArc` | TBD | `events.items` |
| `stories` | TBD | TBD | `story_set[].title` | TBD | TBD | TBD | `stories.items` |
| `genres` | TBD | `series.genres` | `story_set[0].genre` | TBD | `Genre` | TBD | TBD |
| `tags` | TBD | TBD | `story_set[0].keywords` | TBD | `Tags` | TBD | TBD |
| `universes` | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| `reprints` | TBD | `reprints` | TBD | TBD | TBD | TBD | TBD |
| `urls` | `site_detail_url` | `resource_url` | `api_url` | `url` | TBD | TBD | `urls[type=detail].url` |
| `prices` | `price` | TBD | `price` | `price` | `Price` | `price` | `prices[type=printPrice].price` |
| `externalIDs` | `id` | `id` | `api_url` | TBD | TBD | `diamond_id` | `id` |

---

## Identifiers / GTINs

| Canonical Field | ComicVine | Metron | GCD | LOCG | ComicInfo.xml | Shortboxed | Marvel |
|---|---|---|---|---|---|---|---|
| `gtin.isbn` | TBD | TBD | `isbn` | TBD | TBD | TBD | `isbn` |
| `gtin.upc` | TBD | TBD | `barcode` | TBD | TBD | TBD | `upc` |

---

## Special Mapping Notes

- **DC Comics**: No official public API. DC issue metadata is sourced via **ComicVine** (which has comprehensive DC coverage). There is no separate `dc` source key.
- **GCD creators**: All credit fields (`script`, `pencils`, `inks`, `colors`, `letters`, `editing`) are comma-separated strings inside `story_set[0]`. Mapping code must split these into individual creator objects with roles assigned.
- **GCD characters/genre/keywords**: Also inside `story_set[0]`, not top-level on the issue.
- **Marvel publisher**: Always "Marvel Comics" — can be set as a static value rather than extracted from the API response.
- **Marvel cover image**: Constructed by concatenating `thumbnail.path + "." + thumbnail.extension`.
- **Marvel dates**: Multiple date types in a `dates[]` array — filter by `type == "onsaleDate"` for cover date, `type == "focDate"` for FOC/publication date.
- **Marvel creators/characters**: Nested inside collection objects (`creators.items[]`, `characters.items[]`) with `name` and `role` sub-fields.
- **Shortboxed**: Release-focused service; limited metadata. Best used for `publicationDate`, `price`, and `publisher` only. No series/issue number fields.
- **LOCG**: No public API; fields marked TBD will need to be confirmed when integration is built.
