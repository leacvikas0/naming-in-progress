"""
Persistent Interactive H200 Console & Warm VRAM Server (`sfx-foley/harness/h200_foley_console.py`).

Why this exists (per `modal-ssh` & `mca_knight_console.py` pattern):
  - Never use a fire-and-forget `modal run` script where a single tensor shape error kills the container
    and forces a 70-second reload of 65 GB of weights from `/vol`.
  - Uses the EXACT cached `modal.Image` definition (0s image rebuild, ~3s container boot).
  - Holds a live H200 container via `modal run --detach` with all 4 models (`Qwen3-VL 32B`, `Video VAE`,
    `Audio VAE`, `MiniMax-H3 33B`) loaded ONCE and pinned in the 141 GB H200 VRAM.
  - Exposes a local RPC socket (`127.0.0.1:19876`) inside the container that hot-reloads `/tmp/foley_worker.py`
    inside a `try / except` guard—so we can inspect, debug, and iterate on prompts and tensor math interactively
    via `modal container exec` with ZERO model reloads!

Usage:
  1. Start warm container (detached):
     python -m modal run --detach sfx-foley/harness/h200_foley_console.py
  2. Check status / ship & run worker via `h200_ctl.py`:
     python sfx-foley/harness/h200_ctl.py status
     python sfx-foley/harness/h200_ctl.py run sfx-foley/harness/foley_worker.py --smoke
     python sfx-foley/harness/h200_ctl.py run sfx-foley/harness/foley_worker.py
  3. Stop container when done:
     python sfx-foley/harness/h200_ctl.py stop
"""

import json
import os
import socket
import sys
import time
import traceback
from pathlib import Path
import modal

app = modal.App("haru-machi-h3-warm-console")
vol_models = modal.Volume.from_name("minimax-h3-models", create_if_missing=True)
vol_outputs = modal.Volume.from_name("minimax-h3-outputs", create_if_missing=True)

# VERBATIM cached image definition — DO NOT modify a single line so Modal boots from cache in ~3s!
image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-devel-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install(
        "git", "wget", "curl", "libgl1", "libglib2.0-0", "libsm6", "libxext6", "ffmpeg", "ninja-build", "build-essential"
    )
    .pip_install(
        "huggingface_hub[hf_transfer]", "hf_transfer", "safetensors", "websocket-client", "ninja", "packaging", "wheel", "psutil"
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        "HF_TOKEN": "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",
        "PYTHONUNBUFFERED": "1",
        "CUDA_HOME": "/usr/local/cuda",
        "MAX_JOBS": "4",
    })
    .run_commands(
        "pip install --no-cache-dir torch==2.8.0 torchvision==0.23.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128",
        "pip install --no-cache-dir flash-attn==2.8.3 --no-build-isolation",
        "git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git /comfyui",
        "pip install --no-cache-dir -r /comfyui/requirements.txt",
        "pip install --no-cache-dir torch==2.8.0 torchvision==0.23.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128",
        "git clone --depth 1 https://github.com/Jalen-Brunson/ComfyUI-MiniMax-H3-PDD-Acc.git /comfyui/custom_nodes/ComfyUI-MiniMax-H3-PDD-Acc",
        "git clone --depth 1 https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git /comfyui/custom_nodes/ComfyUI-VideoHelperSuite",
        "cd /comfyui/custom_nodes/ComfyUI-VideoHelperSuite && pip install --no-cache-dir -r requirements.txt",
        "git clone --depth 1 https://github.com/ltdrdata/ComfyUI-Manager.git /comfyui/custom_nodes/ComfyUI-Manager",
        "git clone --depth 1 https://github.com/kijai/ComfyUI-KJNodes.git /comfyui/custom_nodes/ComfyUI-KJNodes",
    )
)

COMFY_PATH = Path("/comfyui")
VOL_ROOT = Path("/vol")


def link_models_to_comfy():
    mapping = {
        VOL_ROOT / "diffusion_models": COMFY_PATH / "models" / "diffusion_models",
        VOL_ROOT / "text_encoders": COMFY_PATH / "models" / "text_encoders",
        VOL_ROOT / "vae": COMFY_PATH / "models" / "vae",
        VOL_ROOT / "pdd_acc": COMFY_PATH / "models" / "pdd_acc",
        VOL_ROOT / "loras": COMFY_PATH / "models" / "loras",
    }
    for src_dir, dst_dir in mapping.items():
        dst_dir.mkdir(parents=True, exist_ok=True)
        if src_dir.exists():
            for f in src_dir.glob("*.safetensors"):
                dst_file = dst_dir / f.name
                if dst_file.exists() or dst_file.is_symlink():
                    dst_file.unlink()
                dst_file.symlink_to(f)


