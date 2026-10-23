---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0007 — The Project document is portable versioned JSON in a local library

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `35a3596`

## Context

A Project has to be saved somewhere, and the product will one day move Projects to a server.

## Decision drivers

- The editor's load and save paths should not change shape when Projects move to the server.
- No second source of truth to reconcile the moment cloud storage arrives.

## Considered options

1. **Plain JSON with a schema version, saved automatically into a local library (IndexedDB)** that the app lists and opens.
2. **A user-managed project file** — would mean reconciling two sources of truth the moment cloud storage arrives.

## Decision outcome

**Chosen:** Option 1, a portable versioned document in a local library.

A Project is a plain JSON document carrying a schema version, saved automatically into a local library (IndexedDB) that the app lists and opens — it is not a file the user manages. Nothing device-specific goes inside it: local file handles live in the separate link table described in ADR 0005. The library is deliberately shaped like the backend that will replace it. When Projects move to the server, the same document with the same id is stored elsewhere; the editor's load and save paths do not change shape.

## Consequences

**Positive**
- None recorded in the original ADR.

**Negative**
- Work lives in browser storage, so clearing site data destroys it. Export/import of a Project as a file is a real product need, just not the primary storage model.

**Neutral**
- Every change to the document's shape needs a migration keyed off the schema version, from the first release. Projects that only ever lived in a browser are not disposable.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §8
- Related ADR: [0005](./0005-sources-are-referenced-never-copied.md), [0011](./0011-saves-follow-the-gesture-and-commit-explicitly.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 35a3596:docs/adr/0007-project-document-is-portable-versioned-json.md`
