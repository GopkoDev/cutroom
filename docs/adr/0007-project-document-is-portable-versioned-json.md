# The Project document is portable versioned JSON in a local library

A Project is a plain JSON document carrying a schema version, saved automatically into a local library (IndexedDB) that the app lists and opens — it is not a file the user manages. Nothing device-specific goes inside it: local file handles live in the separate link table described in ADR 0005.

The library is deliberately shaped like the backend that will replace it. When Projects move to the server, the same document with the same id is stored elsewhere; the editor's load and save paths do not change shape. Choosing a user-managed project file instead would mean reconciling two sources of truth the moment cloud storage arrives.

## Consequences

- Every change to the document's shape needs a migration keyed off the schema version, from the first release. Projects that only ever lived in a browser are not disposable.
- Work lives in browser storage, so clearing site data destroys it. Export/import of a Project as a file is a real product need, just not the primary storage model.
