# AIStudio2API `403 verify-account` Circuit Breaker & Roaster Alert Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Immediately halt all proxy generation traffic and pop open a light, humorous HTML alert page listing the offending account whenever Google returns `HTTP 403: "Your account must be verified..."`—with **zero failover cascade** to other accounts and **zero interference** with `t3-aistudio-watchdog.exe`.

**Architecture:**
1. **Exact Error Classification (`internal/aistudio/quota.go`)**: Detect `HTTP 403` / gRPC `PERMISSION_DENIED (7)` containing `"must be verified"` or `"verify-account"` via `IsAccountVerificationRequired(err)`.
2. **Data-Plane Circuit Breaker (`internal/app/runtime.go`)**: Trip an atomic/mutex-guarded `verificationHalt` state on `trackedService` the instant `IsAccountVerificationRequired(err)` fires. Immediately break out of `generateWithRetry` (`retryable = false`, preventing any cascade to the remaining 23 accounts), cancel any other queued failover attempts, and block all subsequent `/v1/*` and `/v1beta/*` requests at the gate before acquiring an account lease.
3. **Watchdog Compatibility (`internal/app/admin.go`)**: Keep `GET /api/status` returning `state: "RUNNING", running: true` while halted (exposing `verification_halt: true` and `halted_account` as additive fields) so `t3-aistudio-watchdog.exe` (`dsh-proxy-watchdog-rust`) never mistakes the halt for a stopped service and never auto-restarts it.
4. **Roaster HTML Page & One-Click Resume (`internal/api/router.go`, `internal/app/verify_alert.go`)**: Write `runtime/verify-alert.html` and serve `GET /verify-alert` (publicly accessible on `127.0.0.1:2048/verify-alert` without requiring admin login headers) plus `POST /api/verify-alert/resume`. Auto-launch the user's browser once per halt episode via `rundll32 url.dll,FileProtocolHandler http://127.0.0.1:2048/verify-alert` (suppressed during automated tests via `AISTUDIO_NO_BROWSER=1`).

**Tech Stack:** Go 1.27 (`C:\Users\silen\Downloads\texture\AIStudio2API\tooling\go\bin\go.exe`), `CGO_ENABLED=0`, vanilla HTML/CSS/JS embedded in Go.

---

## Root Cause Found in Source

