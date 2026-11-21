@echo off

echo.

start "Backend" cmd /k "cd /d %~dp0backend && .\venv\Scripts\activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Backend starting at: http://127.0.0.1:8000 (Swagger docs: http://127.0.0.1:8000/docs)
echo Frontend starting at: http://localhost:5173

