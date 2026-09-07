# 偏见试验场 / BIAS ARENA（VPS 版）
后面估计要改名字 BIAS ARENA有人用了
AI 作品对比演示，目前只有图像、文字、网页三种。
当前交互以提示词为中心：**首页 → 随机竞技场 / 提示词库 → 同提示词的模型结果比较**。
最新页面与数据规则见 [PRODUCT_LOGIC.md](PRODUCT_LOGIC.md)，旧 HANDOFF 中的三题切换流程已由此替代。
本分支（`vps-node`）是把原 Cloudflare Workers + D1 版本改造成**任意 VPS 可部署**
的形态：Vite 单页前端 + Express + SQLite（Node ≥ 22.12，无需外部数据库服务）。

> 原 Cloudflare/Sites 版本保存在 `main` 分支，两个分支互不影响。你问我main分支呢 我也不知道 懒得拿上来了

## 架构

```
浏览器
  └─ Express (:3000)  ── dist/ 静态资源（vite build 产物）
        └── /api/comments ── SQLite（data/comments.db，替代原 D1）
```

## 本地运行

首页位于 `/`
首页提供三类作品的动态预览，并遵循系统的减少动态效果设置。

```powershell
npm install
npm run build        # 产出 dist/
npm start            # http://localhost:3000
```

开发模式（热更新 + 自动重启后端，需要两个端口）：

```powershell
npm run dev          # web:5173（代理 /api → 3000），api:3000
```

## 验证

```powershell
npm run typecheck
npm run lint
npm run validate:arena
npm run validate:scroll
# 另开一个终端先启动 npm start，再执行：
npm run validate:comments
```

`validate:comments` 只访问 localhost，结束后会清掉自己写入 `data/comments.db` 的记录。


## 资源

- 三张演示图片在 `public/art/`（生成提示词记录在 `ARTWORK.md`）
- 主界面与状态机：`app/page.tsx`；视觉与动画：`app/globals.css`；题库：`lib/arena.ts`
- 后端：`server/index.js`（含评论限流与同源校验）
- 评论数据仅存本地 `data/comments.db`，演示支持率仍是固定数据、不连真实投票后端

## 增加新对局（题库扩容）

1. `lib/arena.ts` 的 `prompts` 数组加一题（`id` 为三位数字，如 `004`），在 `modelResults` 中为它添加至少两个不同模型的结果；结果使用同一个 `promptId`；
2. `lib/comments.ts` 校验白名单 `['001','002','003']` 同步加 `'004'`；
3. `server/index.js` 顶部 `ALLOWED_ROUNDS` 同步加 `'004'`；
4. `npm run build` 后重启服务。
