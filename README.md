# 偏见试验场 / BIAS ARENA

以游戏回合和动效为核心的 AI 作品对比演示。包含图像、文字和网页三场对决。

## 体验

- 进入后，作品 A、B 依次移动至中央放大，停留后归位，再开放投票。
- 文章和长网页居中后先停留约 0.5 秒，再按内容高度滚动到底（文章 48px/s、网页 62px/s），末尾停留 1.3 秒后归位。图片保持短暂停留。跳过、重播或切换都会取消滚动并复位。
- 认真盲测隐藏模型身份；娱乐站队提前展示虚构的演示身份。
- 投票包含锁定动画、选择印记、身份揭晓与支持率结算。
- 投票后，对照作品收拢到上方，展开赛后频道；评论带 A/B 阵营标记，按题目保存，刷新后仍可读取。
- 可随时切换作品，跳过或重播入场。切换会取消上一场尚未完成的动画。
- 图片可完整放大；文章可滚动和展开；网页展示由真实 HTML/CSS 构成，展开后可操作演示按钮。
- 音效默认关闭，右上角开启；支持全屏及 A / D 投票、N 换一组、空格跳过入场。
- 适配窄屏，遵循系统减少动态效果设置。

这是精致交互演示，不连接真实模型或投票后端。身份为虚构名称，百分比为固定演示数据，切换后不保存投票。赛后留言通过 D1 按题目持久保存；每道题的 `commentary` 字段单独配置场外旁白，目前在 `lib/arena.ts` 维护，尚未提供后台管理界面。

## 本地运行

```powershell
npm install
npm run build
# 首次运行时初始化本地留言数据库；已初始化后无需重复执行。
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_chunky_micromax.sql
npm run dev
```

## 验证

```powershell
npx tsc --noEmit
npx oxlint app components/afterparty.tsx lib/arena.ts lib/comments.ts lib/database.ts db
node scripts/validate-arena.mjs
node scripts/validate-scroll-tour.mjs
npm run build
```

开发服务器运行期间，可执行 `node scripts/validate-comments.mjs` 检查本地留言接口。脚本只访问 localhost，测试后清除自己产生的本地记录。

全量 `npm run lint` 包含脚手架自带的组件目录，其中存在上游无障碍和 React compiler 规则报错；本次未改动这些供应组件。项目自有代码采用上面的限定范围检查。未执行浏览器自动化测试。

## 资源

三张图片通过内置 imagegen 生成，优化为 WebP 后放在 `public/art/`，无外部图片依赖。最终提示词记录在 `ARTWORK.md`。

主体界面：`app/page.tsx`；视觉与动画：`app/globals.css`；回合状态及内容：`lib/arena.ts`。
