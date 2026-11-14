# Studio Proxy (`AIStudio2API`) — Production Architecture, Startup Lifecycle & Operations Guide

**Last Updated:** 2026-11-13  
**Live Endpoint:** `http://127.0.0.1:2048`  
**Production Directory (`AioDir`):** `C:\Users\silen\Downloads\texture\AIStudio2API\aio`  
**Source Repository:** `C:\Users\silen\workspaces\imp\studio-proxy` (`main`)  
**Verified Rollback Snapshot:** `C:\Users\silen\backups\studio-proxy-rollback-20261113`

---

## 1. Current Production State (Verified)

| Component | Path / Value | Details |
| :--- | :--- | :--- |
| **Live Binary** | `C:\Users\silen\Downloads\texture\AIStudio2API\aio\aistudio2api.exe` | `56,602,624` bytes, `SHA256=9339E4A455A8B1FDD1207F342FC88115609C4C370808CF2FF9D2407D3C09C0F1` (`v0.0.0-20261113151209-726462e76a0e`, built with `-tags "desktop,production"`) |
| **Camoufox Runtime** | `C:\Users\silen\Downloads\texture\AIStudio2API\aio\runtime\camoufox` | `Version=158.0.1-beta.41` (Firefox `158.0`; all 24 account `camoufox-fingerprint.json` profiles migrated to `firefox_version=158`) |
| **Configuration** | `C:\Users\silen\Downloads\texture\AIStudio2API\aio\.env` | UTF-8 (no BOM), `AUTO_START=true`, `WARM_WORKER_LIMIT=4`, `MAX_ACTIVE_WORKERS=5`, `WARM_STARTUP_CONCURRENCY=2`, `PER_ACCOUNT_CONCURRENCY=3`, `PER_MODEL_CONCURRENCY=2`, `IDLE_WORKER_TIMEOUT=10m`, `IDLE_HIBERNATE_TIMEOUT=15m` |
| **Accounts & Catalogs** | `C:\Users\silen\Downloads\texture\AIStudio2API\aio\auth\*` | 24 Google AI Studio accounts (`storage-state.json`, `runtime-state.json`, `account.json`, `camoufox-fingerprint.json`, `catalog.json`) |

---

## 2. How PC Reboot, Logon & App Launchers Start the Proxy

The proxy runs as an **unpinned, standalone Windows system tray application** (`aistudio2api.exe --no-open`). It is **no longer tied to the lifecycle of any IDE window** (closing Antigravity or T3 Code will never stop the proxy).

### All 5 Startup Entry Points
1. **Windows Logon / PC Reboot (Automatic):**
   - **Shortcut:** `C:\Users\silen\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\Shared AI Studio proxy.lnk`
   - **Target:** `"C:\Users\silen\Downloads\texture\AIStudio2API\aio\aistudio2api.exe" --no-open`
   - **Working Directory:** `C:\Users\silen\Downloads\texture\AIStudio2API\aio` (`WindowStyle=7` minimized/tray-only)
   - **Behavior:** As soon as you log into Windows after a reboot, `aistudio2api.exe --no-open` starts in the system tray, loads `.env` (`AUTO_START=true`), binds `127.0.0.1:2048`, and warms up `WARM_WORKER_LIMIT=4` browser workers (2 at a time via `WARM_STARTUP_CONCURRENCY=2`).
2. **Antigravity ACP Bootstrap (Automatic on Agent Session Start):**
   - **Files:** `C:\Users\silen\.gemini\antigravity-acp\proxy-bootstrap.cjs` and `C:\Users\silen\.gemini\antigravity-acp\start-shared-proxy.ps1`
   - **Behavior:** Checks `GET http://127.0.0.1:2048/health` first, then checks if `aistudio2api.exe` is already running (even if still booting), and only spawns `"C:\Users\silen\Downloads\texture\AIStudio2API\aio\aistudio2api.exe" --no-open` if the process is completely absent. This prevents duplicate-instance launch races from popping open the GUI window.
3. **GUI Argon Launchers (Automatic when launching Argon):**
   - **Files:** `C:\Users\silen\Downloads\argon-antigravity-setup\gui-argon\Start-Argon.ps1`, `Start-Native-Argon.ps1`, and `ProxyReadiness.ps1`
   - **Behavior:** Uses the same health + process check to start `aistudio2api.exe --no-open` if not running, then polls `GET http://127.0.0.1:2048/api/status` (`Wait-AIStudioReady`) for up to 60 seconds until `running=true` and `ready=true`.
