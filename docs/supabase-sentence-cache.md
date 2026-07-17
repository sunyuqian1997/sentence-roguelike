# Supabase 判句缓存

## 结论

Supabase 在这里不是“让模型更快思考”，而是跨玩家、跨 Vercel 实例保存已经完成的判句。
重复句子无需再次调用 DeepSeek，通常只需要一次数据库读取；第一次出现的句子仍然需要模型判定。
数据库异常或未配置时会静默跳过，战斗继续使用现有 DeepSeek/本地兜底。

调用顺序：

`浏览器内存缓存 → Vercel 内存缓存 → Supabase 指纹缓存 → DeepSeek → 写入 Supabase`

## 为什么先做精确缓存，不做向量搜索

缓存键不是原句，而是以下内容的 SHA-256：

`判句规则版本 + 模型名 + NFKC 规范化句子`

数据库不保存玩家原句，只保存不可逆指纹和评分结果。模型或 Prompt 版本变化时会自动形成新指纹，
不会误用旧评分。语义相似搜索需要额外生成 embedding，也可能把两句效果不同的话误当成同一句；
因此第一版不启用 pgvector。等精确缓存有真实命中数据后，再评估是否值得增加语义层。

## 首见奖励

只有 Supabase 原子插入成功的第一个请求可以领取“首见”奖励，并且基础分必须至少 60：

- 奖励：本次直接数值效果额外 ×1.03。
- 不改变 LLM 基础分、等级边界和数据库中的缓存结果。
- 同一句在 Vercel 内存、数据库或浏览器中再次命中时不重复奖励。
- 标点、空白和全角/半角差异会先规范化，不能靠简单换格式领取。

这是轻量彩蛋，不把“全服第一次出现”误当作主要创意评分；句子是否有趣仍由 LLM 的基础评分决定。

## 一次性配置

1. 打开 Supabase Dashboard → SQL Editor。
2. 完整运行 [`supabase/sentence-cache.sql`](../supabase/sentence-cache.sql)。
3. 本地 `.env` 和 Vercel Settings → Environment Variables 添加：

```dotenv
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SECRET_KEY=sb_secret_你的服务端密钥
```

新项目优先使用 `sb_secret_...`。旧项目的 `service_role` 也受兼容环境变量
`SUPABASE_SERVICE_ROLE_KEY` 支持。两种密钥都只能放在 Vercel Function 服务端，绝不能加 `VITE_` 前缀，
也不要粘贴到聊天、浏览器控制台或前端源码。

保存 Vercel 环境变量后需要重新部署。

## 验收

用 `vercel dev` 吟诵一个基础分 ≥60 的新句：第一次结果应包含 `source: deepseek`、
`isNovel: true`、`noveltyBonus: 3`。再次吟诵同一句应来自浏览器/服务端/Supabase 缓存，且
`isNovel: false`。Supabase Table Editor 中对应行的 `seen_count` 会随持久层命中或并发写入增加。

## 安全与性能

- 表已启用 RLS，并撤销 `anon` / `authenticated` 权限。
- Secret Key 仅由 `/api/judge-sentence` 使用；浏览器仍只调用同源 API。
- Supabase 查询有 260ms 硬超时，数据库慢时立即回到原链路，不阻塞战斗。
- 唯一主键与 SQL 函数保证并发请求中只有一个请求取得首见奖励。
- 当前缓存适合精确去重，不承担强限流；大流量下仍应增加全局速率限制。
