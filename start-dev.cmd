@echo off
setlocal

set "NODE_DIR=%ProgramFiles%\nodejs"
set "NPM_CMD=%NODE_DIR%\npm.cmd"

if not exist "%NPM_CMD%" (
  echo Node.js tidak ditemukan di "%NPM_CMD%".
  echo Install Node.js LTS lalu coba lagi.
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"
call "%NPM_CMD%" run dev
