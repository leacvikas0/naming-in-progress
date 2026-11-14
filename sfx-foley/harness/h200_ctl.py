"""
Unified Native OpenSSH + PID-1 `tmux` Controller (`sfx-foley/harness/h200_ctl.py`).

Why this never hangs on Windows:
  - PID 1 (`boot`) starts `tmux new-session -d -s work -x 200 -y 60` BEFORE `exec /usr/sbin/sshd -D -e`.
  - Because `tmux` is owned by PID 1 (not `sshd`), Windows `ssh.exe` never hangs waiting on child FDs!
  - Every command runs over native OpenSSH (`ssh` / `scp`) and completes in <0.5 seconds:
      * `python sfx-foley/harness/h200_ctl.py start`
      * `python sfx-foley/harness/h200_ctl.py send "<cmd>"`
      * `python sfx-foley/harness/h200_ctl.py pane [-n 50]`
      * `python sfx-foley/harness/h200_ctl.py ctrl-c`
      * `python sfx-foley/harness/h200_ctl.py put <src> <dst>`
      * `python sfx-foley/harness/h200_ctl.py get <src> <dst>`
      * `python sfx-foley/harness/h200_ctl.py stop`
"""

import argparse
import json
import os
import shlex
import subprocess
import sys
import time
from pathlib import Path

os.environ["PYTHONIOENCODING"] = "utf-8"
os.environ["PYTHONUTF8"] = "1"

import modal

STATE_DIR = Path("sfx-foley/.modal-ssh").resolve()
STATE_FILE = STATE_DIR / "session.json"
LEDGER_FILE = STATE_DIR / "ledger.jsonl"
KEY_FILE = STATE_DIR / "id_ed25519"
HOSTS_FILE = STATE_DIR / "known_hosts"

