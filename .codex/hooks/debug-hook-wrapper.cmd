@echo off
setlocal enabledelayedexpansion

set "LOG_DIR=C:\Projects\strive-ai-hired\.codex\hook-debug"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "NAME=%~1"
shift

set "TS=%RANDOM%-%RANDOM%-%RANDOM%"

set "STDIN_FILE=%LOG_DIR%\%NAME%-%TS%.stdin.json"
set "OUT_FILE=%LOG_DIR%\%NAME%-%TS%.out.log"
set "ERR_FILE=%LOG_DIR%\%NAME%-%TS%.err.log"
set "ENV_FILE=%LOG_DIR%\%NAME%-%TS%.env.log"
set "EXIT_FILE=%LOG_DIR%\%NAME%-%TS%.exitcode"

more > "%STDIN_FILE%"
set > "%ENV_FILE%"

type "%STDIN_FILE%" | %* > "%OUT_FILE%" 2> "%ERR_FILE%"
echo %ERRORLEVEL% > "%EXIT_FILE%"
exit /b %ERRORLEVEL%