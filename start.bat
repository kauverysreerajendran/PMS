@echo off
REM Starts the StayHub backend (FastAPI on :8000) and frontend (Vite on :5173)
REM in separate windows. Close those windows to stop the servers.

setlocal
set "ROOT=%~dp0"

if not exist "%ROOT%backend\.venv\Scripts\activate.bat" (
    echo [ERROR] Python venv not found at backend\.venv
    echo Create it with:  cd backend ^&^& python -m venv .venv ^&^& .venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

if not exist "%ROOT%frontend\node_modules" (
    echo Installing frontend dependencies...
    pushd "%ROOT%frontend"
    call npm install || (popd & pause & exit /b 1)
    popd
)

echo Starting backend on http://127.0.0.1:8000 ...
start "StayHub Backend" cmd /k "cd /d "%ROOT%backend" && call .venv\Scripts\activate.bat && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo Starting frontend on http://localhost:5173 ...
start "StayHub Frontend" cmd /k "cd /d "%ROOT%frontend" && set VITE_API_URL=http://127.0.0.1:8000&& npm run dev -- --port 5173"

endlocal
