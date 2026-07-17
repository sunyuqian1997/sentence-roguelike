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

## 小白配置步骤

### 1. 创建表

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)，进入项目。
2. 左侧选择 **SQL Editor**，点击 **New query**。
3. 打开 [`supabase/sentence-cache.sql`](../supabase/sentence-cache.sql)，全选并复制全部内容。
4. 粘贴到 SQL Editor，一次性点击 **Run**，不要逐行执行。
5. 看到 **Success** 后，去左侧 **Table Editor**。列表中应出现空表
   `sentence_judgments`；空表是正常状态，第一次真实判句后才会写入。

### 2. 找到服务端连接信息

1. 点击项目顶部 **Connect**；如果界面中没有该按钮，打开 **Settings → API Keys**。
2. 复制 **Project URL**，形如 `https://xxxx.supabase.co`。
3. 创建或复制 **Secret key**，优先选择形如 `sb_secret_...` 的新密钥。
4. 不要使用 Publishable key / anon key，也不要把 Secret key 放进聊天或截图。

### 3. 配置本地与 Vercel

在项目根目录未提交的 `.env` 中添加：

```dotenv
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SECRET_KEY=sb_secret_你的服务端密钥
```

新项目优先使用 `sb_secret_...`。旧项目的 `service_role` 也受兼容环境变量
`SUPABASE_SERVICE_ROLE_KEY` 支持。两种密钥都只能放在 Vercel Function 服务端，绝不能加 `VITE_` 前缀，
也不要粘贴到聊天、浏览器控制台或前端源码。

保存 Vercel 环境变量后需要重新部署。

本地保存 `.env` 后重新运行 `npx vercel dev`。只运行 `npm run dev` 不会启动 Vercel 的
`/api/judge-sentence` Function，因此无法完成真实数据库验收。

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
