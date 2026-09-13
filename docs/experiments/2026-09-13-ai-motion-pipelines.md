# KayKit animation: AI motion pipelines — evaluation

Date: 2026-09-13
Status: research, not implemented. Nothing in this doc is wired into the game.
Scope: can AI motion models add or restyle animation for this pack, and if so, which route.

## TL;DR

The idea works, but not as a round trip through 2D pose. Two separate jobs:

- **Job A — video only** (trailer, splash, promo). 3D clip → SCAIL-2. Never go back to the engine.
- **Job B — new engine clips**. Video or text → 3D rotations → retarget in Blender → GLB. Never drop to 2D keypoints.

The 2023–24 sandwich (3D clip → 2D OpenPose → ControlNet → 2D frames → mocap → 3D) is
the wrong default. Depth dies in the 2D skeleton, and no 2D condition can invent usable
joint rotations. This was the original proposal; it is rejected below on evidence.

## Verified pack facts (measured locally, not assumed)

From `library/kaykit-adventurers/KayKit-Character-Pack-Adventures-1.0-main`, read out of
the GLB skin and `reports/rig-inspect.json`:

| Fact | Value |
|---|---|
| Skin joints | **41** |
| Animation clips | **76** (not 79 — earlier figure in this repo was wrong) |
| Clips shared across all 4 heroes | **76 of 76** — identical name sets |
| Pack version | **1.0** (`KayKit-Character-Pack-Adventures-1.0-main`) |

The 41 skin joints split into two groups:

**Deform bones (24)** — the actual skeleton:
```
root  hips  spine  chest  head
upperarm.l  lowerarm.l  wrist.l  hand.l  handslot.l
upperarm.r  lowerarm.r  wrist.r  hand.r  handslot.r
upperleg.l  lowerleg.l  foot.l  toes.l
upperleg.r  lowerleg.r  foot.r  toes.r
```

**IK / control bones (17)** — solver helpers, not skinning bones:
```
kneeIK.l/.r  heelIK.l/.r  elbowIK.l/.r  handIK.l/.r
IK-foot.l/.r  IK-toe.l/.r
control-toe-roll.l/.r  control-heel-roll.l/.r  control-foot-roll.l/.r
```