class TeeSocketWriter:
    def __init__(self, orig_stream, conn: socket.socket):
        self.orig = orig_stream
        self.conn = conn

    def write(self, data: str):
        self.orig.write(data)
        self.orig.flush()
        if data:
            try:
                self.conn.sendall(data.encode("utf-8", errors="replace"))
            except OSError:
                pass

    def flush(self):
        self.orig.flush()


@app.function(
    image=image,
    gpu="H200",
    timeout=3600,
    volumes={"/vol": vol_models, "/vol_outputs": vol_outputs},
)
def hold_warm_h200(minutes: int = 45):
    import importlib.util
    import torch

    print("====================================================================", flush=True)
    print(f"[H200 WARM CONSOLE] Booting persistent H200 session (timeout={minutes}m)...", flush=True)
    print("====================================================================", flush=True)

    link_models_to_comfy()
    sys.path.insert(0, str(COMFY_PATH))
    sys.path.insert(0, str(COMFY_PATH / "custom_nodes"))

    import nodes

    def unwrap(out):
        return out.result if hasattr(out, "result") else out

    t0 = time.perf_counter()
    with torch.inference_mode():
        clip_model = unwrap(nodes.CLIPLoader().load_clip("qwen3vl_32b_minimax_h3_int8_convrot.safetensors", "minimax", "default"))[0]
        video_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_video_vae_fp16.safetensors"))[0]
        audio_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_audio_vae_fp32.safetensors"))[0]
        unet_base = unwrap(nodes.UNETLoader().load_unet("minimax_h3_ref2va_pruned_int8_convrot.safetensors", "default"))[0]

    load_s = round(time.perf_counter() - t0, 1)
    vram_gb = round(torch.cuda.memory_allocated() / (1024 ** 3), 2)
    print(f"[H200 WARM CONSOLE] All 4 models resident in VRAM in {load_s}s ({vram_gb} GB allocated)!", flush=True)

    state = {
        "clip_model": clip_model,
        "video_vae": video_vae,
        "audio_vae": audio_vae,
        "unet_base": unet_base,
        "orig_dit_forward": unet_base.model.diffusion_model._forward,
        "video_cache": {},
        "vol_outputs": vol_outputs,
        "vol_models": vol_models,
        "load_s": load_s,
    }

    Path("/tmp/warm_ready.json").write_text(json.dumps({
        "status": "ready",
        "load_s": load_s,
        "vram_gb": vram_gb,
        "started_at": time.time(),
    }, indent=2))

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", 19876))
    srv.listen(4)
    srv.settimeout(2.0)

    deadline = time.time() + minutes * 60
    print("[H200 WARM CONSOLE] Listening on 127.0.0.1:19876 for hot-reloaded worker jobs...", flush=True)

    while time.time() < deadline:
        try:
            conn, _ = srv.accept()
        except socket.timeout:
            continue

        with conn:
            try:
                raw_req = b""
                while not raw_req.endswith(b"\n"):
                    chunk = conn.recv(4096)
                    if not chunk:
                        break
                    raw_req += chunk
                req = json.loads(raw_req.decode("utf-8").strip())
                script_path = req.get("script", "/tmp/foley_worker.py")
                args = req.get("args", {})

                old_out, old_err = sys.stdout, sys.stderr
                sys.stdout = TeeSocketWriter(old_out, conn)
                sys.stderr = TeeSocketWriter(old_err, conn)
                try:
                    # Always restore original DiT _forward before running worker
                    unet_base.model.diffusion_model._forward = state["orig_dit_forward"]
                    spec = importlib.util.spec_from_file_location("foley_worker_dyn", script_path)
                    mod = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(mod)
                    with torch.inference_mode():
                        res = mod.run_job(state, **args)
                    vol_outputs.commit()
                    print(f"\n[JOB_SUCCESS] {json.dumps(res)}\n", flush=True)
                except Exception:
                    tb = traceback.format_exc()
                    print(f"\n[JOB_ERROR]\n{tb}\n", flush=True)
                finally:
                    unet_base.model.diffusion_model._forward = state["orig_dit_forward"]
                    sys.stdout = old_out
                    sys.stderr = old_err
                    torch.cuda.empty_cache()
            except Exception as outer_e:
                print(f"[H200 WARM CONSOLE] Socket error: {outer_e}", flush=True)

    srv.close()


@app.local_entrypoint()
def main(minutes: int = 45):
    hold_warm_h200.remote(minutes=minutes)
