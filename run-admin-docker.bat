@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM Quick runner for the relay admin UI in Docker (Windows)

REM Defaults (can be overridden via .env)
set DOCKER_IMAGE=kreo-relays-admin
set ADMIN_HOST=0.0.0.0
set ADMIN_PORT=4000
set ADMIN_TOKEN=
set GIT_AUTO_PUSH=0
set GIT_REMOTE=origin
set GIT_BRANCH=main
set GIT_COMMIT_MSG=Update relays.json via admin UI
set GITHUB_TOKEN=
set GITHUB_RELAYS_URL=
set RELAYS_JSON=%CD%\relays.json
set MOUNT_ARGS=

REM Script directory
set SCRIPT_DIR=%~dp0

REM Load .env if present (simple parser, ignores lines starting with #)
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "line=%%A"
    if not "!line!"=="" if not "!line:~0,1!"=="#" (
      set "%%A=%%B"
    )
  )
)

REM Normalize RELAYS_JSON to absolute path (%%~f expands to full path)
for %%F in ("%RELAYS_JSON%") do set RELAYS_JSON=%%~fF

REM Decide mount strategy: if git repo present, mount entire repo for git push; else only relays.json
if exist "%SCRIPT_DIR%\.git" (
  set MOUNT_ARGS=-v "%SCRIPT_DIR%":/app
) else (
  set MOUNT_ARGS=-v "%RELAYS_JSON%":/app/relays.json
)

REM Ensure relays.json exists (create empty structure if missing)
if not exist "%RELAYS_JSON%" (
  echo Creating "%RELAYS_JSON%" ...
  echo {"relays": []} > "%RELAYS_JSON%"
)

echo Using image: %DOCKER_IMAGE%
echo Admin host/port: %ADMIN_HOST%:%ADMIN_PORT%
echo Mounting relays.json from: %RELAYS_JSON%

echo Building image...
docker build -t %DOCKER_IMAGE% .
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo Running container (Ctrl+C to stop)...
docker run --rm ^
  -p %ADMIN_PORT%:%ADMIN_PORT% ^
  -e ADMIN_HOST=%ADMIN_HOST% ^
  -e ADMIN_PORT=%ADMIN_PORT% ^
  -e ADMIN_TOKEN=%ADMIN_TOKEN% ^
  -e GIT_AUTO_PUSH=%GIT_AUTO_PUSH% ^
  -e GIT_REMOTE=%GIT_REMOTE% ^
  -e GIT_BRANCH=%GIT_BRANCH% ^
  -e GIT_COMMIT_MSG="%GIT_COMMIT_MSG%" ^
  -e GITHUB_TOKEN=%GITHUB_TOKEN% ^
  -e GITHUB_RELAYS_URL=%GITHUB_RELAYS_URL% ^
  %MOUNT_ARGS% ^
  %DOCKER_IMAGE%

endlocal
