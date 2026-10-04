# 原创演示素材

## 社区题目四张封面（2026-10-04）

- 橘子推销、掠海长航、深海启航、破碎墙壁使用内置 imagegen 独立生成，题库大图与目录缩略图共用。站点文件位于 `public/art/prompt-cover-q-*.webp`，1200×800，合计约 548KB；不写作品或共享题目记录。
- 完整提示词与路径见 [生成记录](artwork/2026-10-04-community-covers.md)。真实 Tabbit 检查四题大小图映射、图片解码均通过，并目检页面截图；typecheck/lint/build:check 通过。

生成方式：内置 imagegen；每个素材一次生成。原始大小均为 1536 × 1024，站点使用 WebP 压缩版。

## A / public/art/signal-a.webp

Use case: stylized-concept
Asset type: premium AI-art comparison game content illustration, artwork A.
Primary request: 在世界尽头，建造一座孤独的信号站。
Scene/backdrop: a remote turquoise ocean at the edge of the world, monumental steep ocean cliffs disappearing into cinematic sun haze under a very pale expansive sky.
Subject: one isolated brutalist radio observatory tower rising from a cliff, muted blue-gray and cyan architecture, intricate believable industrial details, narrow bridges and antennas, a single red-orange signal light at its crown, one tiny lone human figure for scale.
Style/medium: exceptionally beautiful premium anime science-fiction game environmental concept painting, sophisticated illustrative brushwork, carefully designed hard-surface architecture, fine cinematic atmosphere.
Composition/framing: landscape 1536x1024, approximately 3:2. Strong clear focal subject, monumental tower in three-quarter view with dramatic vertical scale, ample ocean and sky, compelling diagonal cliff silhouettes. Artwork fills entire frame.
Lighting/mood: quiet, lonely, sublime, cinematic sunlight diffused through sea haze, restrained contrasts with crisp architectural focal details.
Constraints: no text, no letters, no logos, no watermark, no borders, no UI. One finished original artwork only.

## B / public/art/signal-b.webp

Use case: stylized-concept
Asset type: premium AI-art comparison game content illustration, artwork B.
Primary request: 在世界尽头，建造一座孤独的信号站。
Scene/backdrop: a lonely basalt rock outcrop high above an immense ocean and cloud sea at golden sunset, distant cliffs receding into luminous mist.
Subject: one lonely angular transmission station with a monumental satellite ring antenna silhouetted against the amber sun; sophisticated angular industrial architecture, copper edge highlights and tiny warm station lights; one tiny explorer on the approach path for scale.
Style/medium: exceptionally beautiful premium anime science-fiction game environmental concept painting, sophisticated illustrative brushwork and exquisite environmental design, cinematic depth and deliberate atmospheric perspective.
Composition/framing: landscape 1536x1024, approximately 3:2. Low wide viewpoint from a cool dark foreground basalt ridge with tiny explorer, looking toward the massive ring antenna across the gulf; grand readable ring silhouette offset against sunset with layered cloud ocean and immense scale. Artwork fills entire frame.
Lighting/mood: sublime solitude at the world's edge, amber sunset and glowing copper highlights, cool dark foreground, soft light rays through marine haze.
Constraints: no text, no letters, no logos, no watermark, no borders, no UI. One finished original artwork only.

## 网页共同背景 / public/art/lunar.webp

Use case: stylized-concept
Asset type: shared landscape background artwork for two premium lunar travel agency homepage designs.
Primary request: a breathtaking premium cinematic Moon surface artwork with editorial photographic realism.
Scene/backdrop: lunar crater ridges and finely detailed regolith in the lower 40% foreground, deep black delicately starry sky occupying the upper 60%, a small luminous planet Earth floating above the horizon in the right half.
Subject: one tiny astronaut standing on the left third of the lunar landscape, emphasizing the immense scale and quiet wonder of space tourism.
Style/medium: refined cinematic space tourism editorial image, photographic realism with a sophisticated stylized color grade.
Composition/framing: 1536x1024 landscape, approximately 3:2. Wide open composition, low ridged lunar horizon, restrained scenery and spacious dark sky.
Lighting/mood: grazing sunlight and delicate rim lighting, restrained icy blue and warm cream highlights on crater ridges, sublime quiet and awe.
Constraints: no text, no letters, no UI, no logos, no watermark, no border. Exactly one finished image.

## 提示词库封面（2026-09-12）

