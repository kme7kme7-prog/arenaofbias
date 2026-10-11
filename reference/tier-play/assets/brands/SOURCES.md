# 模型 Logo 来源

复用隔壁 Gallery 已有品牌资产，2026-10-11 从其本地数据包读取；八份文件逐字节复制，没有重绘、改色或修改原仓库。

映射依据 Gallery 数据包的模型注册表，以准确 modelId 对应，记录于本试玩的 brands.json。不复制整个数据包或接入 Gallery 的业务逻辑。

2026-10-12 随随机题扩展到 30 个准确 modelId、11 份原图；新增 `qwen.png`、`mimo.png`、`generic.svg`，均从同一数据包按当前注册表读取。全部 30 条映射与注册表一致，11 份资产字节与来源一致；未重新下载或重绘。生成步骤在 `scripts/prepare-tier-catalog.mjs`。generic.svg 仅用于注册表本来使用通用标志的模型，不推测品牌归属。

下面是原资产说明中的来源记录，未在本轮重新下载或核验网站。Gemini 使用 Gallery 现有的 Google 标志。

| 文件 | 品牌 / 模型 | 官方来源页 | 原记录的资产地址 |
| --- | --- | --- | --- |
| `claude.png` | Claude Opus, Sonnet | https://claude.com/ | https://assets.claude.com/95a868946ac8a31e5ff832e2899f294aa368b836.png?w=128&h=128 |
| `openai.svg` | GPT family, GPT-6 Astra Pro | https://openai.com/brand/ | https://openai.com/favicon.svg |
| `deepseek.ico` | DeepSeek | https://www.deepseek.com/ | https://www.deepseek.com/favicon.ico |
| `google.png` | Gemini / Google | https://gemini.google.com/ | https://www.gstatic.com/images/branding/product/1x/googleg_32dp.png |
| `zai.svg` | GLM / Z.ai | https://z.ai/ (redirects to https://chat.z.ai/) | https://z-cdn.chatglm.cn/z-ai/static/logo.svg |
| `hunyuan.png` | HY3 / Tencent Hunyuan | https://aistudio.tencent.com/ | https://cdn-portal.hunyuan.tencent.com/public/static/logo/favicon.png |
| `kimi.ico` | Kimi / Moonshot AI | https://www.kimi.com/ | https://www.kimi.com/favicon.ico |
| `minimax.ico` | MiniMax | https://www.minimax.io/about | https://www.minimax.io/favicon.ico |

两种页面配色均使用浅色 Logo 底，保留原图颜色；OpenAI 的 SVG 按浅色 color-scheme 显示，导出复用同一图像元素。
