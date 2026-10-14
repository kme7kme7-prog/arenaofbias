# Royale bot ports

This directory holds isolated Royale-compatible copies of all 22 registered Tank bots. The originals in `app/tanks/bots/` remain unchanged byte-for-byte. `ports.mjs` exports `loadRoyaleSource(entry)`, resolves by `entry.id`, and throws for missing/empty ports; it never falls back to the legacy source.

## Compatibility work

Every bot has been reviewed and minimally adapted for a dynamic NxN map, 2x2 tank bodies, valid top-left coordinates `0..N-2`, dynamic cell/position strides, and the Royale arena schedule where the old code assumed a fixed board or circle. Module-level arrays and memories that depend on map size are resized or reset when the map changes. Seat-specific A-D rotations remain in their original order; extra seats use the existing four-way pattern where the old policy only defined four cases. Attacks, risk choices, pursuit, and supply choices were not retuned for win rate.

- `apex-warden-spark.js` — dynamic grid/position buffers, bounds, scheduled zone projection, and board-scaled patrol anchors.
- `astra-knife.js` — dynamic position indexes and typed buffers, board-scaled patrol anchors and center bias.
- `ghostline-haiku.js` — dynamic ray, position, reverse-search geometry, and board center bias.
- `harrier.js` — dynamic board and cell-buffer dimensions.
- `iron-ambush-luna56.js` — dynamic flood/path geometry, bounds, and center bias; its four patrol quadrants repeat for later seats.
- `kestrel-kimi.js` — dynamic grid/position arrays, board-scaled patrol points and edge threshold, and schedule-based zone projection.
- `ocelot-mimo.js` — dynamic cell and position dimensions.
- `parallax-astra.js` — dynamic route buffers, scaled patrol anchors, and center bias.
- `parallax-opus.js` — dynamic cell/position strides and buffers and board-center fallback; existing 5x5 strategic neighborhood is preserved.
- `peregrine-step5.js` — dynamic flood buffers and resettable per-map memory.
- `polaris-gemini38.js` — dynamic global work arrays, flattened indexes, and board center.
- `raptor-openpangu.js` — dynamic geometry and schedule-based future ring.
- `redline-minimax31.js` — dynamic position buffers, center anchor, schedule-based shrink timing, and safe wall scoring at map edges.
- `rift-harvest-sol56.js` — dynamic ray/BFS geometry, board center bias, and per-map memory.
- `shrike-deepseek.js` — dynamic work arrays and scoreboard-ordered four-seat rotations.
- `shrike26-glm.js` — dynamic map/tank-position dimensions, board-scaled corner respawn estimates, and scheduled next zone.
- `sidecut-grok.js` — dynamic path/safety buffers; original corner-role pattern derives from scoreboard order.
- `tank26.js` — dynamic BFS, board center scoring, and zone geometry; reset per-map memory.
- `vector.js` — dynamic path/threat arrays, board-scaled roaming points and center bias, scoreboard seat rotation modulo four, and zone projection.
- `viper-longcat.js` — dynamic grid/position strides and schedule-driven future rings.
- `vortex-minimax.js` — dynamic position arrays, bounds, and scheduled future rings.

## Validation and limits

Run `node scripts/validate-royale-ports.mjs`. It checks the 21-file boundary against original SHA-256 hashes, compares original and port decisions over eight legacy 26x26 ticks, then compares persistent VM instances for 18 consecutive 26x26 ticks on brick/steel/grass terrain with bullet and supply state. It also runs every port against engine-generated 42x42 and 58x58 states for P27 with 27 opponents, including the empty final ring. A test-only source transform changes catch handlers inside `decide` to rethrow, then reruns persistent complex 26x26 and engine-backed large-map cases; production catch/fallback behavior is unchanged. This detects exceptions that would otherwise become a legal `stay` action. It validates decisions and runtime contracts; it does not measure strategy strength or replace the parent task's real browser Worker battle.

On 26x26 legacy states, the old fixed shrink behavior is retained when no Royale `zoneSchedule` is present. With Royale state, the intentional rules difference is a one-cell boundary contraction every 30 ticks from tick 200 until the ring is empty; the old 60-second/time-based policy assumptions are not converted into a match-ending rule. `arena.totalTicks` is only a natural upper bound. Bot-specific legacy heuristics that explicitly use late-game tick thresholds remain strategy parameters and may activate at different arena phases. These time-based heuristics are preserved for strategy fidelity and are not evidence that the bot has been tuned or that its late-game strength is unchanged.

## 2026-10-15 addition

- `kestrel-fable.js` — Claude Fable 5.1 / High; dynamic map width, 2x2 placement stride, bounds, buffers, next-zone extent and center anchor. Original source bytes are preserved. Same 26x26 decisions and persistent memory, plus 42/58 geometry fixtures, pass the port checker.
