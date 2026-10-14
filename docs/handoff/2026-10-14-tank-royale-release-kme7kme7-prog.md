# 2026-10-14 · Tank royale release

- Owner: kme7kme7-prog. Scope: tank royale and shared spectator information cards only.
- Goal: publish the approved battle royale mode and compact default-collapsed inspector.
- Changes: separate large-map bot ports, two lives, shrinking arena, survival ranking, random entry seeds, four-player/royale wipe navigation, hover/click inspector in both modes.
- Decisions: original four-player engine and submitted bots remain unchanged; collapsed inspector shows lives, armor and kills; manual expansion exposes full details.
- Verification: 31 engine checks, motion/state checks, 21 port compatibility checks, targeted lint, typecheck and build passed. Eleven inspector browser groups passed. Real 21-bot matches on 42/58 maps and fourteen layout/theme scenarios passed without runtime errors in this run. Historical vector timeout on a large map was not reproduced; not a universal timing guarantee.
- Release: build isolated approved source; deploy tanks.html and its asset dependency closure only, retain other live entries and hashed assets, preserve rollback and verify public hashes. No backend/database changes.
- Unrelated workspace menu, soup, debate and reference experiments remain excluded.
- Evidence: .local/royale-release-20261014 and .local/royale-qa/final-*.log.
