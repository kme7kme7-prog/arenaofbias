# 2026-10-15 · Add Fable tank

- Owner: kme7kme7-prog. Scope: supplied final Fable bot and registration only; local benchmark tool remains separate.
- Identity: Claude Fable 5.1, reasoning High; tank kestrel (red kestrel), final entries/kestrel/bot.js. Archive also contains vortex and baselines; these are excluded.
- Source SHA-256: 40cd26bfdf5a467cbf998c60ad56763b19d710cc05b0af7cd56d6ae1445d3b46. Original 25,512 bytes preserved. Separate Royale copy changes only geometry assumptions.
- Checks: 15 core checks and 22-bot legacy/persistent/large-map port checker passed. Isolated production build precedes release.
- Decisions: source identity follows user and strategy.md; preserve other submissions. No strategy tuning or training pack change.
- Deployment: incremental tanks.html plus dependency closure, retain all other live assets and backend/database; keep rollback directory and public hash evidence in .local/fable-release-20261015.
- Unrelated dirty files and local benchmark are excluded. Full tournament is not run by this release.
