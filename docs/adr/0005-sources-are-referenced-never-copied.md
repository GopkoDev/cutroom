---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0005 — Sources are addressed, never copied

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `35a3596`

## Context

A Source is a reference to bytes that live somewhere else. Today that is a `FileSystemFileHandle` pointing at the user's own file; later it will also be an object in the product's cloud storage, read over HTTP range requests. The question is whether the product copies those bytes into its own storage.

## Decision drivers

- Not doubling disk usage for the users with the least room to spare.
- Not counting against a storage quota we don't control, and not adding a second copy again on the way out when a long Export has to be staged before download.
- Professional editors have always used the reference model and their users already expect media to live in their own folders.

## Considered options

1. **Address Sources where they live**; our own storage (OPFS) holds only regenerable derived data.
2. **Copy Sources into OPFS** — would make a Project self-contained and remove every permission prompt, but costs the drivers above.

## Decision outcome

**Chosen:** Option 1, Sources are addressed.

We never copy a Source's bytes into browser storage. Our own storage (OPFS) holds only derived data — thumbnails, waveforms, proxies, caches — all regenerable by re-reading the Source.

Because a Source is addressed rather than embedded, the reading side has exactly one shape: whatever the address, it resolves to a byte range reader. A local file and a cloud object differ only in how that reader is obtained — nothing downstream of it (decoding, seeking, Preview, Export) can tell them apart.

### Where the address lives

The Project document stores only a stable Source id, its metadata, and what kind of address it has. It never stores a file handle, so the document stays plain portable JSON that can be uploaded, versioned and reopened on another machine.

Local file handles live in a separate device-local table (IndexedDB) keyed by Source id. That table is never synchronised. A Project opened on a machine that has no entry for a Source shows it as offline and offers to relink it — or fetches it from cloud storage if it is stored there.

## Consequences

**Positive**
- None recorded in the original ADR.

**Negative**
- Reopening a Project with local Sources needs an explicit permission re-grant, which requires a user gesture — it cannot be done silently on load. Relinking a moved file is product surface we must design, not an error case we can hide.
- A Project referencing local files is not portable on its own; one referencing cloud Sources is.

**Neutral**
- Persisted local handles are a Chromium capability. Browsers without them can still edit a session's worth of local files, and once cloud Sources exist they become fully usable with no change to the engine.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §4
- Related ADR: [0006](./0006-chromium-first-cross-browser-comes-from-the-cloud.md), [0007](./0007-project-document-is-portable-versioned-json.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 35a3596:docs/adr/0005-sources-are-referenced-never-copied.md`
