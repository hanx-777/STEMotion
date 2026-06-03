# 实际输出记录目录

本目录用于存放真实运行 `/student`（或兼容入口 `/rag`）后得到的案例输出、截图位置、响应时间和人工对比分析。

当前文件均为模板。真实输出需要团队在本地或部署环境中运行 STEMotion Physics Skill 后补充。

请勿伪造：

- 真实截图；
- 响应时间；
- 用户反馈；
- 模型输出；
- 引用来源；
- 评分或结论。

建议记录流程：

1. 打开 `/settings`，确认模型配置可用。
2. 运行 `npm run rag:ingest -- --subject all`。
3. 打开 `/student`，逐个执行 `test_cases.md` 中的学生案例；教师备课案例可在 `/teacher` 执行。
4. 保存页面截图或视频片段。
5. 将实际回答、citations、visualization_hint 和响应时间填入本目录对应文件。
6. 对照人工标准答案完成准确性检查表。
