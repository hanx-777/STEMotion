# STEMotion 学科切换与 RAG 使用说明

STEMotion 当前是 Next.js App Router 项目。本功能按现有技术栈实现为 TypeScript 服务端模块、Next Route Handlers 和前端工作台，不新增 FastAPI、数据库或账号系统。

## 当前入口

- 学生助学：`/student`
- 教师助教：`/teacher`
- 可视化演示：`/visualization`
- 兼容入口：`/rag`，当前重定向到 `/student`
- RAG v1 API：`POST /api/v1/rag/ask`
- 旧 API：`POST /api/rag/ask`，作为兼容 adapter 保留

## 学科 Skill

学科 Skill 配置位于 `skills/{subject}`。当前仓库包含：

- `physics_mechanics`：默认学科，大学物理力学。
- `advanced_math`
- `chemistry`
- `computer_science`

每个 Skill 至少包含：

```text
skill.yaml
system_prompt.md
answer_template.md
knowledge_base/
```

`skill.yaml` 定义显示名、知识库路径、检索配置、工具能力和回答要求。默认学科可通过环境变量或本地 `.stemotion/settings.json` 设置；不存在时回退到 `physics_mechanics`。

```powershell
$env:STEMOTION_DEFAULT_SUBJECT="physics_mechanics"
```

## 知识库索引

知识库资料放在对应学科的 `knowledge_base/sources/` 目录中。当前支持 Markdown、TXT 和轻量 PDF 文本提取。推荐使用 TypeScript 脚本构建本地索引：

```powershell
npm run rag:ingest -- --subject physics_mechanics
npm run rag:ingest -- --subject all
```

索引生成到 `.stemotion/vector-store/{subject}.json` 与 `.stemotion/vector-store/{subject}.manifest.json`。该目录是本地运行产物，不应提交到 Git。

`/api/v1/subjects` 会读取 manifest 返回 `knowledge_status`，不会在页面加载时全量扫描知识库。

## RAG 问答语义

RAG 的职责是检索、组织证据和提供 citations；最终回答始终由当前启用的大模型生成。

- 本地课程资料优先进入 `[Lx]` citation。
- 网络结果只作为 `[Wx]` 补充资料，不得伪装为本地课程资料。
- 无可靠来源时仍调用大模型回答，但必须提示“当前知识库和网络检索中未找到可靠依据”，且 `citations` 为空。
- 模型不可用时接口返回明确错误，不使用检索摘录拼接成假回答。

## 网络补充检索

网络检索由学科配置中的 `retrieval.enable_web_search` 和请求体 `retrieval.useWebSearch` / legacy `use_web_search` 共同控制。没有配置真实搜索服务时，系统会优雅降级为本地 RAG。

测试或演示可启用 Mock provider，但不得宣传为真实联网检索：

```powershell
$env:STEMOTION_WEB_SEARCH_PROVIDER="mock"
```

自定义 JSON 搜索服务：

```powershell
$env:STEMOTION_WEB_SEARCH_PROVIDER="custom-json"
$env:STEMOTION_WEB_SEARCH_ENDPOINT="https://your-search-service.example/search"
$env:STEMOTION_WEB_SEARCH_API_KEY="your-token"
```

自定义服务可以返回数组，或返回 `{ "results": [...] }`。每条结果需要包含 `title`、`url`、`snippet`。

## API 示例

v1 请求：

```http
POST /api/v1/rag/ask
Content-Type: application/json

{
  "question": "非零初始高度斜抛运动如何求落地时间和射程？",
  "subjectId": "physics_mechanics",
  "taskType": "step_solution",
  "retrieval": {
    "useWebSearch": false
  },
  "quality": {
    "mode": "review"
  }
}
```

旧接口仍兼容：

```http
POST /api/rag/ask
Content-Type: application/json

{
  "question": "非零初始高度斜抛运动如何求落地时间和射程？",
  "subject": "physics_mechanics",
  "task_type": "step_solution",
  "use_web_search": false
}
```

响应包含：

- `answer` / v1 `answer.sections`
- `answer_sections`
- `citations`
- `retrieved_chunks`
- `retrieval_report`
- `evidence_pack`
- `quality_report`
- `visualization_hint`
- `visualization_spec`

## 命令行检查

```powershell
npm run rag:query -- --subject physics_mechanics --question "非零初始高度斜抛运动如何求落地时间和射程？"
npm run check
npm test
```

`rag:query` 会调用当前 active model profile；如果网络或 API Key 不可用，会返回模型生成失败提示。
