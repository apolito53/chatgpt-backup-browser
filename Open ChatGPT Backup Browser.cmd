@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
start "" wscript.exe "%SCRIPT_DIR%START_BROWSER.vbs"

endlocal
