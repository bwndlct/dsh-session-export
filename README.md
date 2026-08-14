**简体中文** | [English](README.en.md)

# dsh-session-export

将 DeepSeek Harness（DSH）会话导出为可移植、人类可读的 **Markdown** 和结构化 **JSON** 文件。

`dsh-session-export` 是 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) 的社区插件。它读取当前会话的事件溯源日志，输出自包含的对话记录文件——可阅读、归档、分享、diff，或喂给另一个 agent——导出格式采用稳定、带版本号的 schema，与 DSH 内部实现解耦。

## 特性

- **两种入口**
  - `session_export()` 工具 — 随时让模型执行导出
  - `/session-export [markdown|json|all]` 斜杠命令 — Web UI 中一键触发，零模型 token 消耗
- **忠实还原执行顺序** — 用户消息、助手消息（含推理过程）、工具调用（含解析后的参数）、工具结果（含失败）严格按发生顺序排列
- **稳定的导出 schema** — 每个 JSON 文档都带 `schemaVersion`，为后续演进留出空间
- **健壮设计** — 未知的未来事件类型、缺失元数据、恶意代码围栏、超大工具结果、非文本块均不会导致导出崩溃
- **跨平台安全的文件名** — 处理 Windows 保留名称/字符；已有文件绝不覆盖
- **零运行时依赖** — 仅 TypeScript + Node 内置模块

## 安装

需要 `dsh >= 0.1.0-rc.6`。

```sh
dsh plugin --profile web add dsh-session-export
```

然后将包加入 profile 的 `package.json` 中的 `bundles` 列表（插件自带 `dsh.bundle` patch manifest）：

```jsonc
// ~/.dsh/profiles/web/package.json
"dsh": {
  "profile": {
    "bundles": [
      // ...,
      "dsh-session-export"
    ]
  }
}
```

完成后重启 `dsh`。如果要从 GitHub 而非 npm 安装：

```sh
dsh plugin --profile web add github:<your-org>/dsh-session-export
```

## 用法

直接让模型执行：

```text
把当前会话导出成 Markdown
Export this session, json only
```

或在 Web UI 中直接输入斜杠命令：

```text
/session-export            # 两种格式（默认）
/session-export markdown   # 仅 .md
/session-export json       # 仅 .json
/session-export all        # 两种格式
```

不想带参数？固定格式别名一个词搞定（UI 命令输入框没有枚举补全，别名最方便）：

```text
/export-md       # 仅 Markdown
/export-json     # 仅 JSON
```

命令在 UI 命令平面中执行——其输出不会进入模型对话历史。

## 导出格式

### Markdown

可读的对话记录：元数据头部 + 按执行顺序排列的会话内容。工具调用将其（解析后的）参数渲染为 JSON；工具结果渲染为围栏 `text` 代码块——围栏会自动加宽，确保含 ``` 的结果内容不会撑破代码块。超过 8,000 字符的结果会被截断并标记。

### JSON

由本插件定义的稳定文档格式（非 DSH 内部结构转储）：

```json
{
  "schemaVersion": "1.0",
  "session": {
    "id": "session-e6bb6821-…",
    "createdAt": "2026-08-14T09:52:59.798Z",
    "exportedAt": "2026-08-14T09:53:24.300Z",
    "model": "glm-5.3",
    "provider": "zai-coding-cn",
    "cwd": "/private/tmp/dsh-export-verify",
    "asOfSeq": 137,
    "eventCount": 6,
    "omitted": { "contextMessages": 2 }
  },
  "events": [
    { "type": "user_message", "seq": 6, "timestamp": "…", "content": "…" },
    { "type": "assistant_message", "seq": 9, "timestamp": "…", "content": "…", "reasoning": "…", "provider": "…", "model": "…" },
    { "type": "tool_call", "seq": 10, "timestamp": "…", "callId": "…", "tool": "bash", "arguments": { "command": "echo hi" } },
    { "type": "tool_result", "seq": 11, "timestamp": "…", "callId": "…", "tool": "bash", "success": true, "content": "hi\n" },
    { "type": "unknown_event", "seq": 99, "timestamp": "…", "eventType": "future/thing" }
  ]
}
```

关于保真度的说明：

- `tool_call.arguments` 在模型输出的原始字符串不是合法 JSON 时保留原样。
- `tool_result.error` 携带失败调用的内部 `{ name, code }` 标识。
- 推理过程在 DSH 将其记录到助手消息上时才会导出；不会反射或提取任何私密信息。
- 仅用于日志记录的簿记事件（轮次/步骤边界、流式块、todo 快照、请求头、权限预设等）有意跳过；注入的上下文消息（指令、技能、通知）默认省略，计入 `session.omitted`。
- 压缩替换节点被跳过（按 DSH 对话记录约定，面向人类的记录只投影追加来源事件）；数量记录在 `session.omitted.replacedEvents` 中。
- 未知的未来事件类型以 `unknown_event` 条目呈现——绝不崩溃。

## 示例

Markdown 输出（截短）：

````markdown
# DSH Session Export

## Metadata

- Session ID: session-e6bb6821-2a4c-40a3-a178-13ea25ccfe4e
- Model: zai-coding-cn / glm-5.3
- Working Directory: /private/tmp/dsh-export-verify
- Exported Events: 6

---

## User

先用 bash 运行 echo verify-2 …

## Assistant

_zai-coding-cn / glm-5.3_

> The user wants me to: …

### Tool Call: `bash`

```json
{
  "command": "echo verify-2"
}
```

### Tool Result — `bash` (ok)

```text
verify-2
```
````

## 输出目录

导出文件位于 `<会话工作目录>/.dsh/exports/`：

```text
.dsh/exports/session-<session-id>-<UTC 时间戳>.md
.dsh/exports/session-<session-id>-<UTC 时间戳>.json
```

目录自动创建，文件名经 Windows/macOS/Linux 安全处理，重名时追加 `-1`、`-2`……而非覆盖。

## 隐私

**导出文件可能包含敏感数据。**对话记录可能含有你的源代码、工具读取的文件内容、工具参数（路径、命令、查询）、工具结果、API 响应以及绝对文件系统路径。分享前请务必检查——本插件不做任何脱敏处理。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm run build
pnpm test          # node:test，无额外依赖
```

代码布局：

```text
src/
  index.ts            # 插件入口：工具 + 斜杠命令
  session-adapter.ts  # DSH 会话 -> 导出 schema（唯一含 DSH 类型的模块）
  schema.ts           # 插件自有导出 schema 类型定义
  markdown.ts         # Markdown 渲染器（纯函数）
  json.ts             # JSON 渲染器（纯函数）
  exporter.ts         # 文件名生成 + 文件写入
test/                 # node:test 套件，覆盖 markdown / json / 文件名
```

渲染器和 schema 不依赖 DSH，因此导出格式可独立于 DSH Developer Preview API 进行单元测试和演进。

## 兼容性

- 基于 `@deepseek-ai/dsh 0.1.0-rc.6`（DSH Developer Preview）构建和验证。
- 使用公开插件接口：`@deepseek-ai/dsh-tools` 的 `ctx.tools.register()` / `defineTool`、`@deepseek-ai/dsh-commands` 的可选 `ctx.commands` 服务，以及 `@deepseek-ai/dsh-session` 的公开 `Session` 事件日志。不触及任何私有字段，不做核心修改。
- 斜杠命令仅在挂载了 commands 服务的 profile（如 `web`）中注册；工具在所有 profile 下均可使用，包括 `headless`。

## 许可证

[MIT](LICENSE)