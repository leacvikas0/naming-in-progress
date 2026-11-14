# First-Principles Engineering & Collaborative Swarm Plan: AIStudio2API Scheduler, Anti-Stampede & RAM Architecture (2026-11-13)

## 1. Self-Critique: What Was Wrong ("Cheap Patches") in the First Draft

You were 100% right to call this out. When we audit the first draft like a Staff/Principal Systems Engineer, there were **three brittle shortcuts** that would have caused bugs later:

1. **Shortcut #1 (Rejected): Hardcoding `if modelID == "gemini-4-hydrogen"` to check `gemini-4-argon` cooldowns.**
   - *Why it breaks later:* Tomorrow when you unlock `gemini-4-carbon`, or run `gemini-3.8-flash` or `veo`, hardcoded model-name checks turn the scheduler into brittle spaghetti.
   - *First-Principles Replacement — **Opportunity-Cost (Scarcity-Aware) Account Ordering**:*
     Every account already tracks its active per-model cooldowns (`account.runtime.Cooldowns`). When scheduling a request for model $M$, any eligible account that is *already on cooldown for other models* has **lower opportunity cost** (it is partially depleted / specialized) than a fresh account that can still serve every model in the catalog.
     Ordering partially-depleted eligible accounts ahead of universal fresh accounts (within the same warm/standby tier) automatically protects scarce `Argon` (or `Carbon`) capacity from being eaten by `Hydrogen`—with **zero hardcoded model names**.

2. **Shortcut #2 (Rejected): Ad-hoc `withoutOpening` tweaks without fixing why `expandInBackground` stampedes.**
   - *Why the stampede actually happened in your logs (`02:57:12Z`):*
     In `runtime.go:3078`, `withoutOpening(groups.StandbyReady)` strips any account currently in `manager.openings` from `StandbyReady`. Then at `runtime.go:3106` and `3112`, the very next request arriving 1ms later sees `StandbyReady[0]` is now the *next* cold account, and launches a 2nd browser—and the 3rd request launches a 3rd browser—because `acquireWarmLease` does not account for **unclaimed concurrency slots on browsers that are already booting (`openingCapacity`)**!
   - *First-Principles Replacement — **Pending Supply vs. Active Demand Accounting**:*
     A booting browser (`manager.openings[accountID]`) for an account eligible for model $M$ represents `perModelConcurrency - account.activeByModel[M]` (up to `2`) slots of **pending supply** that will become warm in a few seconds.
     In `acquireWarmLease`:
     - Let `pendingSupply` = sum of available slots for model $M$ across all currently-opening accounts (`manager.openings`) that support $M$ and are not cooling down for $M$.
     - Let `waitingDemand` = number of requests currently waiting in `dispatchQueue` for model $M$ (including the current caller).
     - **Invariant:** Never start another cold browser (`expandInBackground` or synchronous cold promote) when `pendingSupply >= waitingDemand`! Instead, wait on `schedulingChanged()` / `waiter.wake` so the arriving requests coalesce onto the browser that is already booting.
     - And if that booting browser fails `WAA Bootstrap`, `finishOpening` immediately closes its channel and wakes all waiters (`notifyScheduling()`), which then cleanly promote the next standby account with zero deadlock or starvation.

3. **Shortcut #3 (Rejected): Splitting tightly-coupled scheduler files across 4 non-communicating workers.**
   - *Why it breaks:* `accounts.go` (`AccountPool`) and `runtime.go` (`accountWorkerManager` + `acquireWarmLease`) share lock invariants (`pool.mu` vs `rebalanceMu`) and candidate classification structs. Having separate workers edit them without co-designing the state machine on the message board guarantees mismatched assumptions.

---

## 2. How the Swarm Will Actually Collaborate (Peer-to-Peer Engineering Team)

Instead of a dumb waterfall where isolated workers edit files blindly, we structure the Swarm around **peer-to-peer debate, contract design, implementation, and adversarial verification** on the shared message board:

| Member | Model | Role & How They Interact on the Board |
| :--- | :--- | :--- |
| **`architect`** | **`Argon` (`High`)** | **Systems Architect & Scheduler Lead.** Inspects `config.go`, `accounts.go`, `runtime.go`, `launcher.go`, and `admin.go`. Posts the exact **State Machine & Invariant Spec** to the board and tags `@critic` and `@test-lead` before writing implementation code. Implements the critic-hardened changes in an isolated `workspace:"share"`. |
| **`critic`** | **`Argon` (`High`)** | **Adversarial Systems & Concurrency Reviewer.** Reviews `@architect`'s spec and diffs for lock-order inversions, lease counter leaks on rollback paths (`refreshAndValidateLease`, `TryAcquireFor`), canonical model ID normalization (`models/gemini-4-hydrogen (xhigh)` $\to$ `gemini-4-hydrogen`), and WAA fingerprint safety. Can reject and send back to `@architect` directly on the board. |
| **`test-lead`** | **`Hydrogen` (`Xhigh`)** | **Verification, Stress-Test & RAM Benchmark Engineer.** Collaborates with `@critic` to write `go test -race` concurrency stress tests, simulated 24-account Swarm burst tests, opportunity-cost quota survival tests, and live isolated `:12048` + Camoufox WorkingSet RAM measurements. |