CACHED_H3_IMAGE = (
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


def ssh_options():
    return [
        "-i", str(KEY_FILE),
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", f"UserKnownHostsFile={HOSTS_FILE}",
        "-o", "ConnectTimeout=15",
        "-o", "ServerAliveInterval=30",
        "-o", "BatchMode=yes",
    ]


def ssh_call(state: dict, remote_cmd: str, timeout: int = 20) -> int:
    target = f"root@{state['host']}"
    cmd = ["ssh", *ssh_options(), "-p", str(state["port"]), target, remote_cmd]
    return subprocess.call(cmd, timeout=timeout)


def scp_put(state: dict, src: str, dst: str):
    target = f"root@{state['host']}"
    subprocess.run(["scp", *ssh_options(), "-P", str(state["port"]), "-r", src, f"{target}:{dst}"], check=True)


def scp_get(state: dict, src: str, dst: str):
    target = f"root@{state['host']}"
    subprocess.run(["scp", *ssh_options(), "-P", str(state["port"]), "-r", f"{target}:{src}", dst], check=True)


def load_session():
    if not STATE_FILE.exists():
        raise RuntimeError("No active session in sfx-foley/.modal-ssh/session.json. Run `start` first.")
    state = json.loads(STATE_FILE.read_text())
    sb = modal.Sandbox.from_id(state["sandbox_id"])
    return state, sb


def cmd_start(timeout: int = 600, hourly_rate: float = 3.95):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if STATE_FILE.exists():
        old_state = json.loads(STATE_FILE.read_text())
        if not old_state.get("stopped") and old_state.get("host"):
            try:
                old_sb = modal.Sandbox.from_id(old_state["sandbox_id"])
                if old_sb.poll() is None:
                    print(f"Sandbox {old_state['sandbox_id']} is ALREADY LIVE at {old_state['host']}:{old_state['port']}!")
                    return
            except Exception:
                pass

    if not KEY_FILE.exists():
        subprocess.run(["ssh-keygen", "-t", "ed25519", "-N", "", "-f", str(KEY_FILE)], check=True, capture_output=True)

    ssh_image = (
        CACHED_H3_IMAGE
        .apt_install("openssh-server", "tmux", "rsync")
        .add_local_file(str(KEY_FILE) + ".pub", "/opt/authorized_keys", copy=True)
    )

    # PID 1 starts tmux session `work` BEFORE exec sshd so tmux is never a child of an SSH session!
    boot = (
        "mkdir -p /run/sshd /root/.ssh && "
        "cp /opt/authorized_keys /root/.ssh/authorized_keys && "
        "chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys && "
        "ssh-keygen -A && "
        "tmux new-session -d -s work -x 200 -y 60 && "
        "exec /usr/sbin/sshd -D -e"
    )

    vol_models = modal.Volume.from_name("minimax-h3-models", create_if_missing=True)
    app = modal.App.lookup("agent-modal-ssh", create_if_missing=True)

    sb = modal.Sandbox.create(
        "bash", "-lc", boot,
        app=app,
        image=ssh_image,
        volumes={"/vol": vol_models},
        unencrypted_ports=[22],
        timeout=timeout,
        gpu="H100",
    )

    state = {
        "sandbox_id": sb.object_id,
        "gpu": "H100",
        "started": time.time(),
        "timeout": timeout,
        "hourly_rate": hourly_rate,
        "stopped": False,
    }
    STATE_FILE.write_text(json.dumps(state, indent=2))
    try:
        host, port = sb.tunnels(timeout=60)[22].tcp_socket
        state["host"] = host
        state["port"] = port
        STATE_FILE.write_text(json.dumps(state, indent=2))
        print(json.dumps(state, indent=2), flush=True)
        print(f'SSH: ssh -i "{KEY_FILE}" -p {port} root@{host}', flush=True)
    except BaseException:
        sb.terminate(wait=True)
        raise


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="action", required=True)
    sub.add_parser("start")
    sub.add_parser("status")
    snd = sub.add_parser("send")
    snd.add_argument("cmd")
    pn = sub.add_parser("pane")
    pn.add_argument("-n", "--lines", type=int, default=45)
    sub.add_parser("ctrl-c")
    ex = sub.add_parser("exec")
    ex.add_argument("cmd")
    for act in ("put", "get"):
        tr = sub.add_parser(act)
        tr.add_argument("src")
        tr.add_argument("dst")
    sub.add_parser("stop")
    args = p.parse_args()

    if args.action == "start":
        cmd_start()
        return

    state, sb = load_session()
    if args.action == "stop":
        if state.get("stopped"):
            print("Already stopped.")
            return
        try:
            if sb.poll() is None:
                ssh_call(state, "sync /vol", timeout=15)
        except Exception:
            pass
        finally:
            try:
                sb.terminate(wait=True)
            except Exception as e:
                print(f"Terminate note: {e}")
        state["stopped"] = time.time()
        duration = min(state["stopped"] - state["started"], state["timeout"])
        state["estimated_compute_usd"] = round((duration / 3600.0) * state["hourly_rate"], 4)
        STATE_FILE.write_text(json.dumps(state, indent=2))
        with LEDGER_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(state) + "\n")
        print(json.dumps(state, indent=2), flush=True)
        return

    if state.get("stopped") or sb.poll() is not None:
        raise RuntimeError(f"Sandbox {state['sandbox_id']} is stopped (exit={sb.poll()}).")

    if args.action == "status":
        elapsed_m = (time.time() - state["started"]) / 60.0
        est_usd = (elapsed_m / 60.0) * state["hourly_rate"]
        print(f"Sandbox: {state['sandbox_id']} ({state['host']}:{state['port']}) | Up: {elapsed_m:.1f}m | Spend: ${est_usd:.3f}", flush=True)
        ssh_call(state, "nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader")
        return

    if args.action == "send":
        cmd_str = f"(tmux has-session -t work 2>/dev/null || tmux new-session -d -s work -x 200 -y 60) && tmux send-keys -t work -l {shlex.quote(args.cmd)} && tmux send-keys -t work Enter"
        raise SystemExit(ssh_call(state, cmd_str, timeout=15))

    if args.action == "pane":
        target = f"root@{state['host']}"
        cmd = ["ssh", *ssh_options(), "-p", str(state["port"]), target, f"tmux capture-pane -pt work -S -{int(args.lines)}"]
        p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15)
        lines = [line.rstrip() for line in (p.stdout or "").splitlines()]
        while lines and not lines[-1]:
            lines.pop()
        print("\n".join(lines[-int(args.lines):]), flush=True)
        raise SystemExit(p.returncode)

    if args.action == "ctrl-c":
        raise SystemExit(ssh_call(state, "tmux send-keys -t work C-c", timeout=15))

    if args.action == "exec":
        raise SystemExit(ssh_call(state, "bash -lc " + shlex.quote(args.cmd), timeout=30))

    if args.action == "put":
        scp_put(state, args.src, args.dst)
        return

    if args.action == "get":
        scp_get(state, args.src, args.dst)
        return


if __name__ == "__main__":
    main()