4. **Desktop Shortcut (Manual Dashboard + Tray):**
   - **Shortcut:** `C:\Users\silen\Desktop\Studio Proxy.lnk`
   - **Target:** `"C:\Users\silen\Downloads\texture\AIStudio2API\aio\aistudio2api.exe"` (no `--no-open`, opens the dashboard window; if already running in the tray, Wails single-instance lock brings the existing dashboard window to the foreground).
5. **CLI / Batch Script (Manual):**
   - **File:** `C:\Users\silen\Downloads\texture\AIStudio2API\aio\start.bat`
   - **Behavior:** Launches `aistudio2api.exe` from `AioDir`.

### Legacy Watchdogs & Conflicts Removed
- **`HKCU:\Software\Microsoft\Windows\CurrentVersion\Run :: T3AIStudioProxy` removed:** Previously, this registry key launched `t3-aistudio-watchdog.exe --watch-owner` at Windows login, which fought with the Startup shortcut and killed `aistudio2api.exe` whenever `T3 Code` / `Antigravity` closed. It has been backed up (`launchers-backup\registry-T3AIStudioProxy.txt`) and removed from the Registry.
- **`CLIProxyAPI` removed:** Killed `daemon.mjs` and `cli-proxy-api.exe`, deleted `Startup\Antigravity CLIProxyAPI.vbs`, deleted `\AntigravityProxyWatchdog` scheduled task, and removed `C:\Users\silen\.cli-proxy-api` and `C:\Users\silen\CLIProxyAPI`.

---

## 3. Worker Pool, Hibernation & Cold-Catalog Scheduling

### Concurrency & Lifecycle (`aio\.env`)
- **`WARM_WORKER_LIMIT=4` / `MAX_ACTIVE_WORKERS=5`:** Keeps 4 Camoufox browser workers pre-warmed and ready (`~2–3 GB` RAM total instead of 24 browsers eating `15+ GB`), bursting up to 5 concurrent browsers under load.
- **`WARM_STARTUP_CONCURRENCY=2`:** Launches at most 2 Camoufox browsers simultaneously during startup to avoid CPU/disk spikes on boot.
- **`PER_ACCOUNT_CONCURRENCY=3` / `PER_MODEL_CONCURRENCY=2`:** Allows up to 2 parallel requests for the same model on one account (and 3 total across different models on one account) before rotating to the next account.
- **`IDLE_WORKER_TIMEOUT=10m`:** Extra burst workers above `WARM_WORKER_LIMIT` close after 10 minutes of inactivity.
- **`IDLE_HIBERNATE_TIMEOUT=15m`:** If the proxy receives **zero API requests** (`/v1/*`, `/v1beta/*`) for 15 minutes, it enters **Hibernation** (`hibernating=true` in `/api/status`) and closes all Camoufox browsers to drop background RAM/CPU to near zero. Health checks (`/health`, `/api/status`) do **not** reset the idle timer. The next real API request automatically wakes the pool and warms browsers on the fly.

### Cold-Catalog 429 Prevention (`726462e`)
1. **Uncooled-First Startup Priority (`modelCatalogAccountIDs`):** When selecting an account to sync model catalogs, accounts are bucketed by:
   - Tier 0: Zero active model cooldowns (`activeModelCooldownCount == 0`)
   - Tier 1: Currently warm/running worker (`hasWorker == true`)
   - Tier 2: Fewest active model cooldowns, then alphabetical ID
2. **On-Demand Singleflight Catalog Sync (`trySyncUncataloguedForSelection`):** If all already-catalogued accounts for a requested model (e.g. `gemini-4-argon`) are on cooldown while uncatalogued Ready accounts exist (`len(Models) == 0`), the scheduler synchronizes uncatalogued accounts on demand (deduplicated per account via singleflight) before ever returning `HTTP 429 AllCoolingError`.

---

## 4. Safe Cutover, Independent Dead-Man Watchdog & Rollback

