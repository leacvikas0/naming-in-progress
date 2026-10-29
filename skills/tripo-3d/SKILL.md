---
name: tripo-3d
description: Use when asked to make, generate, or create a 3D model, mesh, or asset from an image or picture - "make this into 3D", "turn this image into a model", "generate a 3D asset", or any request for a textured FBX from an image. Also use when a Tripo job needs checking, waiting on, or debugging.
---

# Tripo3D - image to textured 3D model

Give it an image, get back a textured PBR model file. Runs in the background.

**What this is for:** Tripo3D gives great geometry, fine textures and great PBR.
It handles a building, a car, a sword, or a character in one shot. Keep
characters mid-to-low complexity - avoid overly intricate designs. For whole
scenes (a castle, a ruin), plan like a 3D architect: break it into manageable
parts, one clean pass each, mind the sizes so they assemble right. No automatic
assembly tool - combine parts in your own 3D tool. Multiple parts submit fine in
one call; accounts provision automatically.

## Two modes - pick one deliberately

Tripo has **two products**, and they are not variations of one flow. The default
is `hd`; `--mode lowpoly` is the other one.

| | `--mode hd` **(default)** | `--mode lowpoly` |
|---|---|---|
| Product | HD Model | Smart Mesh |
| What you get | geometry + texture + **PBR** in ONE job | clean low-poly mesh, then Smart UV + texture + PBR |
| Cost | 55 credits (4K), 65 (8K) | 1 trial per geometry, then 20 + 5 credits |
| Speed | fast - one generation, no extra stages | slower - four stages after the mesh |
| Best for | **the best possible result**: anything where quality is the point | grass, carts, flowers, props, **characters**, **weapons** - clean low-poly meshes |
| Topology | Triangle, 2,000,000 polys | Quad, 25,000 polys |

**`hd` is the default because it is the best mesh and the best textures, in one
click.** It sets Texture and PBR on for you and spends the account's free 8K
texture on its first run.

**Use `lowpoly` when you want a clean low-poly mesh** - a prop, a cart, grass, a
character, a weapon. Smart Mesh is genuinely good at this, and it is cheaper: the
geometry costs a free trial rather than credits.

```powershell
node $T make assets/jian-sword.png --json                     # HD Model (default)
node $T make assets/grass.png --mode lowpoly --json           # Smart Mesh
```

## Input image (do this first)

**The image is the biggest quality lever, and no background is the single most
important part of it.** Tripo reconstructs whatever it sees: a background
becomes stray geometry, and it distracts the model from the subject. An image of
just the object on transparency produces a cleaner mesh and a better texture
than the same object shot against a room, a wall, or a busy scene.

If the image you were given has any background at all, **remove it before
submitting**. You can do this yourself with the image tools:

- **Existing image file:** `gpt-image-2_5_edit_image` with the file as
  `reference_images` and the prompt `background transparent, no background`.
- **No image yet (generate from a description):** `gpt-image-2_5_generate_image`
  with the object described, plus `background transparent, no background`.

Feed the resulting PNG to Tripo. This step is cheap, it is verified to work, and
it improves every part of the output.

Otherwise: one object per image, well lit, filling most of the frame. Multi-object
images work but come back as separate parts - often what you want when assembling
something complex.

## Setup

The tool lives at a fixed path (note the misspelling in "brwoser"):

```powershell
$T = "C:\Users\silen\Downloads\tripo brwoser use\tools\tripo.js"
Test-Path $T    # must print True before anything else
```

If that prints `False`, the tool has moved - stop and ask, do not guess a path.

`$T` is defined here only. If you run commands in a fresh shell, define it again
first. Everything below is relative to `$ROOT`, the tool's directory:

```powershell
$ROOT = "C:\Users\silen\Downloads\tripo brwoser use"
```

Job artifacts are at `$ROOT\jobs\<jobId>\`, worker logs at
`$ROOT\state\worker-N.log`, and the finished models are also copied to
`$ROOT\downloads\`.

**The shell here is Windows PowerShell.** Every example below is PowerShell, not
bash. Environment variables are `$env:NAME = "value"`, not `NAME=value`.

## Usage

```powershell
# One-shot: submit and block until done. The simplest correct thing.
node $T make <image> --json

# Fire and forget, then be told when it finishes
node $T submit <image> --json
node $T wait <jobId> --json