`handslot.l/.r` are **weapon sockets**. No HMR or pose model knows they exist; weapons are
parented in the DCC after the body solve. Any learned animator should have the 17 IK/control
bones **stripped** first (UniMate's own pipeline deletes zero-skin IK bones) and re-added
in Blender afterwards.

### Corrections to the source research

Three claims in the source research do not match this repo:

1. **"79 clips / 41 joints, likely an older snapshot"** — the local pack is 1.0 and has **76
   clips**, not 79. There is no 2.0 checkout in `library/`. 79 was never correct here.
2. **"kneeIK.\* is a solver helper"** — correct, but there are **nine** such helper bones per
   side, not one. Stripping only `kneeIK` would leave 16 control bones driving the rig.
3. **"Separate KayKit Character Animations pack is now 161 clips, Rig_Medium + Rig_Large"** —
   verified true (itch.io, released 27 Oct 2025, free). But it is **not in this repo**, and
   `scripts/packs.json` does not fetch it. Adopting it means a new pack entry, a re-index, and
   re-verifying every `keep[]` filter and clip name the game currently hardcodes.

Adventurers 2.0 exists (27 Oct 2025, free on itch): visually upgraded meshes, new Ranger
character, updated rigs for the new animation system. Still CC0. Upgrading is a real option
and is **independent of any AI work** — it is the cheapest quality win available.

## Why the 2D round trip fails

A 2D pose gives screen-space joints. A 3D rig needs local joint rotations. The mapping is
ambiguous in the way that matters: a limb pointing at the camera and one pointing away
produce nearly identical 2D skeletons. OpenPose cannot distinguish them, so a sword arc or a
wave collapses into noise. Flattening a perfect 3D animation to 2D and reconstructing 3D from
an ambiguous 2D signal is two lossy round trips to recover something already owned.

Independent evidence, not just reasoning:

- *Scientific Reports* (2025-11-05), 11 open monocular 2D/3D estimators on exercise video:
  "Currently, 3D pose estimators and transformer-based approaches do not deliver accurate
  depth estimations." <https://www.nature.com/articles/s41598-025-22626-7>
- SCAIL (CVPR 2026 Findings) names the same bottleneck and replaces 2D stick figures with
  3D-consistent cylinder skeletons precisely because 2D loses occlusion and depth.
- SCAIL-2 then drops the pose intermediate entirely, training end-to-end on raw video.

## Job A — video only

Render the clip (or a Blender cylinder overlay of the real armature) → SCAIL-2 → 2D frames.
**Stop there.** Do not mocap the result back into the engine.

| Model | Status (verified) | Notes |
|---|---|---|
| SCAIL | CVPR 2026 Findings. Weights 2025-12-11 (HF `zai-org/SCAIL-Preview`). Native in ComfyUI 2026-03-01. | 14B DiT on Wan 2.1. 3D-consistent cylinder pose (NLFPose). Blender rig driving confirmed in issue #30 (toyxyz). |
| SCAIL-2 | arXiv 2606.10804. Model + inference 2026-06-09. ComfyUI 2026-06-09, multi-ref 2026-06-17. Training code 2026-08-06. | End-to-end, bypasses pose estimation. Also accepts SAM 3D Body mesh renders zero-shot. |

Repo: <https://github.com/zai-org/SCAIL> · <https://github.com/zai-org/SCAIL-2> ·
weights <https://huggingface.co/zai-org/SCAIL-2>

Because the driving signal is already 3D, the camera can be anything — the front/back
ambiguity never enters. This is the piece of the original idea that genuinely works.

**Skip:** per-frame DWPose + SD ControlNet. Wan/VACE still ship it; community writeups
report OpenPose is ignored unless VACE strength is cranked, at which point identity drifts.

## Job B — back into the engine

| Route | Tool | Status (verified) | Fit here |
|---|---|---|---|
| Video → this rig's rotations | **MoCapAnything V2** | arXiv 2604.28130 (v3 2026-06-23). Weights MIT on HF. Custom-rig walkthrough in repo. | Closest match: takes a reference skeleton + one pose-rotation pair, outputs BVH-ready rotations. 41 joints is inside its 150-joint pad. |
| Phone video → FBX/BVH | **BlendCap 1.0.5** | Aug 2026, $60 one-time, GPL, Blender addon. v1.0.5 added grounding for rolls/lying. | Works in the same Blender file used for retargeting. NVIDIA strongly recommended. |
| Phone video → FBX/BVH | **Rokoko Vision 3.0** | 2026-07-16, cloud. Basic $10/10 min. | No finger tracking. Cloud round trip. |
| Text → motion | **HY-Motion 1.0** | Tencent. Weights + inference 2025-12-30. 1.0B / 0.46B lite. | Runs today. SMPL-H output, so a retarget step is required. 26GB VRAM. |
| Text → this rig | **UniMate** | SIGGRAPH Asia 2026. arXiv 2609.05415 (2026-09-04). Code 2026-09-06. | Architecturally the right model — topology-aware, no per-skeleton finetune. **Pretrained checkpoints not released** (README TODO). Watch, don't wait. |

### The MoCapAnything V2 reference pair

The one non-obvious requirement: it needs a **reference pose–rotation pair** from the target
asset to fix the rotation coordinate system. For this pack, use the bind pose plus any one of
the 76 clips (e.g. `Idle`). Without it the pose→rotation mapping is ill-posed — bone-axis
twist is unobservable, which is exactly why analytical IK cannot recover it.

Reported accuracy: rotation error ~17° → ~10°, 6.54° on unseen skeletons, ~20× faster than
mesh+IK. **~10° is blocking-quality, not ship-without-look.** A 2024 artist bake-off of
Plask/Cascadeur/DeepMotion/Rokoko/RADiCAL vs optical was already ~16–21° mean angular error
on simple motions. Expect Cascadeur/Blender cleanup on anything combat-facing.

## What it costs

1. **Blender enters the toolchain.** This project currently has zero Blender dependency —
   everything is procedural or straight GLB. Job B requires it for retargeting.
2. **Style drift.** The 76 KayKit clips have a specific snap. An AI-mocapped clip sitting
   next to them will read as foreign unless the timing is hand-matched. `AGENTS.md` mandates
   one style family; this would introduce a second one.
3. **IK bone handling.** 17 control bones must be stripped for the learned solve and restored
   after. `handslot.*` must be re-parented manually — no model produces weapon sockets.

## Recommendation

**Worth it for Job A. Not worth it for Job B — yet.**

Job A is a clean win: render → SCAIL-2 → video, no return path, no Blender, no style risk.
That is the "cinematic" goal and the 2026 models do it well.

Job B should wait. The emote problem is already solved locally: 76 clips exist and the game
uses roughly a dozen. Unused and immediately available: `Cheer`, `Interact`, `PickUp`,
`Use_Item`, `Throw`, `Block`, the sitting/lying sets, and four unarmed attack variants.
Variety is a wiring change, not a research project.

**Order of operations if more animation is genuinely wanted:**

1. Upgrade to Adventurers 2.0 + the 161-clip Character Animations pack. Free, CC0, official,
   same rig family, zero style risk. This is strictly better than any AI route.
2. If a *specific* new motion is still missing after that, Job B via MoCapAnything V2 with
   `Idle` as the reference pair.
3. UniMate when checkpoints ship — it is the only model designed for arbitrary rigs like this
   one without a retarget step.

## Verification status of this document

| Claim | Status |
|---|---|
| 41 joints, 76 clips, identical across heroes | **Measured locally** from the GLB + rig report |
| 17 IK/control bones, handslot weapon sockets | **Measured locally** |
| SCAIL / SCAIL-2 release dates, ComfyUI, licenses | Verified against GitHub + HF |
| MoCapAnything V2 paper, weights, custom-rig support | Verified against arXiv + GitHub + HF |
| UniMate code released, checkpoints missing | Verified against GitHub README |
| HY-Motion 1.0 weights + VRAM figures | Verified against GitHub README |
| KayKit Character Animations = 161 clips, free | Verified against itch.io |
| Adventurers 2.0 exists, free, CC0 | Verified against itch.io + Patreon |
| ~10° rotation error is blocking-quality | **Not verified** — no test run on this pack |
| SCAIL-2 identity lock on low-poly atlas textures | **Not verified** — untested on KayKit |
| Whether `handslot.*` survives any learned pipeline | **Not verified** — likely requires manual parenting |

Nothing in this document has been run against this pack. The local facts are measured; the
model claims are from the sources cited, not from first-hand testing here.