- 当前文件：`public/art/prompt-covers-natural.webp`，1254 × 1254，285282 字节；内置 imagegen 编辑生成，FFmpeg 仅做 WebP 格式压缩（quality 88），无额外调色。2 列 × 4 行图集，各格为 2:1；第一格不使用，002–007 对应第二至第七格，新增题目使用末格通用纸张。原始 PNG 保留在生成工具目录。
- 参考：实际浏览「新建文件夹/004/gpt-5.6-cyber」「005/gpt-6-astra」「006/gpt-6-astra」后，以浏览器截图作为参考图。封面为题目意象，非参赛作品。
- 最终生成规格：保持八格布局；禁止统一橄榄绿滤镜、瓷器摆件质感、文字及 UI。最后来信改为停电城市窗前、金属机械手与信纸、暖台灯和冷蓝夜色；月球为自然灰白与黑色太空；古建为可见方块构成的红墙青瓦、晨昏天空；山水为明确体素山体、青蓝瀑布、方块云、自然植被和桃色晨光；户外为橙色冲锋衣背包客与灰色山峰；黑洞保留原透镜构图，仅改为橙金吸积盘、白热内缘和黑色星空；末格为白纸和中性深灰背景。
- 第一版统一绿调与玩偶机器人已弃用（决策 047），无生产引用。
- `public/art/pelican-cover.html`：复用 `public/works/pelican-cycle.html` 的 HTML/SVG 海岸骑行演示，只去页眉、调整封面内取景与暂停按钮布局，保留 CSS 骑行动画与 reduced-motion。使用仅 `allow-scripts` 的独立 iframe；用户原始目录与参赛作品均未改。

## 008「相遇之后」封面（2026-09-21）

- 站点文件：`public/art/prompt-cover-008.webp`，1774 × 887，196516 字节；内置 imagegen 生成，FFmpeg 仅转 WebP（quality 88），无二次调色或裁切。
- 原始生成文件：`C:/Users/hyc/.codex/generated_images/01a093f9-9338-77d3-a693-7e8c0f01edba/exec-c8d588f4-e452-4907-ba6e-f9a419036e38.png`。
- 最终提示词：

```text
Use case: photorealistic-natural
Asset type: 2:1 website prompt-library cover image
Primary request: a quiet, restrained late-night scene suggesting an intimate emotional conversation without showing any person
Scene/backdrop: rain running down a dark apartment window; distant city lights outside are softly out of focus; a modest desk directly beside the window
Subject: an open laptop on the desk with its screen turned away enough that no interface or text is readable, a closed paper notebook and a plain ceramic mug nearby
Style/medium: natural low-light photography, realistic everyday textures, subtle fine film grain, understated contemporary editorial photograph
Composition/framing: wide horizontal composition designed for a 2:1 crop; viewed slightly from behind and above the desk; the rain-lit window occupies most of the frame; laptop and notebook form a quiet foreground anchor; no person
Lighting/mood: muted blue-gray rain light with one small warm practical lamp reflection; lonely but calm, intimate, contemplative; low contrast with preserved shadow detail
Color palette: restrained charcoal, slate blue, rain gray, a very small amount of warm amber; natural colors, no green cast
Constraints: no readable text, no chat bubbles, no visible brands, no logos, no watermark, no people, no hands, no melodramatic props, no neon cyberpunk lighting, no excessive bokeh, no oversaturated colors
Avoid: AI fantasy look, staged stock-photo polish, dramatic cinematic teal-orange grading, sentimental clichés
```

## 009–014、016、018–027 封面（2026-10-01）

- 内置 image_gen 每题独立生成，共 17 张；保留题材本色与原有 001–008 封面。新图仅作题目意象，不是参赛作品，也不写入作品数据包。
- 交付：`public/art/prompt-cover-<题号>.webp`，2:1，合计 4,756,442 字节。FFmpeg 仅转 WebP（quality 88、compression_level 6），无调色、裁切或拼接。
- 大封面和目录缩略图共用 `app/prompt-library.tsx` 的映射；未配置题号继续使用通用纸张兜底。17 图的 2:1 尺寸、浏览器解码、大小图一致性及纸/墨 × 1440/390 页面回归通过，图片总览与页面截图已目检。
- [完整生成提示词及原图文件名](artwork/2026-10-01-prompt-covers.md)。原始 PNG 位于本机 `C:/Users/Atmeplz/.codex/generated_images/01a0f66f-cebd-7ed0-9f35-c6cf54bcb4b7/`；本地核对总览 `output/release-readiness-20261001/covers-all.png`。
