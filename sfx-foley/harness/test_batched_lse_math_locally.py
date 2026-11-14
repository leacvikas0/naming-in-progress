"""
Local Unit Test (`test_batched_lse_math_locally.py`):
Verifies our Batched Multi-Prompt + Shared-KV Online Softmax LSE Attention math
and variable-length text padding mask BEFORE running on Modal H200.
"""
import numpy as np

def softmax_lse_np(scores, mask=None):
    # scores: (..., Q, K)
    if mask is not None:
        scores = np.where(mask, scores, -1e9)
    m = np.max(scores, axis=-1, keepdims=True)
    exp_s = np.exp(scores - m)
    if mask is not None:
        exp_s = np.where(mask, exp_s, 0.0)
    denom = np.sum(exp_s, axis=-1, keepdims=True)
    lse = np.squeeze(m, axis=-1) + np.log(np.squeeze(denom, axis=-1) + 1e-20)
    probs = exp_s / (denom + 1e-20)
    return probs, lse

def test_exact_2part_shared_kv_lse():
    rng = np.random.default_rng(42)
    B = 6          # 5 positive prompts + 1 shared negative prompt
    n_stat = 512   # representative static visual tokens
    n_aud = 64
    text_lens = [31, 45, 38, 52, 41, 29]  # different prompt lengths!
    max_text = max(text_lens)
    s_f_max = max_text + n_aud
    H = 4
    D = 32
    scale = 1.0 / np.sqrt(D)

    # Shared visual KV cache (B=1)
    k_stat = rng.standard_normal((1, n_stat, H, D)).astype(np.float32)
    v_stat = rng.standard_normal((1, n_stat, H, D)).astype(np.float32)

    # Per-item Q, K, V with variable text lengths padded to s_f_max
    q_padded = np.zeros((B, s_f_max, H, D), dtype=np.float32)
    k_padded = np.zeros((B, s_f_max, H, D), dtype=np.float32)
    v_padded = np.zeros((B, s_f_max, H, D), dtype=np.float32)
    valid_mask = np.zeros((B, s_f_max), dtype=bool)

    unpadded_items = []
    for b in range(B):
        t_len = text_lens[b]
        sf = t_len + n_aud
        qb = rng.standard_normal((sf, H, D)).astype(np.float32)
        kb = rng.standard_normal((sf, H, D)).astype(np.float32)
        vb = rng.standard_normal((sf, H, D)).astype(np.float32)
        unpadded_items.append((qb, kb, vb))
        q_padded[b, :sf] = qb
        k_padded[b, :sf] = kb
        v_padded[b, :sf] = vb
        valid_mask[b, :sf] = True

    # 1. Ground-Truth Baseline: B separate serial passes with torch.cat([k_stat, k_b])
    ref_outputs = []
    for b in range(B):
        qb, kb, vb = unpadded_items[b]
        k_full = np.concatenate([k_stat[0], kb], axis=0)  # (n_stat + sf, H, D)
        v_full = np.concatenate([v_stat[0], vb], axis=0)
        # (H, sf, D) @ (H, D, n_stat + sf)
        scores = np.einsum("qhd,khd->hqk", qb, k_full) * scale
        probs, _ = softmax_lse_np(scores)
        out_b = np.einsum("hqk,khd->qhd", probs, v_full)
        ref_outputs.append(out_b)

    # 2. Batched Shared-KV LSE Method:
    # Part A: Flatten Q across batch -> (1, B * s_f_max, H, D) against shared k_stat (1, n_stat, H, D)
    q_flat = q_padded.reshape(B * s_f_max, H, D)
    scores_stat = np.einsum("qhd,khd->hqk", q_flat, k_stat[0]) * scale  # (H, B*s_f_max, n_stat)
    probs_stat, lse_stat_flat = softmax_lse_np(scores_stat)
    out_stat_flat = np.einsum("hqk,khd->qhd", probs_stat, v_stat[0])
    out_stat = out_stat_flat.reshape(B, s_f_max, H, D)
    lse_stat = lse_stat_flat.T.reshape(B, s_f_max, H)  # (B, s_f_max, H)

    # Part B: Per-item fast attention on (B, s_f_max, H, D) with key padding mask
    scores_fast = np.einsum("bqhd,bkhd->bhqk", q_padded, k_padded) * scale
    k_mask = valid_mask[:, None, None, :]  # (B, 1, 1, s_f_max)
    probs_fast, lse_fast_bhq = softmax_lse_np(scores_fast, mask=k_mask)
    out_fast = np.einsum("bhqk,bkhd->bqhd", probs_fast, v_padded)
    lse_fast = np.transpose(lse_fast_bhq, (0, 2, 1))  # (B, s_f_max, H)

    # Online Softmax LSE Combine
    m = np.maximum(lse_stat, lse_fast)[..., None]
    ws = np.exp(lse_stat[..., None] - m)
    wf = np.exp(lse_fast[..., None] - m)
    out_comb = (ws * out_stat + wf * out_fast) / (ws + wf)

    # Compare against serial reference for all B items
    max_err = 0.0
    for b in range(B):
        sf = text_lens[b] + n_aud
        err = float(np.max(np.abs(out_comb[b, :sf] - ref_outputs[b])))
        max_err = max(max_err, err)
        assert err < 1e-5, f"Mismatch on batch {b}: {err}"

    print(f"[PASS] Exact 2-Part Batched Shared-KV LSE matches serial torch.cat across all {B} variable-length prompts! max_abs_err = {max_err:.2e}")

if __name__ == "__main__":
    test_exact_2part_shared_kv_lse()
