"""
Warm VRAM Daemon running inside the persistent Modal H200 Sandbox (`sfx-foley/harness/warm_daemon.py`).

Loads all 4 models (`Qwen3-VL 32B`, `Video VAE`, `Audio VAE`, `MiniMax-H3 33B`) ONCE into the 141 GB H200 VRAM
and listens on `127.0.0.1:19876` so every command from `h200_ctl.py` (`bake`, `smoke`, `gen`) runs against
warm VRAM in <8 seconds without ever reloading weights or backgrounding!
"""

import importlib.util
import json
import socket
import sys
import time
import traceback
from pathlib import Path
import torch

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


def main():
    print("[WARM DAEMON] Linking models and importing ComfyUI...", flush=True)
    link_models_to_comfy()
    sys.path.insert(0, str(COMFY_PATH))
    sys.path.insert(0, str(COMFY_PATH / "custom_nodes"))

    import nodes

    def unwrap(out):
        return out.result if hasattr(out, "result") else out

    t0 = time.perf_counter()
    with torch.inference_mode():
        print("[WARM DAEMON] (1/4) Loading Qwen3-VL 32B INT8...", flush=True)
        clip_model = unwrap(nodes.CLIPLoader().load_clip("qwen3vl_32b_minimax_h3_int8_convrot.safetensors", "minimax", "default"))[0]
        print("[WARM DAEMON] (2/4) Loading Video VAE FP16...", flush=True)
        video_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_video_vae_fp16.safetensors"))[0]
        print("[WARM DAEMON] (3/4) Loading Audio VAE FP32...", flush=True)
        audio_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_audio_vae_fp32.safetensors"))[0]
        print("[WARM DAEMON] (4/4) Loading MiniMax-H3 33B DiT INT8...", flush=True)
        unet_base = unwrap(nodes.UNETLoader().load_unet("minimax_h3_ref2va_pruned_int8_convrot.safetensors", "default"))[0]

    load_s = round(time.perf_counter() - t0, 1)
    vram_gb = round(torch.cuda.memory_allocated() / (1024 ** 3), 2)
    print(f"[WARM DAEMON] READY! All 4 models resident in VRAM in {load_s}s ({vram_gb} GB allocated).", flush=True)

    state = {
        "clip_model": clip_model,
        "video_vae": video_vae,
        "audio_vae": audio_vae,
        "unet_base": unet_base,
        "orig_dit_forward": unet_base.model.diffusion_model._forward,
        "video_cache": {},
        "load_s": load_s,
    }

    Path("/tmp/warm_ready.json").write_text(json.dumps({
        "status": "ready",
        "load_s": load_s,
        "vram_gb": vram_gb,
        "ready_at": time.time(),
    }, indent=2))

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", 19876))
    srv.listen(4)
    print("[WARM DAEMON] Listening on 127.0.0.1:19876", flush=True)

    while True:
        conn, _ = srv.accept()
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
                    unet_base.model.diffusion_model._forward = state["orig_dit_forward"]
                    spec = importlib.util.spec_from_file_location("foley_worker_dyn", script_path)
                    mod = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(mod)
                    with torch.inference_mode():
                        res = mod.run_job(state, **args)
                    subprocess.run(["sync", "/vol"], check=False)
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
                print(f"[WARM DAEMON] Socket error: {outer_e}", flush=True)


if __name__ == "__main__":
    import subprocess
    main()
