# aka-ai-video-generator 开发文档

> Koishi 视频生成插件 — adapter 参考 v1（aka-ai-generator），架构与计费体系参考 v2（aka-ai-image-generator）。

## 1. 定位

`koishi-plugin-aka-ai-video-generator`：独立的 AI 视频生成插件。与图像版（v2）解耦，但复用同一套 V2 数据模型（users.v2.json / credit-ledger.v2.jsonl / recharge-records.v2.jsonl），使用户积分余额在图像/视频两个插件间天然互通（挂载到同一数据目录时）。

## 2. 从 v1 继承什么（adapter 层）

v1 视频链路（`lib/commands/video-runtime.js` + `lib/providers/*video*.js`）的核心机制：

| 机制 | v1 实现 | 本插件继承 |
|------|---------|-----------|
| 任务创建 | `POST {apiBase}/v1/video/create`，body: `{model, prompt, images: [dataURI...], aspect_ratio, duration?}` → 返回 `id` | ✅ 原样（yunwu 协议） |
| 任务轮询 | `GET {apiBase}/v1/video/query?id=<taskId>` → `{status, video_url?, progress?, error?}`，5s 间隔，默认最长 300s | ✅ 原样 |
| 单图/多图路由 | images.length > 1 且有 multiImageModelId → 多图模型，否则单图模型 | ✅ 原样 |
| 图片预处理 | 下载 URL → base64 dataURI，多图时容忍部分失败 | ✅ 原样 |
| 并发约束 | 每用户同时最多 1 个视频任务（startVideoTask/endVideoTask） | ✅ 保留 |
| 任务查询 | `查询视频 [taskId]` 支持单查/列表查，完成才扣费 | ✅ 保留 |
| 异步落账 | 任务创建时 reserve 额度，completed 时 charge，failed 时释放 | ✅ 升级为 V2 reserve/commit/refund |

支持的 provider 类型（v1 已有）：`yunwu`（云雾，`/v1/video/create|query`）。`gptgod-video` 协议留 extension point，骨架先实现 yunwu。

## 3. 从 v2 继承什么（架构与计费）

### 3.1 目录分层（与 v2 对齐）

```
src/
  index.ts                     # 插件入口 apply(ctx, config)，注册 service/commands
  shared/
    config.ts                  # Schema 配置声明（含视频参数、计费参数）
    constants.ts               # 命令名/默认值/汇率常量
    billing.ts                 # 积分计算工具（视频按秒/按次计价）
    prompt-timeout.ts          # session.prompt 超时工具
    logging.ts                 # 日志封装
  commands/
    index.ts                   # 命令注册汇总
    video.ts                   # 视频生成命令（单图/多图/文生视频）
    query.ts                   # 任务查询命令
    help.ts                    # 帮助
  orchestrators/
    VideoGenerationOrchestrator.ts  # 生成主流程：输入收集→reserve→提交→轮询→发送→commit/refund
  providers/
    base.ts                    # VideoProvider 接口 + TaskStatus 类型
    registry.ts                # createVideoProvider(config) 工厂
    yunwu.ts                   # 云雾实现（create/query）
    errors.ts                  # ProviderError 分类（可重试/不可重试/额度不足）
    policies/retry.ts          # 指数退避重试
    policies/timeout.ts        # 超时控制
    utils.ts                   # downloadImageAsBase64, sanitizeString/Error
  service/
    AiVideoGeneratorService.ts # koishi service：暴露给其他插件调用的程序化 API
  services/
    UserManager.ts             # V2 用户/积分管理（与图像版同一份数据格式）
  core/
    video-context-store.ts     # pending task 持久化（taskId→userId,charged,credits）
  bridge/
    chatluna/                  # chatluna tool 桥（让 LLM 可调视频生成）
    yesimbot/                  # yesimbot tool 桥
  utils/
    input.ts                   # parseMessageImagesAndText, collectImagesFromParamAndQuote
    parser.ts                  # 参数解析
```

### 3.2 计费模型（V2 语义）

