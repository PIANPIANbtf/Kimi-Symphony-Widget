@echo off
setlocal
cd /d "%~dp0"
title Kimi Symphony Widget

where node >nul 2>nul
if errorlevel 1 (
  echo [Kimi 挂件] 未找到 Node.js，请先安装 Node.js 22 或更高版本。
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [Kimi 挂件] 首次运行，正在安装运行依赖……
  call npm.cmd install
  if errorlevel 1 goto error
)

call npm.cmd start
if errorlevel 1 goto error
exit /b 0

:error
echo.
echo [Kimi 挂件] 启动失败，请保留此窗口中的错误信息。
pause
exit /b 1
