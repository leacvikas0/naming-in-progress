# 3DCodeVerse harness — what it actually does differently, and what we can steal

Research note, 2026-10-17. Sources: [3dcodeverse.com](https://3dcodeverse.com/#harness),
[github.com/gaoypeng/3dcodeverse](https://github.com/gaoypeng/3dcodeverse)
(`harness/docs/ARCHITECTURE.md`, `DECISIONS.md`, `COST.md`, `INSTALL.md`).
Nothing installed; this is a read of the design docs, not a trial run.

---

## 1. TL;DR

The harness is not a better model. It is a **scaffolding that refuses to trust the model's
own opinion of its output**. Its headline result — the same backbone winning 69–89 % of blind
comparisons inside this harness vs. its vendor's own harness — is a statement about *loop
design*, not about generation quality.

Three ideas do most of the work, and all three are portable to a curated asset library:

1. **The plan carries measured acceptance criteria**, written before any code exists.
2. **Deterministic measurement gates run before any VLM looks at anything** — and the judge's
   score is *capped and vetoed* by those measurements.
3. **The loop is fixed-length and picks the best round afterwards**, so a regression can never
   be the thing that ships.

---

## 2. The loop, mechanically

```
spec → plan → skeleton → [scene stages] → baseline round (best-of-N) → N refine rounds → finalise → pick
```

One round, a fixed chain in code (not agent discretion):

```
generate → build_with_repair → measure → gates → render → post-render gates → judge
   → git commit src/ → copy build to artifacts/rNN/
```

Artifacts land in `runs/<slug>/`: `src/` (git, one commit per round), `artifacts/` (every
round's build kept), `deliverable/` (written by `3dcode pick`). The record is the flywheel unit.

**Refine tasks are derived, not invented.** Each round's task list is
`previous round's gate ERRORs ∪ failed must-acceptance ∪ judge improvement plan`,
capped at ≤ 6 tasks and ≤ 6 lines each. A placeholder part always goes first.

**Stop reasons are enumerated**, not vibes: `max_rounds | budget | agent_quota | no_change |
no_refine_tasks | judge_unavailable | failed`. They *deleted* the pass/plateau/diminishing-returns
stops because 37 % of 466 recorded runs quit early on one of them.

---

## 3. The eight things that make it different

### 3.1 Code is truth; artifacts are derived
`src/` is the deliverable. GLBs and renders are regenerated from it, and the agent is forbidden
from "fixing" the export. No wrapper re-centres, rescales or grounds the object — if it's
off-centre, `check_contract` errors and the *source* gets fixed.

> Normal agent: nudges the mesh until it looks right. Harness: the mesh is downstream.

### 3.2 A typed plan with acceptance criteria, before generation
The planner emits components, dimensions, materials, spatial relations **and an acceptance
checklist with numeric thresholds** (bbox, dims, connectivity, joints, part naming, triangle
budgets). Those criteria become the gates. The plan is forbidden from mandating shape, count,
layout or code structure the brief didn't ask for — it constrains *contract*, not *creativity*.

### 3.3 Deterministic gates before any model is paid to look
`connectivity` (contact ledger, floating parts, deepest overlap in mm, lowest point above floor),
`contract` (bbox/dims/naming/orientation — "lying" and "stood" are ERROR, "turned" is WARN),
`joint_sweep` (every pose, python-fcl; > 5 mm rest-pose penetration fails the build),
`motion_direction` (URDF axis vs the plan's motion text), `scene_placement`.

Ordering law: **lint → build → gates → montaged views → VLM.** The VLM is the last and
cheapest-per-bit step, never the first.

### 3.4 The judge's score is computed in code, and measurements veto it
`overall = caps(weighted_mean − Σ penalties)`. Caps are YAML rules with `when:` conditions tied
to gate output, and each cap **names the checklist defect it is the measurement of**. If the
connectivity gate says a part floats 3.2 mm, the judge cannot award a pass for it — the cap
fires regardless of what the VLM wrote.

The judge is fed a **MEASURED STRUCTURE block** (parts / contacts / floating / deepest overlap,
planned joins as `contact` or `OPEN` with the gap, lowest point above floor), not prose. They
replaced 1 254 per-pair "interpenetrate by ≈d mm" WARN sentences on 241 stored rounds with one
measured line, because the judge was reading the prose and repeating it.

Measured effect of that one change (D46): a paired replay moved 230 verdicts, **none down**,
pass rate 15.0 % → 21.0 %.

### 3.5 Generator and judge are separated, with different prompts
The judge sees spec + renders + measurements. It never sees the agent's reasoning, and the
generator never sees the rubric. Wire schema is fixed (`one property per criterion`) because
flash-class models silently skip free-form criteria; the shape is *observe-then-score*
(summary, strengths, issues, **defect checklist**, acceptance, then criteria).

### 3.6 Precision beats recall in measurement
> "A wrong deterministic finding is worse than none, because the judge repeats it."

Every number names the surface it was measured against. Findings they can't measure reliably
were *deleted* rather than approximated — a floating env prop stopped being measured at all
rather than being measured wrong.

### 3.7 Best round wins, not last round
`3dcode pick` ranks rounds by score, ties by fewer gate errors, then earlier round. So the
deliverable is monotone-safe by construction. The workspace still ends at the last round; only
the handover is chosen retroactively.

### 3.8 Every run is training data
Per round: a git commit, a `Usage` per call, a `record.json`. `flywheel refine` emits one row
per (round i → i+1) transition carrying *what condemned the round*, the instruction written in
response, both code snapshots, and whether the score moved. That's the supervision a one-shot
corpus can't produce.

---

## 4. The evidence, and its limits

Human blind preference, native harness → 3DCodeVerse harness (same backbone, 100 object prompts):

| backbone | native | harness |
|---|---|---|
| Gemini 3.8 Flash (vs Gemini CLI) | 13 % | **87 %** |
| Claude Opus 5.5 (vs Claude Code) | 21 % | **79 %** |
| GPT-6 Astra (vs Codex) | 31 % | **69 %** |
| GPT-6 Luna (vs Codex) | 11 % | **89 %** |
| Claude Opus 5.5 (vs Claude Design) | 10 % | **90 %** |

Execution rate after SFT+DPO on the 2M corpus: 51.9 % → 92.9 % on 3DCodeBench.

Cost, measured over 61 runs (`docs/COST.md`): **$86.30 total, $1.41/run, median $0.95,
$2.40 per passing artifact**, 26.4 h of run time, 7 544 model calls. 80 % of input tokens are
cache reads. **88 % of wall clock is waiting on a model**; 12 % is harness (build + gates +
render + git). Money is generation, not judging.

Honest limits: there is no CI, one Python version (3.13), one Blender (5.2 LTS), Linux/WSL2
only, and the corpus is the authors' own. The win rates are their measurements on their prompts.

---

## 5. What transfers to kilo-3d-kit

We are the opposite kind of system: a **curated CC0 library**, not a generator. So the
generation half doesn't apply. The *verification* half applies almost completely — and it
exposes real gaps in what we currently ship.

### Gaps this research exposes in our repo

| gap | evidence |
|---|---|
| `catalog/index.json` sets `rigged: kind === "character"` | `scripts/index-library.mjs:82` — it's a **path heuristic**, not a measurement |
| Triangle budget is a rule with no enforcement | `AGENTS.md` says prop < 2k / character < 20k; no script counts triangles |
| Rig inspection is a sample | `scripts/inspect-rig.mjs:64-66` — all characters + **8 props**, so most props are never measured |
| No acceptance record per asset | `reports/rig-inspect.json` records facts but no pass/fail verdict against a threshold |

That's precisely the failure mode the harness's laws exist to prevent: a plausible-looking
catalog field that nobody measured.

### The four ideas worth taking

| idea | our version | effort | value |
|---|---|---|---|
| **3.3 Deterministic gates first** | `scripts/validate-library.mjs`: triangles from GLB accessors, bbox, material/texture presence, skin+clip presence, naming — every asset, no LLM, no network | low | **high** — makes the budget rule real and kills the `rigged` guess |
| **3.2 Acceptance criteria with numbers** | `reports/validate.json` with per-asset pass/fail + the measured number, gate-able in `npm run setup` | low | high |
| **3.4 Judge capped by measurement** | only if we ever want "does this read as Kenney?" judged — VLM on a 2×2 montage, capped by polycount/palette/texture size so it can't praise a 40 k-tri asset | medium | medium |
| **3.7 Best-of-N + pick** | if we gap-fill via generation: make 2–3 candidates, score, keep the best; never keep the last | medium | medium (only if generating) |

### What does not transfer

- The sub-agent DAG and vendor CLI plumbing (`agy` / `claude-code` / `codex`), the MCP spatial
  toolbox, key pools — that's generation infrastructure, and we don't generate.
- Per-round VLM judging at $0.95/run: a library needs the verdict once per asset, not per round.
- The 2.03 M corpus and the fine-tuning stack.
- The whole thing as a *dependency*: it's a research checkout, Linux-only, single-version-pinned.
  Keep it as a sibling reference, never inside this repo.

---

## 6. Proposed next step (one script, no dependencies)

`scripts/validate-library.mjs` — pure Node, reads GLB JSON chunk the same way `inspect-rig.mjs`
already does, and per asset records:

```
tris = Σ primitives[i].indices.count / 3   (or POSITION.count/3 if non-indexed)
bbox from accessor min/max of POSITION
hasMaterials / hasTextures / hasSkins / hasClips
verdict = PASS | WARN | FAIL  against prop<2k, character<20k
```

Then `index-library.mjs` copies the *measured* `rigged` and `tris` into the catalog instead of
guessing, and `npm run setup` fails loudly if a pack lands over budget.

That is the harness's cheapest and most load-bearing idea — *measure before you believe* —
applied to the one place we currently believe something we never measured.
