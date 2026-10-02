# NVDA 实时新闻

手机优先的 NVDA / 英伟达新闻时间线，每 15 分钟自动抓取更新。

- 线上地址：https://bluesangg.github.io/nvda-news/
- 数据源：Google News RSS（英文 + 中文）
- 更新机制：VM 上的 cron 每 15 分钟运行 `agent_notes/update.sh`（抓取 → 去重聚类 → 推送 main 分支）
- 纯静态站：无构建步骤、无密钥、无后端
