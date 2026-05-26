# STEMotion 学科切换与 RAG

STEMotion 当前是 Next.js App Router 项目。本功能按现有技术栈实现为 TypeScript 服务端模块和 Next Route Handlers，而不是新增 FastAPI 后端。

## 功能概览

- 学科 Skill 配置位于 `skills/{subject}`。
- 学科管理模块位于 `src/lib/subjects`。
- RAG 模块位于 `src/lib/rag`。
- API 位于 `src/app/api/subjects` 和 `src/app/api/rag/ask`。
- 前端问答页位于 `/rag`，当前展示为“大学物理力学智能助学系统”。
- 本地知识库索引生成到 `.stemotion/vector-store/{subject}.json`，该目录不会提交到 Git。

## 默认学科

默认学科是 `physics_mechanics`，显示名为“大学物理力学”。选择它作为默认值，是因为 STEMotion 当前核心体验以物理实验、运动学和可视化交互为主，力学内容最适合作为启动学科。

可以用环境变量覆盖默认学科：

```powershell
$env:STEMOTION_DEFAULT_SUBJECT="physics_mechanics"
```

如果环境变量不存在，系统会读取本地 `.stemotion/settings.json`；仍不存在时回退到 `physics_mechanics`。

## 添加新学科

新增学科时，在 `skills/` 下创建目录，例如 `skills/linear_algebra/`，并放置：

```text
skill.yaml
system_prompt.md
answer_template.md
knowledge_base/
```

`skill.yaml` 至少包含：

```yaml
name: linear_algebra
display_name: 线性代数
description: 面向线性代数的学科 Skill。
default_language: zh-CN
knowledge_base_path: knowledge_base
system_prompt_path: system_prompt.md
answer_template_path: answer_template.md
retrieval:
  top_k: 4
  score_threshold: 0.18
  enable_web_search: true
  web_top_k: 3
tools:
  - symbolic_reasoning
answer_requirements:
  - 分步推导
  - 引用来源
```

路径字段支持相对路径，会按学科目录解析。

## 知识库文件

将资料放到对应学科的 `knowledge_base/` 目录。当前支持：

- Markdown：`.md`
- 文本：`.txt`
- PDF：`.pdf`

PDF 目前使用轻量可替换提取实现，适合先跑通流程。后续需要更高质量 PDF 解析时，可在 `src/lib/rag/document_loader.ts` 中替换为 PyMuPDF、pdf-parse 或独立解析服务。

文档切分会保留以下 metadata：

- `source`
- `subject`
- `file_name`
- `page`
- `chunk_id`
- `created_at`

## 构建本地知识库索引

推荐使用 TypeScript 脚本：

```powershell
npm run rag:ingest -- --subject physics_mechanics
npm run rag:ingest -- --subject all
```

也提供 Python 兼容入口：

```powershell
python scripts/ingest_knowledge.py --subject physics_mechanics
python scripts/ingest_knowledge.py --subject all
```

不同学科会写入不同索引文件，检索时只读取当前 subject 对应的索引。

入库脚本还会生成等价 manifest：

```text
.stemotion/vector-store/{subject}.manifest.json
```

`/api/subjects` 优先读取该 manifest 返回 `knowledge_status`，不会在页面加载时全量扫描知识库。

## 网络检索

网络检索由学科配置中的 `retrieval.enable_web_search` 控制，请求体也可以传 `use_web_search`。

没有配置真实搜索服务时，系统会优雅降级为本地 RAG，不会阻止应用启动。演示和测试可以启用 Mock：

```powershell
$env:STEMOTION_WEB_SEARCH_PROVIDER="mock"
```

接入自定义 JSON 搜索服务：

```powershell
$env:STEMOTION_WEB_SEARCH_ENDPOINT="https://your-search-service.example/search"
$env:STEMOTION_WEB_SEARCH_API_KEY="your-token"
```

自定义服务可以返回数组，或返回 `{ "results": [...] }`。每条结果需要包含 `title`、`url`、`snippet`。网络来源会以 `source_type: "web"` 单独进入 citations，不会伪装成本地教材来源。

## API

获取所有学科：

```http
GET /api/subjects
```

获取默认学科：

```http
GET /api/subjects/default
```

设置默认学科：

```http
POST /api/subjects/default
Content-Type: application/json

{
  "subject": "physics_mechanics"
}
```

RAG 问答：

```http
POST /api/rag/ask
Content-Type: application/json

{
  "question": "一个小球以20m/s初速度、30度角斜抛，求最大高度和射程",
  "subject": "physics_mechanics",
  "task_type": "step_solution",
  "use_web_search": true
}
```

响应包含：

- `subject`
- `subject_display_name`
- `task_type`
- `answer`
- `answer_sections`
- `visualization_hint`
- `citations`
- `retrieved_chunks`
- `source_summary`

`task_type` 支持：

- `knowledge_qa`：知识问答
- `step_solution`：分步解题，默认值
- `misconception_diagnosis`：错因诊断
- `teacher_prep`：教师备课

前端会按任务类型渲染固定区块，避免完全依赖模型自然语言格式。斜抛运动问题会优先由后端返回 `visualization_hint`，前端仅在缺失时做轻量兜底解析。

如果本地知识库和网络检索都没有可靠依据，系统会返回“当前知识库和网络检索中未找到可靠依据”，不会编造来源。

## 前端使用

启动开发服务器后打开 `/rag`：

```powershell
npm run dev
```

页面包含：

- 学科下拉框
- Skill 配置弹层
- 任务类型：知识问答、分步解题、错因诊断、教师备课
- 典型案例：斜抛运动、圆周运动、错因诊断、教师课堂演示
- 网络检索开关
- 问答输入区
- 结构化智能回答
- 本地知识库来源
- 网络检索来源
- 检索片段
- 可视化参数与斜抛轨迹图

典型案例请求失败时，页面会使用 `demoFallback` 展示预置演示结果，并明确标注“演示样例结果”。真实用户输入仍会正常走 `/api/rag/ask`。

每次回答末尾都会添加：

```text
AI 生成内容，仅供学习参考，请结合课程教材与教师要求核验。
```

## 命令行查询

```powershell
npm run rag:query -- --subject physics_mechanics --question "斜抛运动最大高度公式是什么"
npm run rag:query -- --subject physics_mechanics --question "斜抛运动最大高度公式是什么" --web
```

## 测试

```powershell
npm test
npm run check
```
