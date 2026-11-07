# Kimi 星律挂件 · Kimi Symphony Widget

个性化网站地址https://kimi-symphony-d3gbac9jxfdeab165-1525197159.ap-shanghai.app.tcloudbase.com/kimi
一个独立的 Kimi 娘桌面挂件，当前发布 Windows x64 便携版，macOS 版本暂缓。显示 Kimi 官方订阅套餐用量，提供 Kimi、Kimi Code、自定义应用与网址入口，并根据任务状态切换常态、工作和完成形象。

## 功能

- 每 60 秒读取官方订阅用量，同步失败时保留最近一次成功数据。
- 常态、工作、完成三种形象与文案，支持多任务计数。
- 拖动、贴边、置顶、开机自启、大小调整和点击音效。
- 公共账号配置中心：自定义三种形象、随机文案、气泡版式、应用入口、插件和音效，并同步到登录的挂件。
- 配置网站公告板提供参考项目、素材出处、最新安装包和更新入口。
- 发行版支持检查更新与一键更新；更新包通过 Release 中的 SHA-512 校验后才替换程序。

## 安装

Windows 下载地址统一使用 GitHub 最新 Release，不会因版本号变化而失效：

`https://github.com/PIANPIANbtf/Kimi-Symphony-Widget/releases/latest/download/Kimi-Symphony-Widget-Windows-x64.exe`

下载后直接运行 exe，无需安装 Node.js。这是便携版，配置不会写入程序目录。项目未购买代码签名证书，首次运行时 Windows SmartScreen 可能提示确认，请只从项目 Release 下载。

macOS 暂未发布，网站不会提供无效的 Mac 下载链接。

## 个人配置如何同步到挂件

打开公共配置中心并注册或登录：

```text
https://kimi-symphony-d3gbac9jxfdeab165-1525197159.ap-shanghai.app.tcloudbase.com/config
```

网站将文字设置、应用入口和自定义素材保存到当前账号。挂件在首次登录时迁移本机配置，之后只在用户点击“立即同步”时下载云端更新，不进行定时或启动自动同步。挂件只保存随机会话令牌，不保存账号密码；窗口位置、弹窗开关、置顶和开机自启仍按设备分别保留。

账号密码使用加盐 PBKDF2 哈希，网站会话使用 HttpOnly、Secure、SameSite Cookie。自定义素材按账号隔离并分块存储。Kimi 官方凭据始终只在本机用于官方用量接口，不会上传到账号、公告或 Release。

## 更新

配置网站公告板提供“检查更新”和“一键更新”：

1. 从项目 GitHub 最新 Release 获取版本信息。
2. 下载 Windows x64 便携安装包。
3. 使用 `latest.yml` 中的 SHA-512 校验文件。
4. 关闭旧挂件、保留旧版本备份、替换程序并重新启动。

一键更新仅对打包后的发行版开放，开发模式不会覆盖 Electron 或 Node.js。公告中的 `releases/latest` 地址始终指向最新版，发布新版本时无需修改链接。

## 开发

需要 Node.js 24 和 npm。

```bash
npm ci
npm start
```

Windows PowerShell 如果拦截 `npm.ps1`，使用：

```powershell
npm.cmd start
```

其他命令：

```bash
npm run studio       # 单独启动配置网站
npm run check        # JavaScript 语法检查
npm run dist:win     # Windows x64 便携 exe
```

Windows 构建产物位于 `release/`。GitHub Actions 当前只运行 Windows 构建；macOS 配置保留在项目中，但暂不构建或发布。

## 发布到 GitHub

项目仓库已在 `release.config.json` 中配置为 `PIANPIANbtf/Kimi-Symphony-Widget`。如果以后迁移仓库，只需修改这一处。

发布当前 `v1.1.4`：

```bash
git add .
git commit -m "release: v1.1.4"
git push origin main
git tag v1.1.4
git push origin v1.1.4
```

标签推送后，在 GitHub 的 Actions 页面等待 Windows 构建和 Release 任务完成，再到 Releases 检查 Windows exe 与 `latest.yml`。不要删除 `latest.yml`，一键更新需要它。

以后发布新版时，先运行 `npm version <新版本> --no-git-tag-version`，再提交、推送并创建同名标签。

## CloudBase 公共网站（当前）

公共地址：https://kimi-symphony-d3gbac9jxfdeab165-1525197159.ap-shanghai.app.tcloudbase.com

当前国内环境位于 `cloudbase/`，使用 CloudBase 云函数、PostgreSQL 和分块素材存储，提供账号注册登录、个性化配置、公告、下载、版本检查和素材说明。挂件只在首次登录和手动点击“立即同步”时更新，Kimi 官方凭据不会上传。

重新部署函数：

```powershell
npx.cmd tcb login
npm.cmd run cloudbase:deploy
```

免费版每月包含 3,000 资源点，每 6 个月需要续期。Kimi 官方用量查询不经过 CloudBase。

默认 `tcloudbase.com` 域名仅供开发测试，首次访问可能显示平台风险提示。正式向大量用户分发前，必须配置已完成 ICP 备案的自定义域名，否则平台可能因流量触发风控。

## Cloudflare 备用网站

备用门户位于 `cloudflare/`。Worker 改名后需重新执行一次 `npx.cmd wrangler secret put ANNOUNCEMENT_KEY`，Cloudflare 不会自动复制 Secret。

首次部署时，在项目目录完成一次 Cloudflare 授权并设置公告密钥：

```powershell
npx.cmd wrangler login
npx.cmd wrangler secret put ANNOUNCEMENT_KEY
npm.cmd run web:deploy
```

`wrangler login` 会打开 Cloudflare 授权页面；`secret put` 会在终端中要求输入公告密钥，密钥不会写入仓库。以后修改公告时输入同一密钥。

部署成功后，Wrangler 会输出 `workers.dev` 公网地址。可访问 `/api/health` 检查状态。更新公共网站只需再次运行 `npm.cmd run web:deploy`。

本地预览：

```powershell
npm.cmd run web:dev
```

## 项目结构

```text
main.cjs                 Electron 窗口、应用入口与任务状态
preload.cjs              安全 IPC
server.mjs               本机配置网站与 API
renderer/                桌面挂件界面
config/                  配置网站
lib/                     配置、素材、用量、任务、项目与更新逻辑
assets/                  默认形象、主题与音效
scripts/                 用量导入工具
electron-builder.yml     Windows / macOS 打包配置
release.config.json      GitHub 仓库与固定下载文件名
.github/workflows/       自动构建和 Release
NOTICE                   素材来源与许可
```

## 参考与许可

- 交互参考：[NieRMHY/dsh-whale-widget](https://github.com/NieRMHY/dsh-whale-widget)；其音频素材未包含在本项目中。
- 常态 Kimi 娘形象来源：[pigeon189/zcode-fox-widget](https://github.com/pigeon189/zcode-fox-widget)。
- 工作与完成形象、Kimi 风铃 WAV 均由项目作者偏翩创作。
- 详细素材说明见 [NOTICE](NOTICE)。
- 代码采用 [MIT License](LICENSE)，第三方素材仍遵循其原始许可。
