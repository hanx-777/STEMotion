# STEMotion 调试脚本说明

`scripts/` 目录用于本地开发诊断，不属于线上用户流程。当前包含：

```text
scripts/
  trace-data-flow.ts
  README.md
```

## trace-data-flow.ts

`trace-data-flow.ts` 用于在本地追踪深度交互生成的数据流，帮助开发者理解每个阶段的输入、输出和耗时。

它适合用于：

- 调试模型输出是否符合预期；
- 检查 planner、HTML generation、teacher actions 等阶段的连接；
- 记录一次本地生成链路作为开发诊断样例；
- 排查 HTML safety validation 或 LLM repair 失败。

它不适合用于：

- 线上用户研究数据采集；
- 自动批量评测；
- 上传或共享包含敏感配置的日志；
- 替代 `/api/deep-interaction/generate` 的真实 SSE 前端流程。

## 运行前提

在项目根目录安装依赖：

```bash
npm install
```

确认存在模型配置：

```bash
cp model-profiles.example.json model-profiles.json
```

然后编辑 `model-profiles.json`，配置至少一个 profile：

```jsonc
{
  "activeProfile": "default",
  "profiles": {
    "default": {
      "label": "Default Model",
      "provider": "openai",
      "baseURL": "https://api.example.com/v1",
      "apiKey": "sk-your-key",
      "model": "model-name",
      "timeout": 300000
    }
  }
}
```

不要把真实 `model-profiles.json` 或 API Key 提交到仓库。

## 运行方式

在项目根目录执行：

```bash
npx tsx scripts/trace-data-flow.ts
```

如果需要更多日志：

```bash
DEBUG=llm,pipeline,json,html npx tsx scripts/trace-data-flow.ts
```

## 预期输出

脚本会在终端输出每个阶段的摘要，例如：

```text
Stage 1: planInteraction
Stage 2: buildWidgetHtml
Stage 3: buildTeacherActions
Stage 4: createSchemaWithWidget
```

根据脚本实现，报告可能写入：

```text
docs/data-flow-trace-example.md
```

该报告仅用于本地诊断。如果报告中包含模型响应、HTML 或中间 JSON，请在分享前人工检查，避免泄露敏感信息。

## 与当前产品流程的关系

当前 `/deep-interaction` 的真实用户流程包含：

```text
Guided Planning
-> User Approval
-> SSE Generation
-> LearningBlueprint
-> SubjectSchemaValidator
-> TemplateMatcher / WidgetHtmlAgent
-> Multi-Agent Feedback Loop
-> artifact_ready
```

`trace-data-flow.ts` 是开发诊断脚本，不一定覆盖 UI 中的所有交互状态、Research Mode 事件或前端 hydration 细节。

如果需要验证完整用户体验，请运行：

```bash
npm run dev
```

然后访问：

```text
http://localhost:3001/deep-interaction
```

## 安全与隐私

调试输出不应包含：

- API Key；
- 完整 `model-profiles.json`；
- 真实学生数据；
- 未经清理的用户研究数据；
- 准备公开分享的完整模型响应。

Research Mode 的正式本地事件记录由 `src/lib/stores/researchLogStore.ts` 管理。脚本输出和 Research Mode 导出是两套不同用途的数据。

## 常见问题

| 问题 | 处理方式 |
| --- | --- |
| `缺少模型配置` | 检查 `model-profiles.json` 是否存在，并确认 `activeProfile` 指向有效 profile。 |
| `model returned empty` | 检查模型服务、baseURL、model 名称和 API Key。 |
| 请求超时 | 增加 profile 的 `timeout`，或检查网络/代理。 |
| HTML safety validation failed | 查看 `html` 日志；脚本或 pipeline 可能会尝试程序化修复和 LLM 修复。 |
| `tsx` 无法运行 | 确认已执行 `npm install`，或使用 `npx tsx ...`。 |
