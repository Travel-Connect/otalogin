@echo off
REM ============================================================
REM neppan-password-rotator: 30日ごとの自動ローテーション
REM Windows タスクスケジューラから日次起動される想定
REM   pnpm rotate-due --auto --live
REM ============================================================

REM ログ出力先（実行履歴をファイルにも残す）
set "SCRIPT_DIR=%~dp0"
set "TASK_LOG_DIR=%SCRIPT_DIR%logs\task-scheduler"
if not exist "%TASK_LOG_DIR%" mkdir "%TASK_LOG_DIR%"

REM タイムスタンプ生成（YYYYMMDD_HHMMSS）
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "DT=%%a"
set "TS=%DT:~0,8%_%DT:~8,6%"
set "TASK_LOG=%TASK_LOG_DIR%\run-%TS%.log"

REM 文字コード UTF-8（日本語コンソール出力対応）
chcp 65001 > nul

cd /d "%SCRIPT_DIR%"

echo [%TS%] starting rotate-due... > "%TASK_LOG%"
echo [%TS%] starting rotate-due...

REM pnpm 経由で実行。stdout/stderr 両方をログに保存
call pnpm rotate-due --auto --live --days 30 --limit 5 >> "%TASK_LOG%" 2>&1
set "EXITCODE=%ERRORLEVEL%"

echo [done] exit code = %EXITCODE% >> "%TASK_LOG%"
echo [done] exit code = %EXITCODE%
echo [done] log: %TASK_LOG%

exit /b %EXITCODE%
