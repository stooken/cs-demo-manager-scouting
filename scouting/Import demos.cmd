@echo off
setlocal
if "%~1"=="" (
  "%~dp0runtime\node.exe" "%~dp0native\import-season.mjs"
) else (
  "%~dp0runtime\node.exe" "%~dp0native\import-season.mjs" --archives "%~f1"
)
set "result=%errorlevel%"
pause
exit /b %result%
