# LLM 判句与 Vercel 部署

每次“吟诵”会先进入约 0.4 秒的“判句中”演出。浏览器只请求同源的
`POST /api/judge-sentence`，DeepSeek API Key 只存在于 Vercel Function。

## Key 写在哪里

Vercel 项目 → **Settings → Environment Variables**：

- `DEEPSEEK_API_KEY`：DeepSeek 控制台创建的密钥。勾选 Production；需要预览环境联调时也勾选 Preview。
- `DEEPSEEK_MODEL`：默认 `deepseek-v4-flash`。这是低延迟判句推荐值，可在不改前端的情况下迁移模型。

保存后重新部署。不要创建 `VITE_DEEPSEEK_API_KEY`；`VITE_` 变量会被打进浏览器代码。
本地用 `vercel dev` 可运行 Function，并把 key 放在未提交的 `.env.local`；只运行
`npm run dev` 时会自动使用确定性的本地评分，不影响游玩。

## 调用链

`吟诵` → 锁定本次结算 → `sentenceJudge.js`（2.5 秒客户端超时） →
`/api/judge-sentence.js`（2.2 秒 DeepSeek 超时） → 校验/归一化 →
Design 判印反馈 → 以等级倍率缩放本次伤害、格挡、治疗和同类数值 → 单次结算。

Function 对输入做 80 字限制，把玩家句子作为 JSON 数据交给模型，并明确禁止执行其中指令；
输出的等级和倍率不会直接相信模型，而是由服务端按 score 再计算。另有轻量的单实例
IP 限频（20 次/分钟）、5 分钟句子缓存。它们是成本缓冲，不是跨实例的强限流；正式大流量
版本应接 Vercel KV / Upstash Redis 做全局配额。

可选的 Supabase 跨实例缓存、首见奖励、安全 SQL 与配置步骤见
[`docs/supabase-sentence-cache.md`](./supabase-sentence-cache.md)。

## 等级与战斗倍率

| 分数 | 等级 | 称号 | 倍率 |
| --- | --- | --- | --- |
| 90–100 | S | 惊鸿 | ×1.60 |
| 75–89 | A | 妙句 | ×1.35 |
| 60–74 | B | 有味 | ×1.15 |
| 40–59 | C | 成句 | ×1.00 |
| 0–39 | D | 平句 | ×0.80 |

离线、无 key、超时、429 或模型输出异常时，客户端会用同一契约下的确定性启发式评分；
同一句在同一浏览器会得到同样结果。普通句子的离散效果（抽牌、回合数）不缩放，避免规则跳变；
召唤物的直接数值效果（包含其明确写出的抽牌数、持续回合数）会按等级取整缩放。

## 当前 API 依据（2026-07）

- DeepSeek OpenAI-compatible base URL：`https://api.deepseek.com`
- Chat Completions：`POST /chat/completions`
- JSON Output：`response_format: { "type": "json_object" }`，prompt 中也明确要求 JSON
- 模型：官方当前列出 `deepseek-v4-flash` 与 `deepseek-v4-pro`；旧的
  `deepseek-chat` / `deepseek-reasoner` 标为将在 2026-07-24 停用。判句默认使用低延迟的
  `deepseek-v4-flash`，并关闭 thinking。
- Vite 项目可直接在根目录 `api/` 放置 Vercel Functions。

官方文档：

- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/api/create-chat-completion
- https://api-docs.deepseek.com/guides/json_mode/
- https://vercel.com/docs/frameworks/frontend/vite
- https://vercel.com/docs/functions
- https://vercel.com/docs/environment-variables