# Name the job so it is easy to find later (a random suffix keeps it unique)
node $T make <image> --name lantern --json   # -> j_lantern-a3f2
```

### Commands

| Command | What it does |
|---|---|
| `make <image...>` | Submit and block until done. Returns the model path. |
| `submit <image...>` | Queue jobs, start workers, return immediately with job ids. |
| `wait <jobId>` | Block until that job finishes. Exits with a reason, never a bare hang. |
| `watch` | Print each completion as it happens. `--exec CMD` runs CMD per completion. |
| `status [jobId]` | Job status. No id = all jobs. |
| `workers` | Worker slots and whether they are alive. |

### Flags

| Flag | Default | Meaning |
|---|---|---|
| `--mode hd\|lowpoly` | `hd` | Which Tripo product. `hd` = HD Model, geometry + texture + PBR in one job (best quality). `lowpoly` = Smart Mesh, clean low-poly mesh + UV + texture + PBR. |
| `--engine tripo\|hi3d` | `tripo` | Which site generates. Tripo is the default and the quality option. `hi3d` is the bulk engine - see below. |
| `--workers N` | 1 | Parallel workers (1-3). Applies to `submit` and `make`. |
| `--name TEXT` | - | Name the job: `--name lantern` gives `j_lantern-a3f2`. A random suffix is appended, so names stay unique and re-runs never overwrite earlier results. Use it for anything you will need to find again. |
| `--timeout SEC` | 900 | How long `wait`/`make` block. |
| `--json` | off | Machine-readable output. **Always use this.** |
| `--note TEXT` | - | Label the job; shows in `status` output. |
| `--exec CMD` | - | `watch` only: run CMD for each completion. |
| `--all` | off | `watch` only: replay past completions first, then follow live ones. |

## Hi3D is the bulk engine - only when asked

`--engine hi3d` runs on a different site (Hi3D) that can generate **many models
concurrently** against a pool of accounts. That is the one thing it does better
than Tripo, and it is the only reason to reach for it.

**Its texture quality is not as good as Tripo's.** So:

- **Do not use it by default.** Tripo is the default because it is better.
- **Do not use it as a fallback** when a Tripo job fails or an account is
  unavailable. Retry Tripo instead.
- **Use it only when the user asks for many generations at once** - "make 20 of
  these", "batch this whole folder".

```powershell
node $T submit a.png b.png c.png --engine hi3d --workers 3 --json
```

Everything else in this skill - `wait`, `watch`, `TRIPO_ON_DONE`, `status` - is
identical for both engines. The engine travels with the job, so one queue can
hold both kinds at once.

## Being told when it is done (the important part)

There are three ways, and picking the right one matters.

### 1. `wait` - block until it finishes (simplest)

`wait` is event-driven, not a poll loop. It wakes on the completion event and
returns as soon as the job can no longer finish:

```powershell
node $T submit a.png --json          # returns immediately
node $T wait j_20260923-113137_68b5 --json   # blocks, then prints the result
```

**Exit code: 0 when the job is `done`, 1 for anything else.** In PowerShell the
code lands in `$LASTEXITCODE` immediately after the call:

```powershell
node $T wait j_20260923-113137_68b5 --json
if ($LASTEXITCODE -eq 0) { "model ready" } else { "see status above" }
```

Read the JSON `status` to know WHICH non-zero case it was:

| `status` | Meaning | What to do |
|---|---|---|
| `done` | The model is ready; `model` is the path. | Done. |
| `failed` | Something broke; `error` names the stage and cause. | Read `error`; retry only if it is `orphan`. |
| `no-worker` | Nothing alive can finish this job. | `submit` it again. |
| `timeout` | Still genuinely running at the deadline. | Re-run `wait` with a larger `--timeout`. It is not an error. |

`make` uses the same rule: 0 only if every image succeeded.

**If a worker is killed mid-run** (machine sleep, taskkill, out of memory), the
system notices, fails the job with `stage: orphan`, releases the account, and
announces it - so `wait` returns instead of hanging. An `orphan` failure is safe
to resubmit; it is not a model problem.

`wait` takes **one** job id. To wait on several, `wait` on each in turn - a
finished job returns instantly, so the total is no longer than the slowest.

### 2. `watch --exec` - run a command per completion

For an operator watching a queue, or an agent that wants a command run the
moment anything finishes:

```powershell
node $T watch --exec "node C:\path\to\my-hook.js"
```

It prints each completion and runs the command with the event available as
`$env:TRIPO_EVENT_MODEL`, `$env:TRIPO_EVENT_JOBID`, `$env:TRIPO_EVENT_STATUS`,
etc., and as JSON on the command's stdin. It exits when there is nothing left to
watch, and warns first if no worker is running. Add `--all` to replay past
completions.

### 3. `TRIPO_ON_DONE` - the durable hook

This is the one that works when **nothing is watching**: the hook runs inside
the worker process itself, so it fires even if the CLI that submitted the job
has exited.

```powershell
$env:TRIPO_ON_DONE = "node C:\path\to\my-hook.js"
node $T submit a.png --json
```

The hook receives:

| Source | Contents |
|---|---|
| `$env:TRIPO_EVENT_MODEL` | Absolute path to the finished model (`job.done` only) |
| `$env:TRIPO_EVENT_JOBID` | The job id |
| `$env:TRIPO_EVENT_STATUS` | `done` or `failed` |
| `$env:TRIPO_EVENT_ERROR` | The failure reason (`job.failed` only) |
| stdin | The whole event as one JSON object |

Contract: the hook is **fire-and-forget** - the worker does not wait for it, and
a failing hook never fails a job. It has a 120 s timeout. It runs with the
worker's environment, so any path it needs must be absolute. It fires for
`job.done` and `job.failed`, including a job recovered after its worker died.

`TRIPO_ON_DONE` must be set **before** `submit` - workers are launched with a
snapshot of the environment, so setting it afterwards does not reach a running
worker.

**The hook must do the notifying itself.** The worker only runs the command; it
does not know how to reach you. A session that already ended receives nothing,
so the hook has to leave a durable trace. A minimal, working hook:

```javascript
// C:\path\to\my-hook.js
const fs = require('fs');
let event = '';
process.stdin.on('data', (d) => { event += d; });
process.stdin.on('end', () => {
  fs.appendFileSync('C:\\path\\to\\results.log', event.trim() + '\n');
  // ...or: send it somewhere, copy the model, start the next stage
});
```

```powershell
$env:TRIPO_ON_DONE = "node C:\path\to\my-hook.js"
node $T submit a.png --json
```

Set `TRIPO_ON_DONE` only for the run you want it on. It applies to every job the
workers it starts go on to process, and it is inherited by workers that are
already running only if they were launched with it.

## Output

`make` and `wait` print JSON. `make` with several images prints `{"jobs": [...]}`;
with one image it prints that job's object:

```json
{
  "jobId": "j_20260923-113137_68b5",
  "status": "done",
  "model": "...\\jobs\\j_20260923-113137_68b5\\pbr_tripo_texture_<id>.fbx",
  "textured": true,
  "faces": 25000,
  "account": "yoneo2@bodmenn.com",
  "seconds": 185
}
```

**The `model` path is the deliverable.** In `hd` mode it is a **PBR** FBX:
base colour, metallic, roughness and normal maps embedded, from a single HD
generation. `textured: true` is verified from the file's embedded image data, not
from a UI label.

Each job directory also keeps what it produced: `geometry_*.fbx` (untextured,
when the job made one), `tripo_texture_*.fbx` (the textured/PBR result),
`uv-layout.png` (`lowpoly` only), screenshots, and `run-report.json`. In `hd`
mode the report also carries the panel settings that were verified before the
click, and the exact price paid.

## Timing

Budget **3-10 minutes per model**:

- **`hd`** is one generation: geometry + texture + PBR together, ~2-6 minutes.
  There is no unwrap and no separate texture or PBR stage, so it is the shorter
  path as well as the better one.
- **`lowpoly`** is four stages: geometry ~60s, Smart UV ~60-300s, texture + PBR
  ~30-190s, plus ~30s local.

**Parallelism:** pass `--workers 2` or `--workers 3` for multiple images. Each
worker owns its own account, browser, port and mail inbox, so jobs are fully
isolated and account creation runs concurrently.

```powershell
node $T submit a.png b.png c.png --workers 3 --json
```

Workers are capped at 3 because each Chrome instance costs ~500 MB. Jobs are
first-in-first-out; a worker exits when the queue is empty.

If the account pool is empty, each worker provisions its own account in parallel
(temp mail, signup, login). Expect ~30s of setup before generation starts.

## Accounts

Accounts are provisioned and retired automatically (temp mail, OTP, no
password) - never manage them, never ask how many are available. For practical
purposes they are unlimited. The only limit you ever hit is concurrency: at most
3 workers at once (`--workers 3`), because each Chrome costs ~500 MB.

An account is **two resources**: two free Smart Mesh trials *and* a credit
balance. `lowpoly` spends a trial; `hd` spends credits (55 at 4K, 65 at 8K). An
account whose trials are spent is still usable for `hd`, so the pool keeps it -
which is why `--mode hd` rarely needs a fresh signup. The first `hd` generation
on a fresh account spends that account's one free **8K** texture, then falls back
to 4K.

## When something fails

1. `node $T status <jobId> --json` - the `error` field names the stage.
2. `jobs/<jobId>/` (under the tool directory) holds what that job produced,
   including `run-report.json` (timings and signals) and `failure/` (a
   screenshot and store dump if it died).
3. `state/worker-N.log` (same directory) has the live worker output.

Failures are named rather than generic: `NEVER_STARTED` (nothing was ever
charged), `STALLED_AFTER_SPEND` (a trial was used but no model arrived),
`DONE_FAILED` (the server rejected it). These mean different things - do not
treat them as one error. `stage: orphan` means the worker died; resubmit.

## Rules

- **Ask the user for guidance** on anything new; record what you learn in this
  skill file.
- **Default to `hd`.** It is the best mesh and the best textures, in one click.
  Reach for `--mode lowpoly` when a clean low-poly mesh is what is wanted.
- **Do not** pass `--poly` or discuss the face count. Each mode pins its own:
  `hd` uses 2,000,000 (the panel maximum), `lowpoly` uses 25,000. Mention it only
  if the user asks.
- **Do not** use `--engine hi3d` unless the user asks for many generations at
  once. Tripo is the quality option and the default.
- **Do not** open Chrome yourself or drive the browser. The CLI owns it.
- **Do not** call `browser.js` or `run.js` directly for normal work.
- **Do not** run two jobs through one account by hand; the ledger prevents it.
- **Do not** poll `status` in a loop - use `wait`, which is event-driven.
- **Never** set `TRIPO_TEST_MODE=1` for real work; it exists so tests cannot
  open browsers or create accounts.
- **Do not** submit an image with a background. Remove it first (see *Input
  image* above) - Tripo models the background too.
