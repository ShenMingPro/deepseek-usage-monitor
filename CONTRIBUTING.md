# 参与贡献

感谢你愿意改进 DeepSeek Usage Monitor。提交代码前请先确认改动适合在本地、单用户环境中运行。

## 开发环境

- Windows 10/11
- Node.js 18 或更高版本
- Microsoft Edge WebView2 Runtime
- .NET Framework 4.8（Windows 10/11 通常已自带）

## 本地检查

```powershell
npm test
```

该命令会检查 JavaScript、PowerShell 脚本，编译托盘、WebView2 宿主和桌面启动器，并对本地服务做一次健康检查。

## 提交建议

- 保持改动聚焦，避免把调试截图、日志、API Key 或本机会话路径提交进仓库。
- 桌面功能仅面向 Windows；浏览器面板的服务端代码尽量保持跨平台。
- 涉及计费口径、会话解析或窗口行为时，请在 Pull Request 中说明验证方式。
- 新增第三方代码或素材时，同时更新 `THIRD_PARTY_NOTICES.md`。

## 提交信息

建议使用简短、可读的提交信息，例如：

```text
feat: add CSV export filter
fix: keep widget visible after display change
docs: clarify API key resolution order
```

