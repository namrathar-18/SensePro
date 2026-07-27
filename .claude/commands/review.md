Review the current diff (git diff main...HEAD) as a strict senior engineer:
1) Check against the invariants in CLAUDE.md (privacy tiers, no per-student engagement, embeddings-only, contract conformance).
2) Flag missing tests for any logic change.
3) Flag any new dependency or architectural drift (module ceiling = 10).
Output: blocking issues, then nits. Do not change code unless I say so.
