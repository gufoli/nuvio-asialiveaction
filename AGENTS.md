# Working agreement

- The repository is the source of truth; keep provider and manifest versions synchronized.
- User contributes device testing; handle source edits, verification and GitHub updates here.
- Reproduce failures with minimal fixtures before fixing them; test backend behavior and real outputs.
- Retain strict TMDB/type/season/episode identity. Do not fall back to loose title matches.
- Keep this small plugin dependency-free unless a concrete tested need justifies a dependency.
- Bound requests, embed traversal and result sizes. Never execute downloaded JavaScript.
- Do not put keys, cookies, signed URLs or raw response bodies in logs, fixtures or commits.
- Diagnostic information is never a playable stream.
- Run `npm run check` before publishing. Distinguish offline tests, live HTTP evidence and device playback.
- Record current limitations in AUDIT.md; user-facing testing belongs in TESTER.md.
