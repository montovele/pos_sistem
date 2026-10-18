@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  if errorlevel 1 (
    echo Error: no se pudo crear .env desde .env.example.
    exit /b 1
  )
)

findstr /R /C:"^[ ]*HARDWARE_AGENT_TOKEN[ ]*=[ ]*[^ ]" ".env" >nul
if errorlevel 1 (
  echo Error: falta HARDWARE_AGENT_TOKEN en .env. Reinstala el agente con el instalador actualizado.
  exit /b 1
)

"%~dp0runtime\node.exe" "%~dp0app\server.js"
set "AGENT_EXIT_CODE=%ERRORLEVEL%"
if not "%AGENT_EXIT_CODE%"=="0" (
  echo El agente termino con codigo %AGENT_EXIT_CODE%.
  pause
)
exit /b %AGENT_EXIT_CODE%
