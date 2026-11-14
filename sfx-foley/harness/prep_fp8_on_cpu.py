"""
Tiny 50MB CPU-Only Downloader (`sfx-foley/harness/prep_fp8_on_cpu.py`).
Uses `modal.Image.debian_slim().apt_install("curl", "ca-certificates")` (NOT the 15GB CUDA GPU image!)
so a CPU container boots in ~1s and streams `minimax_h3_ref2va_pruned_fp8_scaled.safetensors` (20.96 GB)
into `/vol/diffusion_models/` at $0.00 GPU cost.
"""

import json
import os
import subprocess
import sys
import time
import traceback
from pathlib import Path
import modal

os.environ["PYTHONIOENCODING"] = "utf-8"
os.environ["PYTHONUTF8"] = "1"

app = modal.App("haru-machi-cpu-fp8-prep")
vol_models = modal.Volume.from_name("minimax-h3-models", create_if_missing=True)
STATE_FILE = Path("sfx-foley/harness/cpu_prep_call.json")

cpu_dl_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("curl", "ca-certificates", "aria2")
)


@app.function(
    image=cpu_dl_image,
    timeout=600,
    volumes={"/vol": vol_models},
)
def download_fp8_fast():
    try:
        target_dir = Path("/vol/diffusion_models")
        target_dir.mkdir(parents=True, exist_ok=True)
        fname = "minimax_h3_ref2va_pruned_fp8_scaled.safetensors"
        target_path = target_dir / fname

        t0 = time.perf_counter()
        if target_path.exists() and target_path.stat().st_size > 20_000_000_000:
            dl_status = f"CACHE_HIT ({target_path.stat().st_size / 1e9:.2f} GB)"
        else:
            url = f"https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/{fname}"
            token = "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"
            # aria2c 16-connection parallel download directly to /vol/diffusion_models/
            subprocess.run([
                "aria2c", "-x", "16", "-s", "16", "-k", "10M",
                "--header", f"Authorization: Bearer {token}",
                "--dir", str(target_dir),
                "--out", fname,
                "--allow-overwrite=true",
                "--auto-file-renaming=false",
                "--console-log-level=warn",
                url,
            ], check=True)
            vol_models.commit()
            dl_status = f"DOWNLOADED_AND_COMMITTED ({target_path.stat().st_size / 1e9:.2f} GB in {time.perf_counter() - t0:.1f}s)"

        return {"status": "ok", "dl_status": dl_status}
    except Exception:
        return {"status": "error", "traceback": traceback.format_exc()}


if __name__ == "__main__":
    if "--submit" in sys.argv:
        fn = modal.Function.from_name("haru-machi-cpu-fp8-prep", "download_fp8_fast")
        fc = fn.spawn()
        STATE_FILE.write_text(json.dumps({"call_id": fc.object_id, "t0": time.time()}, indent=2))
        print(f"Submitted CPU prep call: {fc.object_id}", flush=True)
    elif "--check" in sys.argv:
        st = json.loads(STATE_FILE.read_text())
        fc = modal.FunctionCall.from_id(st["call_id"])
        try:
            res = fc.get(timeout=4.0)
            print(json.dumps(res, indent=2), flush=True)
        except TimeoutError:
            print(f"[CPU Prep Running - {time.time() - st['t0']:.1f}s elapsed]", flush=True)
        except Exception as e:
            print(f"[Error] {type(e).__name__}: {e}", flush=True)
