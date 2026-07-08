# dev-server skill

description: Start, stop, restart, or check status of the local backend (FastAPI, port 8002) and frontend (Next.js, port 3000) dev servers.

## Trigger phrases
- "start the app", "run the app", "start the servers"
- "stop the app", "kill the servers"
- "restart the backend", "restart the app"
- "server status", "are the servers running"

## How the servers run

Both servers are launched as background bash processes and write to log files in their respective directories:
- Backend log: `backend/backend_run.log`
- Frontend log: `frontend/frontend_run.log`

PID files are NOT used — process state is determined by port occupancy.

## Killing existing processes

**Always kill via PowerShell** — `pkill` in bash does not reliably terminate Windows processes.

Kill all Python processes that are uvicorn workers (they show up as `python.exe` with `multiprocessing.spawn` in the cmdline, OR as processes listening on port 8002):

```powershell
# Kill everything on port 8002
$procs = Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
$procs | ForEach-Object { taskkill /PID $_ /F 2>&1 }

# Also kill orphaned multiprocessing workers spawned by uvicorn
Get-WmiObject Win32_Process | Where-Object {
    $_.Name -like "python*" -and $_.CommandLine -like "*multiprocessing*"
} | ForEach-Object { taskkill /PID $_.ProcessId /F 2>&1 }

Start-Sleep -Seconds 2
```

Kill frontend (Next.js on port 3000):

```powershell
$procs = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
$procs | ForEach-Object { taskkill /PID $_ /F 2>&1 }
Start-Sleep -Seconds 2
```

## Starting servers

After killing, start both as background bash processes:

```bash
# Backend
cd "C:\Users\DRAGON\Desktop\kanataki-zwei\home-pro-manager\backend"
"venv/Scripts/uvicorn.exe" main:app --host 127.0.0.1 --port 8002 --reload > backend_run.log 2>&1 &

# Frontend
cd "C:\Users\DRAGON\Desktop\kanataki-zwei\home-pro-manager\frontend"
npm run dev > frontend_run.log 2>&1 &
```

Wait 10 seconds, then verify:

```bash
curl -s http://127.0.0.1:8002/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Backend healthy = `{"status":"ok","app":"Home Pro Manager"}`.
Frontend healthy = HTTP 200 or 307 (redirect to login).

## Checking status

```powershell
$be = (Get-NetTCPConnection -LocalPort 8002 -State Listen -ErrorAction SilentlyContinue).Count -gt 0
$fe = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).Count -gt 0
Write-Output "Backend (8002): $(if ($be) { 'UP' } else { 'DOWN' })"
Write-Output "Frontend (3000): $(if ($fe) { 'UP' } else { 'DOWN' })"
```

## Checking logs for errors

```bash
# Last 20 lines of backend log
tail -20 "C:\Users\DRAGON\Desktop\kanataki-zwei\home-pro-manager\backend\backend_run.log"

# Last 20 lines of frontend log
tail -20 "C:\Users\DRAGON\Desktop\kanataki-zwei\home-pro-manager\frontend\frontend_run.log"
```

## Workflow for restart after backend code changes

1. Kill backend (PowerShell — port 8002 + orphaned workers)
2. Wait 2 seconds
3. Start backend (bash background)
4. Wait 10 seconds for startup
5. Hit `/health` to confirm
6. Browser: hard refresh (Ctrl+Shift+R)

Frontend hot-reloads automatically on file changes — no restart needed unless `HouseholdContext.tsx` or layout files change (Next.js does a full reload, shown in frontend_run.log as "Fast Refresh had to perform a full reload").

## Important notes

- `pkill` in the bash tool does NOT reliably kill Windows processes. Always use PowerShell `taskkill` or `Stop-Process` for killing.
- Uvicorn `--reload` spawns a parent reloader + child worker via `multiprocessing`. Killing only the parent leaves orphaned workers still holding the port.
- After code changes, uvicorn `--reload` watches for file changes and hot-reloads — but it sometimes misses changes in nested subdirectories. If routes are missing from the live server, do a full restart.
