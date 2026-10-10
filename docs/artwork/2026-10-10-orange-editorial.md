# 文字目录：青皮橘子插画（2026-10-10）

- 使用内置 image_gen 生成，透明背景；只用于 5446 magazine 目录的题材封面，不是参赛作品。
- 页面素材：`public/text-scenes/orange-editorial-v1.webp`，1254 × 1254，440426 字节，保留透明通道。
- 原始 PNG：`C:/Users/hyc/.codex/generated_images/01a0f5a0-9a7d-7813-a7e0-84b3b03726c4/exec-2cb78802-dc09-440d-b233-260b0ad857b6.png`，原图保留。
- FFmpeg 仅作 WebP 格式压缩（quality 88、compression_level 6），没有裁切、调色或重新绘制。目录图片懒加载、异步解码并预留尺寸。
- 已目检生成原图及 1440 / 390 页面；820 浏览器布局检查通过。证据 `output/playground/copy-polish/`。

## 最终生成提示词

```text
Use case: illustration-story.
Asset type: a single transparent illustration for a Chinese literary magazine-style website topic cover, displayed small on warm muted butter-yellow paper.
Primary request: one slightly squat, irregular small green-skinned mandarin orange, with one short stem and one simple olive-green leaf. It must read as a mandarin, not a lime or apple: subtle lobes, a gently flattened top, fine dimpled citrus peel, a few ochre-yellow ripe patches. Appealing but modest, a little imperfect.
Style: sophisticated vintage editorial gouache / color-pencil botanical illustration with restrained lithographic grain, soft hand-painted volume, matte pigment, delicate irregular edges. Modern quiet book-cover illustration with tactile paper grain inside the fruit, no heavy distressing. No shiny 3D sphere, no plastic, no photoreal product photo, no thick cartoon outline, no emoji.
Palette: muted chartreuse and moss greens, dull golden ochre, small earthy shadow. Fits cream #f6f2e8, muted yellow #e2d9a1, olive #646b37 and sage editorial design.
Composition: isolated centered single fruit with its leaf, fills about 75 percent of a square canvas, all parts fully visible. Only a faint small soft contact shadow beneath the fruit if useful, also on transparency. Plenty of clean transparent margin. NO paper rectangle, no solid background, no frame, no additional fruit, no slice, no hands, no lettering, no symbols, no watermark.
Background: genuinely transparent alpha.
```
