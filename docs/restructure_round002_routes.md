# STEMotion 重构 Round 002 路由兼容层

## 本轮范围

- 任务包：`STEMotion-refactor-XH202620` / round `002`
- 校验位：`Q8vN3kLmR7pZ2sY`
- 目标：新增 `/learn`、`/teach`、`/lab`、`/assets` 四个产品一级路由；旧页面入口 redirect 到新路由；主导航切换到重构方案命名
- 未改动：RAG API、Deep Interaction pipeline、知识库原始数据、模型设置、`package.json` 依赖

## 新旧路由映射

| 旧路由 | 新路由 | 当前处理 |
| --- | --- | --- |
| `/student` | `/learn` | server page 调用 `redirect('/learn')` |
| `/teacher` | `/teach` | server page 调用 `redirect('/teach')` |
| `/visualization` | `/lab` | server page 调用 `redirect('/lab')` |
| `/interactions` | `/assets` | server page 调用 `redirect('/assets')` |
| `/rag` | `/learn` | server page 调用 `redirect('/learn')` |
| `/deep-interaction` | 保留旧入口 | 未重定向，继续渲染 `DeepInteractionWorkbench` |

## 新路由实现

| 新路由 | 复用实现 | 说明 |
| --- | --- | --- |
| `/learn` | `RagSurfacePage mode="student"` | 复用学生 RAG workbench |
| `/teach` | `RagSurfacePage mode="teacher"` | 复用教师 RAG workbench |
| `/lab` | `LabSurfacePage` | 复用 `DeepInteractionWorkbench` |
| `/assets` | `AssetsWorkbench` | 复用原 `/interactions` 交互库实现 |

## 修改文件

- `src/app/learn/page.tsx`
- `src/app/teach/page.tsx`
- `src/app/lab/page.tsx`
- `src/app/assets/page.tsx`
- `src/app/student/page.tsx`
- `src/app/teacher/page.tsx`
- `src/app/visualization/page.tsx`
- `src/app/interactions/page.tsx`
- `src/app/rag/page.tsx`
- `src/components/layout/AppShell.tsx`
- `src/features/rag/ui/RagSurfacePage.tsx`
- `src/features/deep-interaction/ui/LabSurfacePage.tsx`
- `src/features/assets/ui/AssetsWorkbench.tsx`
- `tests/test_route_compatibility.ts`
- `docs/restructure_round002_routes.md`

## 主导航

主导航已调整为：

- 学生学习：`/learn`
- 教师教学：`/teach`
- 可视化实验：`/lab`
- 教学资产：`/assets`
- 设置：`/settings`

由于本轮未实现 `/about` 页面，原 `href="#"` 的关于入口未保留在 AppShell 导航中。

## 未做事项

- 未新增 `/knowledge` 页面
- 未新增 `/about` 页面
- 未做 RAG 到 Lab 桥接
- 未修改 API 合约、Deep Interaction 生成 pipeline、知识库数据或模型配置
- 未运行 `npm install`

## 验证结果

| 命令 | 状态 |
| --- | --- |
| `./node_modules/.bin/tsx --test tests/test_route_compatibility.ts` | 通过 |
| `npm run lint --if-present` | 通过 |
| `npm run typecheck --if-present` | 通过 |