In [`internal/app/runtime.go`](file:///C:/Users/silen/Downloads/argon-antigravity-setup/source/proxy/internal/app/runtime.go#L3925-L3950):
```go
func retryableGenerateAccountError(ctx context.Context, err error) bool {
    ...
    var rpcError *aistudio.RPCError
    if !errors.As(err, &rpcError) {
        return false
    }
    return rpcError.StatusCode == http.StatusUnauthorized || rpcError.StatusCode == http.StatusForbidden || ...
}
```
And in [`internal/aistudio/quota.go`](file:///C:/Users/silen/Downloads/argon-antigravity-setup/source/proxy/internal/aistudio/quota.go#L92-L103):
```go
func GenerateFailureCooldownForError(err error, now time.Time) (QuotaCooldown, bool) {
    ...
    if rpcError.Method == "GenerateContent" && rpcError.StatusCode == http.StatusForbidden && rpcError.Code == 7 &&
        strings.Contains(strings.ToLower(rpcError.Message), "caller does not have permission") {
        return QuotaCooldown{Until: now.Add(generationPermissionCooldown), Kind: "模型权限拒绝"}, true
    }
    return QuotaCooldown{}, false
}
```
When Google returns `HTTP 403, code 7: "Your account must be verified before it can continue using the Gemini API. Verify your account at https://aistudio.google.com/verify-account"`:
1. `DefinitiveAuthenticationFailure(err)` returns `false` (not `401`).
2. `GenerateFailureCooldownForError(err, now)` returns `false` (message is `"Your account must be verified..."`, not `"caller does not have permission"`).
3. `retryableGenerateAccountError` returns `true` (because `StatusCode == 403`).
4. `generateWithRetry` releases the unverified account back into the pool as `READY` and loops across `maxAttempts = eligible` (all 24 accounts), burning the pool in seconds.

---

## Pre-Flight: Reconstructing the Exact Running Source Base

The currently running binary [`C:\Users\silen\Downloads\texture\AIStudio2API\aio\aistudio2api.exe`](file:///C:/Users/silen/Downloads/texture/AIStudio2API/aio/aistudio2api.exe) (`SHA256: 088EA9414F008F7D711F3F27AD50060B2CC7FE0BB892C78402B4F39EC26C10DE`) was built from [`C:\Users\silen\Downloads\argon-antigravity-setup\source\proxy`](file:///C:/Users/silen/Downloads/argon-antigravity-setup/source/proxy) plus three saved overlays and two constants documented in [`MAINTENANCE.md`](file:///C:/Users/silen/Downloads/argon-antigravity-setup/MAINTENANCE.md):
1. [`source/upload-timeout-overlay`](file:///C:/Users/silen/Downloads/argon-antigravity-setup/source/upload-timeout-overlay)
2. [`source/header-timing-overlay`](file:///C:/Users/silen/Downloads/argon-antigravity-setup/source/header-timing-overlay)
3. [`source/video-reference-overlay`](file:///C:/Users/silen/Downloads/argon-antigravity-setup/source/video-reference-overlay)
4. `continuationRoundTokens = 65536` in `internal/aistudio/generate.go` and `headers: 12 * time.Minute` in `internal/camoufoxnative/protected.go`.

### Task 1: Assemble & Verify Isolated Candidate Source Tree

- [ ] **Step 1**: Create an isolated working copy of the proxy source (so original snapshot files remain untouched until verified) and layer `upload-timeout-overlay` -> `header-timing-overlay` -> `video-reference-overlay` + the `65536` / `12 * time.Minute` constants.
- [ ] **Step 2**: Run existing package test suites (`go test ./internal/camoufoxnative ./internal/aistudio ./internal/api ./internal/app`) and compare symbols against `aio/aistudio2api.exe` via `go tool nm` to confirm 100% feature parity with the running binary before adding our changes.

---

### Task 2: Detect `403 verify-account` & Prevent Account Failover (`internal/aistudio/quota.go`)

**Files:**
- Modify: `internal/aistudio/quota.go`
- Modify: `internal/aistudio/quota_policy_test.go`

- [ ] **Step 1: Write failing unit tests in `internal/aistudio/quota_policy_test.go`**
  - Test `IsAccountVerificationRequired(err)` against:
    - Real Google error: `&RPCError{Method: "GenerateContent", StatusCode: 403, Code: 7, Message: "Your account must be verified before it can continue using the Gemini API. Verify your account at https://aistudio.google.com/verify-account"}` -> `true`
    - Wrapped `fmt.Errorf("发送 AI Studio GenerateContent: %w", rpcErr)` -> `true`
    - Standard `403` permission denial (`"The caller does not have permission"`) -> `false`
    - Standard `429` quota limit -> `false`
- [ ] **Step 2: Implement `IsAccountVerificationRequired` and `VerificationHaltError` in `internal/aistudio/quota.go`**
  - Match `RPCError` where `StatusCode == http.StatusForbidden` (or `Code == 7`) and lowercased `Message` contains `"must be verified"` or `"verify-account"`.
- [ ] **Step 3: Run `go test -v -run TestAccountVerification ./internal/aistudio` and confirm PASS.**

---

### Task 3: Data-Plane Circuit Breaker & Roaster HTML Page (`internal/app/verify_alert.go`, `internal/app/runtime.go`, `internal/api/router.go`)

**Files:**
- Create: `internal/app/verify_alert.go`
- Modify: `internal/app/runtime.go`
- Modify: `internal/app/admin.go`
- Modify: `internal/api/admin.go`
- Modify: `internal/api/router.go`
- Create: `internal/app/verify_alert_test.go`

- [ ] **Step 1: Write failing integration tests in `internal/app/verify_alert_test.go`**
  - Create a test `trackedService` with **3 ready accounts** (`acc1@gmail.com`, `acc2@gmail.com`, `acc3@gmail.com`) and a mock upstream service.
  - Configure `acc1@gmail.com` to return the `403 verify-account` `RPCError`.
  - Assert:
    1. **Zero Cascade**: `acc1@gmail.com` is called exactly **1 time**; `acc2@gmail.com` and `acc3@gmail.com` are called **0 times**.
    2. **Circuit Breaker Active**: `service.VerificationHaltStatus().Active == true`, recording `acc1@gmail.com`, model `gemini-4-argon`, and timestamp.
    3. **HTML Alert Written & Served**: `runtime/verify-alert.html` exists on disk and `GET /verify-alert` returns HTTP 200 HTML containing `acc1@gmail.com`, the roast banner (*"You fucked up — you gotta verify this account"*), the link to `https://aistudio.google.com/verify-account`, and the Resume button.
    4. **Subsequent Requests Blocked at Gate**: Sending another `Generate` request immediately returns `HTTP 503 Service Unavailable` (`verification_required`) with **0 upstream calls**.
    5. **Watchdog-Safe Status**: `GET /api/status` still returns `running: true, state: "RUNNING"` so `t3-aistudio-watchdog.exe` never restarts the service.
    6. **One-Click Resume**: `POST /api/verify-alert/resume` clears the circuit breaker and allows subsequent `Generate` requests to succeed.

- [ ] **Step 2: Implement `internal/app/verify_alert.go` & wire into `runtime.go` and `router.go`**
  - In `trackedService.dataRequestContextFor` (used by `Generate`, `CountTokens`, `Embed`, `GenerateVideo`, etc.): check `service.checkVerificationHalt()` first so all data-plane endpoints are gated when halted.
  - In `trackedService.generateWithRetry`: when `aistudio.IsAccountVerificationRequired(err)` is true:
    - Set `retryable = false`
    - Mark the offending account (`lease.MarkAuthenticationRequired(err.Error())`)
    - Call `service.tripVerificationHalt(accountLabel, modelID, err)` which:
      - Records the flagged account, writes `runtime/verify-alert.html`, cancels active data-plane requests waiting to rotate, logs a clear `ERROR` event to the admin console, and invokes `openVerificationAlertBrowser` once (unless `AISTUDIO_NO_BROWSER=1`).
  - Mount `GET /verify-alert`, `GET /api/verify-alert`, and `POST /api/verify-alert/resume` so the browser page works immediately without needing admin session cookies.

- [ ] **Step 3: Run `go test -v ./internal/aistudio ./internal/app ./internal/api ./internal/camoufoxnative` and confirm all tests PASS.**

---

### Task 4: Isolated Ephemeral-Port End-to-End Smoke Test (`127.0.0.1:12048`)

- [ ] **Step 1**: Compile `aistudio2api-candidate.exe` into an isolated temp directory.
- [ ] **Step 2**: Start an isolated test instance bound to `127.0.0.1:12048` (preview `127.0.0.1:12050`) with `AISTUDIO_NO_BROWSER=1` so the live production proxy on `127.0.0.1:2048` is 100% untouched.
- [ ] **Step 3**: Trigger the verification halt on `127.0.0.1:12048`, verify `GET http://127.0.0.1:12048/verify-alert`, verify `GET http://127.0.0.1:12048/api/status` (`running: true`), verify `POST http://127.0.0.1:12048/v1beta/models/gemini-4-argon:generateContent` is blocked at the circuit breaker, and verify `POST http://127.0.0.1:12048/api/verify-alert/resume` restores traffic.
- [ ] **Step 4**: Shut down the isolated `12048` test process and clean up temporary test artifacts.

---

### Task 5: Production Deployment (Only After User Approval & Idle Check)

- [ ] **Step 1**: Back up `C:\Users\silen\Downloads\texture\AIStudio2API\aio\aistudio2api.exe` (`SHA256: 088EA941...`) to `C:\Users\silen\Downloads\texture\AIStudio2API\aio\aistudio2api.exe.bak-20261112`.
- [ ] **Step 2**: Confirm `active_requests == 0` on `http://127.0.0.1:2048/api/status`, swap the verified binary into `aio\aistudio2api.exe`, and verify readiness on `127.0.0.1:2048`.
