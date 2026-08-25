@echo off
setlocal
rem ============================================================
rem  Publish win-shell-mcp to npmjs.org
rem  前置：已用 npm login --registry=https://registry.npmjs.org/
rem        （账号 a1072636071 拥有该包名）
rem  用法：双击 或 在终端执行本脚本
rem  注意：发布前确保 package.json 的 version 已递增
rem         （重复发布同一版本会报错，属预期保护）
rem ============================================================

rem 切换到本脚本所在目录（即仓库根目录）
cd /d "%~dp0"

echo =====[1/4] 校验 npmjs 登录状态 =====
call npm whoami --registry=https://registry.npmjs.org/
if errorlevel 1 (
  echo.
  echo [X] 未登录/认证失败，请先执行:
  echo     npm login --registry=https://registry.npmjs.org/
  exit /b 1
)

echo =====[2/4] 类型检查 =====
call npm run typecheck
if errorlevel 1 goto :err

echo =====[3/4] 构建 =====
call npm run build
if errorlevel 1 goto :err

echo =====[4/4] 发布到 registry.npmjs.org =====
call npm publish --registry=https://registry.npmjs.org/
if errorlevel 1 goto :err

echo.
echo ===== 发布成功 OK =====
exit /b 0

:err
echo.
echo [X] 发布流程失败，请查看上方日志
exit /b 1