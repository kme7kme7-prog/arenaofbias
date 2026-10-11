# Menu demo sources

- Current forum preview: Prompt `q-a71a7e7e4bcaadc7`, from `.local/text-themes-review/prompts.json`. The displayed question only normalizes punctuation and phrasing; `forum.json` preserves both the original and displayed question. Reply A is work `up-7e3fqzpy`, GPT-6 Astra; reply B is `up-m1f2e14r`, Claude Opus 5.5. Both texts and model names are verified against `.local/text-themes-review/works.json`; replies are displayed verbatim.
- `play-conversation.svg`: Simple decorative A/B question-and-answer motif authored for the menu cover. It represents the interaction, not an actual AI work or a screenshot. No generated-image attribution is implied.

Work screenshots used by the formal-review preview; earlier letter samples remain at `letters.html`:

- `temple-a.png`: Browser capture of the locally cached public work `dp-004-astra-pro`, “云阙 · 方寸山河”, attributed in the work catalog to GPT-6 Astra Pro. Source `.local/object-stage-library/works/dp-004-astra-pro/`. Captured from its canvas; no new scene was drawn for this menu.
- `temple-b.png`: Existing work thumbnail copied from `data/thumbs/004-claude-fable-5.png`. Work `004-claude-fable-5`, “体素古建筑群 · Voxel Chinese Temple”, catalog attribution Claude Fable 5. Image is a real work screenshot, not a new illustration.
- Text preview: Verified against the existing cached public catalog `.local/text-themes-review/works.json`. A is `up-aze181hz`, GPT-5.6 Luna; B is `up-0zccjcwb`, MiMo V2.6 Pro. Both belong to prompt `q-1b9d4f59c2d7b31e`. Original paragraphs and identifiers are preserved in `letters.json`; the displayed passages are excerpts, with omissions marked, and model names reveal in the signature area.
- `letter-cover.png`: Transparent browser capture of the same letter preview, composed as two sheets for the directory cover. Reproduce with `node scripts/capture-menu-letter-cover.mjs`. Uses the actual preview typography, excerpts and paper styling; no generated substitute work or outside illustration.
- Fonts: Existing locally packaged MiSans and LXGW WenKai Lite; retain their notices in `public/fonts`.

## Twelve-mode collection

- `motif-*.svg`: Reused and statically exported from existing `app/play-menu-art.tsx`. `scripts/export-menu-motifs.mjs` preserves the original shapes, resolves their paper palette and adjusts the viewBox for the small directory covers. These are decorative gameplay motifs, not real match screenshots.
- `motif-event.svg`: The bicycle frame, rider's legs, neck and bill were redrawn in `app/play-menu-art.tsx` on 2026-10-11. The playful pelican-on-a-bicycle theme remains; the right preview is now a question mark because its rules are undecided.
- `pelican-scene.svg`: Earlier illustration extracted from `public/art/pelican-cover.html`. Retained as a previous asset; no longer displayed or included in the main-site bundle.
- `geo-kawaguchi.jpg`: [Fuji Kawaguchi 357.JPG](https://commons.wikimedia.org/wiki/File:Fuji_Kawaguchi_357.JPG), photographed by Marion & Christoph Aistleitner on 19 January 2014. Mount Fuji viewed above Lake Kawaguchi, Japan. Wikimedia Commons identifies this work as [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The local 1280px thumbnail is unmodified; the country, location and year reveal use this source metadata. The source link is also visible below the photo.
- The guess clues, tier cards, tank positions, werewolf identities, territory map, private notebook, debate lines and patch controls are illustrative menu content. They are labeled as examples and are not attributed to an AI model, real score, real match or real security event.

The approved thirteen-mode menu is shared with the main-site `#play` route. Previews do not submit votes. Four existing destinations remain available; the other nine modes are unfinished previews. See the root HANDOFF.md for the release status.

- `motif-reviewjury.svg`: Original code-drawn paper case file and gavel motif added on 2026-10-12. Review jury text is a fictional illustrative appeal, not a real Meituan case or AI verdict.
