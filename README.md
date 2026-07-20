# koishi-plugin-aka-ai-video-generator

AI 视频生成 Koishi 插件。Adapter 参考 [aka-ai-generator](https://www.npmjs.com/package/koishi-plugin-aka-ai-generator)（v1）视频链路，架构与积分计费体系参考 [aka-ai-image-generator](https://www.npmjs.com/package/koishi-plugin-aka-ai-image-generator)（v2）。

## 功能

- 🎬 图生视频（单图）
- 🖼️ 多图生视频（2-4 张合成）
- 📝 文生视频（需模型支持）
- 💰 V2 积分计费：每日免费额度 + 付费积分，失败自动退款
- 🔄 异步任务：提交后轮询，超时转手动查询
- 🔗 与 aka-ai-image-generator 数据格式完全兼容，可共享积分账户

## 安装

```bash
npm install koishi-plugin-aka-ai-video-generator
```

或在 Koishi 控制台插件市场搜索 `aka-ai-video-generator`。

## 命令

| 命令 | 说明 |
|------|------|
| `图生视频 [图片] <描述>` | 单张图片生成视频 |
| `多图生视频 [图片x2-4] <描述>` | 多张图片合成视频 |
| `文生视频 <描述>` | 纯文字生成视频 |
| `查询视频 [任务ID]` | 查询任务状态 |
| `视频余额` | 查询积分余额 |
| `视频帮助` | 使用说明 |

可选参数：`-d <秒数>` 时长，`-r <比例>` 画面比例。

## 配置

| 配置项 | 默认 | 说明 |
|--------|------|------|
| provider | `yunwu` | 视频供应商 |
| apiKey | — | API Key（必填） |
| apiBase | `https://yunwu.ai` | API 地址 |
| videoModelId | — | 单图/文生视频模型 ID（必填） |
| multiImageModelId | — | 多图模型 ID（可选） |
| defaultDuration | `5` | 默认时长（秒） |
| defaultAspectRatio | `16:9` | 默认比例 |
| billing.baseCredits | `2` | 基础积分/任务 |
| billing.perSecondCredits | `0.5` | 附加积分/秒 |
| billing.dailyFreeCreditsLimit | `0.4` | 每日免费额度 |
| dataDir | 插件数据目录 | 指向图像版数据目录可共享积分 |

## 共享积分账户

将本插件的 `dataDir` 配置为 aka-ai-image-generator 的数据目录（如 `<koishi>/data/aka-ai-image-generator`），两个插件即共享同一套用户积分。

## 开发

```bash
npm install
npm run build      # 构建
npm run typecheck  # 类型检查
npm run dev        # watch 模式
```

详见 [docs/DESIGN.md](docs/DESIGN.md)。

## License

MIT
