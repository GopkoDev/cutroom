# Data-model audit — import-play-export (2026-10-23)

This audit was written during the SDD migration, against the code at `53f38c4` (the application
code of `a49c7f8`).

- **Staged migrations:** none. The repository has no SQL database and no migration tool, so there
  is nothing to stage under `docs/features/import-play-export/migrations/`. Persistence follows two
  conventions instead:
  - The Project Document shape is versioned by `schemaVersion`, and changes go through the code
    ladder in `packages/model/src/document/migrate.ts`. `CURRENT_SCHEMA_VERSION = 1`
    (`packages/model/src/document/types.ts:30`), and the ladder holds one migration, 0 → 1.
  - The IndexedDB store shape is versioned separately: database `cutroom` v1, with ordered
    `if (from < n)` upgrade blocks (`apps/editor/src/storage/db.ts:24,34,79`).
- **Promote-time hint:** N/A. The next document shape change is schema version 2, a new rung keyed
  `1` in `migrate.ts`. The next store change is database version 2.
- **Convention deviations:** none. The data model follows the repository's own conventions:
  - in-line keys only;
  - no secondary index (deliberately, see data-model.md §Indexes);
  - unknown fields refused;
  - nothing device-specific inside the document.
- **Drift (domain types ↔ data-model.md):** every field in data-model.md §Entities matches
  `packages/model/src/document/types.ts:41-130`:
  - `Project`: `schemaVersion`, `id`, `name`, `createdAt`, `modifiedAt`, `timebase`, `frameSize`,
    `sources`, `timeline`;
  - `Source`: `id`, `name`, `address`, `fingerprint`, `duration`, `timebase`, `dimensions`,
    `hasAudio`, `codecs`;
  - `Timeline`: `tracks`, `durationFrames`;
  - `Track`: `id`, `kind`, `name`, `clips`;
  - `Clip`: `id`, `sourceId`, `startFrame`, `durationFrames`, `sourceInPoint`.

  There is no field-without-column, no column-without-field, and no type or nullability mismatch.
  The link-table record `{ sourceId, handle }` matches `apps/editor/src/storage/db.ts:52-55`.
- **Breaking-change decompositions:** none in this slice.
- **Open item:** the time space of `Clip.sourceInPoint` is undecided. It is spec §8, and an ADR is
  due before trimming lands.
