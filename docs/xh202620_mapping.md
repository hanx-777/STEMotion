# XH202620 赛题匹配说明

## 1. 赛题目标理解

XH202620 关注“面向一流学科建设的学科垂类大模型与创新应用开发”。学科智引：基于RAG的垂类大模型助学助教平台 将通用生成式 AI 能力落到高校课程教学场景，围绕课程知识库、学科 Skill、可追溯 RAG、结构化教学任务和交互式教学资源生成，构建面向学生学习和教师教学的垂类应用。

本项目的重点不是做一个泛问答机器人，而是把“学科身份、课程资料、引用来源、教学任务和可视化实验”组织成一个可演示、可扩展、可验证的教学系统。

## 2. 作品定位

作品名称：学科智引：基于RAG的垂类大模型助学助教平台。

作品定位：基于学科 Skill、课程知识库与 RAG 检索增强的垂类大模型助学助教平台。

默认学科：大学物理力学 `physics_mechanics`。

核心用户：

- 学生：获得分步推导、概念解释、错因诊断和可视化辅助理解。
- 教师：生成课堂讲解方案、演示参数和可追溯教学材料。

## 3. 评审指标映射表

| 评审维度 | 赛题关注点 | 学科智引对应能力 | 当前实现位置 | 后续完善方向 |
| --- | --- | --- | --- | --- |
| 作品完成度 | 是否形成可运行、可演示、可验证的完整作品 | `/learn` 学生学习、`/teach` 教师教学、`/lab` 可视化实验、`/assets` 教学资产、RAG API、学科 Skill、知识来源、典型案例、`/settings` 模型配置 | `src/app/(student)`、`src/app/(teacher)`、`src/app/(system)`、`src/features/rag`、`src/backend`、`skills/physics_mechanics` | 补充部署地址、演示视频、更多真实课程知识库 |
| 创意实用度 | 是否贴合真实教学场景，是否解决具体痛点 | 学生分步学习、错因诊断、教师备课、引用追溯、交互式教学资源生成 | `/learn`、`/teach`、`/lab`、`src/features/rag`、`src/features/deep-interaction` | 引入真实课堂任务、教师试用反馈和课程作业场景 |
| 技术实现度 | 是否具备完整工程实现和稳定接口 | Skill 配置、文档加载、文本切分、本地检索、Mock/可选网络检索、模型配置、本机 backend job runner、测试用例 | `src/lib/subjects`、`src/features/rag/lib`、`src/features/settings`、`src/backend`、`tests` | 接入更强向量库、完善 PDF 解析和真实搜索服务 |
| 技术先进性 | 是否体现大模型应用、RAG、工具化和多 Agent 能力 | 学科 RAG、结构化回答、引用生成、可视化提示、深度交互生成、多 Agent 评审 | `src/features/rag/lib`、`src/features/deep-interaction/lib`、`src/backend/generation`、`docs/prompt-lifecycle.md` | 增加多模态教材资料、自动题型识别和更丰富物理仿真 |
| 内容质量度 | 是否保证知识可靠、过程可追溯、输出规范 | 本地知识库优先、网络检索仅补充、引用来源、分步推导、测试案例 | `skills/physics_mechanics/knowledge_base`、`src/features/rag/lib/citation.ts`、`docs/evaluation` | 引入授权课程讲义、教师审核记录和更完整标准答案库 |
| 商业化潜力 | 是否具备推广到更多课程或机构的可能 | 可切换 Skill、多 Profile 模型配置、可扩展知识库、课程级 RAG 工作流、本机前后端边界 | `skills/*`、`src/features/settings`、`src/backend`、`scripts/ingest_knowledge.ts` | 支持课程包导入、班级部署、教师后台和校内知识库权限 |
| 用户认可度 | 是否有真实用户验证或可验证材料 | 提供测试案例、反馈模板和效果验证报告模板，明确不伪造反馈 | `docs/evaluation/user_feedback_template.md`、`docs/evaluation/effect_validation_report.md` | 收集真实学生/教师试用反馈、课堂演示记录和匿名评价 |

## 4. 当前限制

- 当前示例知识库为演示性质，正式参赛应补充授权教材、课程讲义或教师自建资料。
- 网络检索能力在无真实 API Key 时会优雅降级或使用 Mock，不应宣传为已完成真实联网检索。
- 用户认可度材料当前仅提供模板，真实用户反馈待收集。
- AI 生成内容仅供学习参考，最终教学结论需结合课程教材与教师要求核验。