- 数据文件（挂在 `<koishi-data>/aka-ai-video-generator/`；若要图像/视频共享余额，把 `dataDir` 指向图像版目录即可——文件格式完全兼容）：
  - `users.v2.json` — `users[userId].balance.{purchasedCredits,totalGrantedCredits,totalConsumedCredits,dailyFreeCreditsUsed,...}`
  - `credit-ledger.v2.jsonl` — 每次 grant/consume/refund 一条流水（schemaVersion: 2, sequence 自增）
  - `recharge-records.v2.jsonl` — 充值记录
- 视频计价：`videoCost = baseCredits + perSecondCredits * duration`（默认 base=2, perSecond=0.5, duration=5s → 4.5 积分；均可配置）。先 reserve，完成后 commit，失败 refund。
- 每日免费额度：`dailyFreeCreditsLimit`（默认 0.4，与图像版一致）。

### 3.3 命令集（v1 对齐 + v2 风格）

| 命令 | 说明 |
|------|------|
| `视频生成 <描述>` / `文生视频 <描述>` | 纯文本 → 视频（若 provider 支持；yunwu 需图片时提示） |
| `图生视频 [图片] <描述>` | 1 张图 → 视频 |
| `多图生视频 [图片x2-4] <描述>` | 2-4 张图合成视频 |
| `查询视频 [taskId]` | 查询任务；无参数时列出本人所有 pending 任务 |
| `视频余额` | 查询积分余额/今日免费额度 |
| `视频帮助` | 使用说明 |

## 4. Provider 协议（yunwu）

```
POST {apiBase}/v1/video/create
Authorization: Bearer <apiKey>
{
  "model": "<modelId>",
  "prompt": "...",
  "images": ["data:image/png;base64,..."],
  "aspect_ratio": "16:9",
  "duration": 5
}
→ { "id": "<taskId>" }  或  { "error": {...} }

GET {apiBase}/v1/video/query?id=<taskId>
→ { "status": "pending|processing|completed|failed",
    "video_url": "https://...", "progress": 42, "error": "..." }
```

## 5. 关键流程

```
用户命令
  → 参数/图片收集（utils/input）
  → UserManager.checkAndReserveQuota(userId, cost)   [reserve]
  → core/video-context-store: 登记 pending task（未 charge）
  → provider.createVideoTask() → taskId
  → 轮询 provider.queryTaskStatus(taskId)
      completed → h.video(videoUrl) 发送 → UserManager.commitUsage()   [commit] → 删 pending
      failed    → UserManager.refundUsage()                            [refund] → 删 pending
      timeout   → 保留 pending，提示用户用「查询视频」手动跟进
```

会话中断恢复：插件启动时扫描 pending task 表，重启轮询或标记可查询。

## 6. 配置项（Config Schema 摘要）

```ts
{
  provider: 'yunwu',
  apiKey: string,
  apiBase: string,              // default 'https://yunwu.ai'
  videoModelId: string,         // 单图/文生视频模型
  multiImageModelId?: string,   // 多图模型（可选）
  apiTimeout: number,           // 秒，default 60
  videoMaxWaitTime: number,     // 秒，default 300
  defaultDuration: number,      // 秒，default 5
  defaultAspectRatio: string,   // default '16:9'
  billing: {
    baseCredits: number,        // default 2
    perSecondCredits: number,   // default 0.5
    dailyFreeCreditsLimit: number, // default 0.4
  },
  dataDir?: string,             // 默认 <koishi-data>/aka-ai-video-generator
  logLevel: 'debug'|'info'|'warn'|'error',
}
```

## 7. 开发计划（里程碑）

- **M0 骨架**（本次交付）：目录、package.json、tsconfig、Config schema、provider 接口 + yunwu 实现、UserManager 积分读写、命令注册（生成/查询/余额/帮助）、orchestrator 主流程。
- **M1 可用**：端到端跑通图生视频 + 计费落账 + 失败退款 + pending 恢复。
- **M2 桥接**：chatluna/yesimbot tool 接入。
- **M3 打磨**：多 provider（gptgod-video）、进度播报、批量任务。

## 8. 与 v1/v2 的兼容性

- 数据格式与 v2 完全一致 → 两个插件指到同一 dataDir 即共享积分账户。
- 不与 v1 共用数据（v1 是次数制，已归档）。
- 命令名前缀「视频」与图像版「生图」无冲突；与 v1 并存时注意 v1 的旧命令占用。
