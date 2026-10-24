# Data-model audit — editing (2026-10-23)

This audit was written against `f3d44df` on `feat/editing`.

- **Staged migrations:** none. Editing needs no schema change, so nothing is staged under
  `docs/features/editing/migrations/`, and nothing was written to any live migration path.
  - The Project Document stays at `CURRENT_SCHEMA_VERSION = 1`
    (`packages/model/src/document/types.ts:30`). Version 1 already allows a non-zero In-point, any
    number of Tracks and any number of Clips (ADR 0018, sad §4).
  - IndexedDB stays at database `cutroom` v1 (`apps/editor/src/storage/db.ts:24,34`).
- **Promote-time hint:** N/A. The repository has no SQL and no migration tool
  (`migration_tool: ""`). If a later step changes the document shape, it adds schema version 2 as
  the rung keyed `1` in `packages/model/src/document/migrate.ts`. A store change would be database
  version 2 in `db.ts`.
- **Validation changes (not migrations):** `parseProject` gains two load checks:
  - Source bounds (ADR 0018): `durationFrames ≤ framesForDuration(timebase, Source.duration − sourceInPoint)`;
  - at least one Track.

  Neither can refuse a Project saved by step 1. Step 1 sized every Clip with the same ceiling at
  In-point 0, and always created exactly one Track. A test that loads step-1 Projects pins this
  (data-model.md §Test fixtures, sad §11).
- **Decisions taken in this stage** (owner, 2026-10-23):
  - A Source's beginning is container time 0. This closes the sad §11 open question. AC-02 is
    amended, and the §11 row is downgraded to a Low, closed risk. There is no
    `Source.firstPictureTime` field and no schema version 2.
  - At least one Track is a document invariant, checked on load as well as by `remove-track`. The
    sad §8 Invariants row is updated.
- **Convention deviations:** none. The model follows the repository's conventions:
  - in-line keys only, and no secondary index;
  - ids minted by the editor's injected `newId`, never by the reducer;
  - Frame values are integers, and Source time is touched only through `timebase.ts`;
  - unknown fields are refused.
- **Drift (domain types ↔ data-model.md):** none. Every field named in data-model.md §Entities
  matches `packages/model/src/document/types.ts:96-130`:
  - `Timeline`: `tracks`, `durationFrames`;
  - `Track`: `id`, `kind`, `name`, `clips`;
  - `Clip`: `id`, `sourceId`, `startFrame`, `durationFrames`, `sourceInPoint`;
  - `Source`: read-only here.

  The two new load checks are planned, not drift. Today `parseProject`
  (`packages/model/src/document/parse.ts:311-401`) checks neither of them.
- **Breaking-change decompositions:** none. No field is added, renamed or dropped.
- **Self-check:**
  - naming follows the repo: camelCase JSON fields and glossary terms, with no avoid-list word;
  - reversibility: N/A, since there are no migrations. Every edit is reversible through Immer
    inverse patches (ADR 0004);
  - FK indexes: N/A in IndexedDB. `sourceId` resolution is checked on parse;
  - convention adherence: passes.
- **TBD:** none.

Migrations are not staged, because there are none. `implement` has nothing to promote for this
feature. Next stage: `api editing`, which updates `contracts/public-api.md` with the seven commands,
the refusal reasons and the rule functions.