### Why Previous Cutover Attempts Failed (Root Causes & Fixes)
- **Attempt 1 (18:17 — Rolled back cleanly on `429`):** Upgrading from `v0.2.16` started with `0` `catalog.json` files. Alphabetical catalog sync picked `alatus128@gmail.com` (cooled on Argon/Hydrogen) first and treated the 22 uncatalogued accounts as ineligible. Fixed in commit `726462e` and verified live on port `2049` with all 24 accounts (`0` `catalog.json`).
- **Attempt 2 (20:44 — Died mid-backup):** Stopping `:2048` severed the agent session 4 seconds later while copying `1.1 GB` in-process, killing the PowerShell process before its `try/catch` rollback could run. Fixed in commit `5b92e65`:
  1. **Pre-Stop Backup (`-BackupOnly`) + Fast Post-Stop Delta Sync (`sync_mutable`):** Full `1.1 GB` backup is verified *before* `:2048` stops; after stopping `:2048`, only mutable `.env` and `auth/**` files are delta-synced (`< 1s`).
  2. **Separate OS Watchdog Process (`deadman-watchdog.ps1`):** Spawned via `Win32_Process.Create` and armed (`watchdog.armed`) *before* `:2048` stops. Polls `/health`, `/api/status`, and live `POST /v1/chat/completions` (`gemini-4-argon`), and automatically executes `rollback.ps1` if the cutover process dies or fails the gate.
  3. **Detached Cutover Launcher (`Start-DetachedCutover.ps1`):** Runs `cutover-with-rollback.ps1` inside a Windows Scheduled Task (`-UseScheduledTask`) or detached `Win32_Process.Create` so agent session death cannot kill it.

### Manual 1-Line Rollback Command
To revert `C:\Users\silen\Downloads\texture\AIStudio2API\aio` and all shortcuts/launchers back to the pre-cutover `v0.2.16` snapshot (`723` SHA-256 verified files):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\silen\backups\studio-proxy-rollback-20261113\rollback.ps1"
```
*(Add `-DryRun` to verify integrity without making changes, or `-PreserveLiveCooldowns` to keep newer `runtime-state.json` cooldown timestamps.)*

---

## 5. Caveats & Things to Know Before Sleeping / Rebooting

1. **System Tray "Pause Proxy" vs "Quit":**
   - If you click **Pause Proxy** in the system tray menu, `/health` still returns `200`, but `/api/status` reports `running: false, state: "STOPPED"`.
   - In that state, `Start-Argon.ps1` / `Wait-AIStudioReady` will wait 60s and tell you: *"AIStudio2API is paused or not started (running=false)... Right-click the Studio Proxy system tray icon and choose 'Resume Proxy'"*.
   - On a **PC restart**, `.env` has `AUTO_START=true`, so it always boots in `RUNNING` state automatically.
2. **First Request After 15 Minutes of Idle (Hibernation Wakeup):**
   - After 15 minutes with zero LLM requests, the proxy hibernates all Camoufox browsers (`warm_workers: 0, hibernating: true`) to save ~2.5 GB of RAM while you sleep or do other work.
   - The **first request** after hibernation wakes a Camoufox worker on demand, so that first call will take **~12–20 seconds** instead of `~2 seconds`. Subsequent calls are fast again.
3. **First 20–30 Seconds Immediately After Windows Login:**
   - Right after Windows boots and logs you in, `Shared AI Studio proxy.lnk` launches `aistudio2api.exe --no-open`.
   - The HTTP server on `:2048` is up within ~1 second, and the first warm Camoufox browser finishes launching in **~15–20 seconds** (`ready: true`). If you launch Antigravity immediately at login, `Wait-AIStudioReady` automatically waits (up to 60s) for that first worker to become ready.
4. **Hydrogen (`gemini-4-hydrogen`) Daily Quota Cooldowns:**
   - Currently, all 23 eligible accounts are on Google AI Studio daily quota cooldown for `gemini-4-hydrogen` (`ready: 0, cooldown: 23`), while `gemini-4-argon` has `15` ready accounts (`ready: 15, cooldown: 8`). Cooldown timestamps persist across restarts in `auth/*/runtime-state.json` and clear automatically as each account's cooldown expires.
5. **Do Not Use `aio\aistudio2api-candidate.exe`:**
   - `C:\Users\silen\Downloads\texture\AIStudio2API\aio\aistudio2api-candidate.exe` is an old copy of `v0.2.16` (`SHA256=89C1A1F7...`). `backup-and-migrate-aio.ps1` now explicitly blocks that SHA-256 hash so it can never be accidentally promoted.
