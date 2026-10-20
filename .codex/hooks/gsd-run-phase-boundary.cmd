@echo off
setlocal

set "LOG_DIR=C:\Projects\strive-ai-hired\.codex\hook-debug"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "STDIN_FILE=%TEMP%\gsd-gsd-run-phase-boundary-stdin.json"
more > "%STDIN_FILE%"

type "%STDIN_FILE%" | "C:\Program Files\Git\bin\bash.exe" "C:\Projects\strive-ai-hired\.codex\hooks\gsd-phase-boundary.sh" >> "%LOG_DIR%\gsd-run-phase-boundary.out.log" 2>> "%LOG_DIR%\gsd-run-phase-boundary.err.log"

echo %ERRORLEVEL% >> "%LOG_DIR%\gsd-run-phase-boundary.exitcode.log"

exit /b 0
