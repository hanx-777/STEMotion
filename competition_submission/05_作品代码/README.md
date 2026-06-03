# 05 作品代码

本目录用于说明作品代码提交范围。

建议放置：

- 代码仓库地址；
- 代码压缩包，如赛事要求；
- 运行环境说明；
- 依赖安装说明；
- 启动命令；
- 测试命令；
- 关键目录结构说明。

推荐命令：

```bash
npm install
cp model-profiles.example.json model-profiles.json
npm run rag:ingest -- --subject all
npm run dev
npm run check
```

注意：不要提交真实 API Key、`.env.local`、`model-profiles.json`、`.stemotion/` 或 `.next/`。