---

## 3. Clean Architectural Specification (No Hacks)

### A. First-Class Two-Tier Concurrency (`PER_ACCOUNT_CONCURRENCY=3`, `PER_MODEL_CONCURRENCY=2`)
- **Config (`internal/config/config.go`):**
  - Add `PerModelConcurrency int` (`PER_MODEL_CONCURRENCY`, default `2`, validated `1 <= PerModelConcurrency <= PerAccountConcurrency`).
  - Expose in `api.RuntimeConfig` and hot-reload in `ApplyCapacity`.
- **Account State (`internal/aistudio/accounts.go`):**
  - `Account.active int` (total active leases on this account across all models; max `perAccountConcurrency = 3`).
  - `Account.activeByModel map[string]int` (active leases per canonical model scope `selectionAccessScope(selection)`; max `perModelConcurrency = 2`).
  - `AccountLease` records `modelScope string` at acquisition time so `lease.Release()` decrements both `account.active` and `account.activeByModel[lease.modelScope]` atomically under `p.mu` (impossible for model suffix stripping or aliases to mismatch on release!).

### B. Opportunity-Cost (Scarcity-Aware) Account Selection
- In `AccountPool` (`accounts.go`):
  - Helper `otherActiveCooldownCountLocked(account *Account, targetScope string, now time.Time) int`: counts how many *other* model scopes on `account` currently have an active cooldown at `now`.
  - Under `fill-first`:
    1. First prefer accounts that **already have active streams or warm affinity** (preserving prompt cache locality!).
    2. When choosing a *new* account to fill for model $M$, prefer eligible accounts with `otherActiveCooldownCountLocked > 0` (accounts that have already exhausted another model like Argon) over pristine accounts that still have all models available.

### C. Pending-Supply Anti-Stampede (`internal/app/runtime.go`)
- In `accountWorkerManager` & `acquireWarmLease`:
  - `openingAvailableSlots(selection aistudio.AccountSelection) int`: under `rebalanceMu`, inspects `manager.openings` and queries `pool` for how many unreserved model/account slots those currently-booting accounts have for `selection`.
  - In `acquireWarmLease`, if `openingSlots >= waitingDemand` for `selection`, **do not** call `expandInBackground` and **do not** promote another cold account—wait on `wait(schedulingRecheck)` until the opening browser finishes and wakes the queue via `finishOpening -> notifyScheduling()`.

### D. Fingerprint-Safe Camoufox RAM Diet (`internal/camoufoxnative/launcher.go`)
- Applied only to headless worker profiles (`options.Headless && !options.liveView`), touching **zero** DOM/JS/WebGL/Audio/Font fingerprint surfaces:
  - `"dom.ipc.processPrelaunch.enabled": false` (eliminates the `~70 MB` pre-launched spare blank tab process).
  - `"browser.sessionhistory.max_total_viewers": 0` & `"browser.sessionhistory.max_entries": 2` (disables back-forward page caching).
  - `"browser.cache.memory.capacity": 16384` (caps decoded RAM cache at `16 MB`).
- Reduce `workerIdleTimeout` from `5 * time.Minute` to `90 * time.Second` so burst browsers above `WARM_WORKER_LIMIT=2` close 90s after a Swarm finishes.

---

## 4. The 6 Hard Verification Gates (Must Pass Before Any Live Binary Swap)

1. **`go test -race` Concurrency & Leak Gate:**
   Run `go test -race ./internal/config ./internal/aistudio ./internal/api ./internal/app ./internal/camoufoxnative` to prove zero data races and zero `activeByModel` counter leaks across all error/rollback/cancellation paths.
2. **Two-Tier Concurrency Gate (`2 per model / 3 total`):**
   Prove `2 Argon + 1 Hydrogen` share Account 1 (`3/3`), while a `3rd Argon` or `2nd Hydrogen` spills to Account 2.
3. **Zero Ghost-Browser Stampede Gate:**
   Fire 6 concurrent requests against a cold pool with a 250ms worker startup latency -> prove **exactly 3 workers** start (2 requests coalesced per opening worker, 0 wasted ghost browsers).
4. **Opportunity-Cost Quota Protection Gate:**
   With 22 accounts cooled down on `gemini-4-argon` and 2 accounts fresh on both `gemini-4-argon` and `gemini-4-hydrogen`, prove `Hydrogen` schedules onto the 22 Argon-depleted accounts first, leaving the 2 universal accounts free for `Argon`.
5. **Empirical Camoufox Process & RAM Gate:**
   Launch a real headless Camoufox worker and measure via `Win32_Process`: subprocess count (`6` vs `7`, spare tab gone), WorkingSet MB reduction, and 100% passing WAA bootstrap.
6. **Isolated `:12048` End-to-End Smoke & Circuit Breaker Gate:**
   Boot `aistudio2api-candidate.exe` on `127.0.0.1:12048` and verify `/api/accounts` per-model telemetry, `/api/config`, and the `403 verify-account` Roaster Circuit Breaker.
