@echo off
setlocal

set "LOG_DIR=C:\Projects\strive-ai-hired\.codex\hook-debug"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "STDIN_FILE=%TEMP%\gsd-gsd-run-check-update-stdin.json"
more > "%STDIN_FILE%"

type "%STDIN_FILE%" | "C:\Program Files\nodejs\node.exe" "C:\Projects\strive-ai-hired\.codex\hooks\gsd-check-update.cjs" >> "%LOG_DIR%\gsd-run-check-update.out.log" 2>> "%LOG_DIR%\gsd-run-check-update.err.log"

echo %ERRORLEVEL% >> "%LOG_DIR%\gsd-run-check-update.exitcode.log"

exit /b 0
