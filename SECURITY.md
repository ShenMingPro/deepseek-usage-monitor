# 安全说明

## 支持范围

安全修复面向最新版本和 `main` 分支。

## 报告问题

请不要在公开 Issue 中披露 API Key、会话路径、聊天日志或其他敏感信息。优先通过 GitHub 的
[Private vulnerability reporting](https://github.com/ShenMingPro/deepseek-usage-monitor/security/advisories/new)
提交安全问题。

报告中请尽量包含：

- 受影响的版本或提交
- 复现步骤
- 影响范围
- 建议的修复方式（如有）

## 本地安全模型

- 服务默认只监听 `127.0.0.1:4173`，没有为公网部署设计身份认证。
- 页面不接收 API Key；余额请求由本地 Node 进程完成。
- API Key 只保存在当前服务进程内存中，或从 `DEEPSEEK_API_KEY` / Codex 配置读取。
- 会话监听只解析 Token 元数据，不读取或展示聊天正文。
- 不要把 `HOST` 改为 `0.0.0.0` 后直接暴露到公网。如需远程访问，应自行增加认证、TLS、反向代理和访问控制。

