# Kimi 星律挂件 · Kimi Symphony Widget

一个独立的 Kimi 娘桌面挂件，当前发布 Windows x64 便携版，macOS 版本暂缓。显示 Kimi 官方订阅套餐用量，提供 Kimi、Kimi Code、自定义应用与网址入口，并根据任务状态切换常态、工作和完成形象。

## 功能

- 每 60 秒读取官方订阅用量，同步失败时保留最近一次成功数据。
- 常态、工作、完成三种形象与文案，支持多任务计数。
- 拖动、贴边、置顶、开机自启、大小调整和点击音效。
- 本机配置网站：自定义三种形象、随机文案、气泡版式、应用入口、插件和音效。
- 配置网站公告板提供参考项目、素材出处、最新安装包和更新入口。
- 发行版支持检查更新与一键更新；更新包通过 Release 中的 SHA-512 校验后才替换程序。

## 安装

Windows 下载地址统一使用 GitHub 最新 Release，不会因版本号变化而失效：

`https://github.com/PIANPIANbtf/Kimi-Symphony-Widget/releases/latest/download/Kimi-Symphony-Widget-Windows-x64.exe`

下载后直接运行 exe，无需安装 Node.js。这是便携版，配置不会写入程序目录。项目未购买代码签名证书，首次运行时 Windows SmartScreen 可能提示确认，请只从项目 Release 下载。

macOS 暂未发布，网站不会提供无效的 Mac 下载链接。

## 个人配置如何同步到挂件

启动挂件后，应用会自动在本机启动配置网站：

```text
http://127.0.0.1:45739/config
```

网站和挂件读取同一份本机配置，保存后立即同步。自定义图片和 MP3 也保存在本机。每个 Windows／macOS 用户有独立的数据目录：

```text
~/.kimi-symphony-widget/
```

该服务只监听 `127.0.0.1`，不需要账号，也不会把配置或 Kimi 凭据上传到公共服务器。它不是多设备云同步；更换设备时可在关闭挂件后备份该目录。套餐用量使用本机 Kimi Code 凭据访问官方接口，凭据不会进入网站、日志或 Release。

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

发布当前 `v1.0.1`：

```bash
git add .
git commit -m "release: v1.0.1"
git push origin main
git tag v1.0.1
git push origin v1.0.1
```

标签推送后，在 GitHub 的 Actions 页面等待 Windows 构建和 Release 任务完成，再到 Releases 检查 Windows exe 与 `latest.yml`。不要删除 `latest.yml`，一键更新需要它。

以后发布新版时，先运行 `npm version <新版本> --no-git-tag-version`，再提交、推送并创建同名标签。

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
