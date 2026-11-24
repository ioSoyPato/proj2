"""Reinforcement learning: a compact Double-DQN written in numpy.

Why numpy and not PyTorch: the network is tiny (7 → 128 → 128 → |grid|), the
Docker image stays small (no 700 MB torch wheel), it installs identically on
Python 3.12 and 3.14, and inference at runtime is two matrix products.  The
agent is trained offline by ``scripts/train_rl.py`` on its OWN seed family and
the weights are shipped in ``data/rl_dqn.npz``; the API never trains.

Policy class (Powell): VFA — the policy is argmax_a Q̄(S_t, a), where Q̄ is a
neural approximation of the post-decision value.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from ..simulator.demand import purchase_prob, update_reference
from ..simulator.engine import State, Scenarios, make_scenarios, scarcity_multiplier, step_outcome
from ..simulator.params import MarketParams
from .rules import expected_cum_share

N_FEATURES = 7
BELIEF_N0 = 300.0


def features(state: State, params: MarketParams, F: np.ndarray) -> np.ndarray:
    """φ(S_t): everything the agent sees — all observable at decision time."""
    T, C = params.horizon, params.capacity
    lam_mean = params.total_arrivals / T
    sold = state.sold.astype(float)
    m_hat = (sold + BELIEF_N0) / (state.exp_sold + BELIEF_N0)
    x = np.stack([
        np.full(sold.shape, state.days_left / T),
        state.seats / C,
        state.ref / params.price_max,
        state.last_sales / max(lam_mean, 1e-9),
        (sold - C * F[state.t]) / C * 5.0,
        np.log(m_hat) * 3.0,
        np.full(sold.shape, params.arrival_rates()[state.t] / max(lam_mean, 1e-9) / 3.0),
    ], axis=1)
    return x


# ---------------------------------------------------------------------------
# A small MLP with Adam, forward/backward by hand
# ---------------------------------------------------------------------------
class MLP:
    def __init__(self, sizes: list[int], rng: np.random.Generator):
        self.W = [rng.normal(0, np.sqrt(2.0 / a), (a, b)) for a, b in zip(sizes[:-1], sizes[1:])]
        self.b = [np.zeros(b) for b in sizes[1:]]
        self.W[-1] *= 0.1
        self._m = [np.zeros_like(w) for w in self.W + self.b]
        self._v = [np.zeros_like(w) for w in self.W + self.b]
        self._t = 0

    def params(self) -> list[np.ndarray]:
        return self.W + self.b

    def copy_from(self, other: "MLP") -> None:
        self.W = [w.copy() for w in other.W]
        self.b = [b.copy() for b in other.b]

    def soft_update(self, other: "MLP", tau: float) -> None:
        for a, b in zip(self.W + self.b, other.W + other.b):
            a *= 1.0 - tau
            a += tau * b

    def forward(self, x: np.ndarray, keep: bool = False):
        acts = [x]
        h = x
        for i, (w, b) in enumerate(zip(self.W, self.b)):
            h = h @ w + b
            if i < len(self.W) - 1:
                h = np.maximum(h, 0.0)
            acts.append(h)
        return (h, acts) if keep else h

    def backward_step(self, acts: list[np.ndarray], grad_out: np.ndarray, lr: float,
                      clip: float = 10.0) -> None:
        gW, gb = [None] * len(self.W), [None] * len(self.b)
        g = grad_out
        for i in reversed(range(len(self.W))):
            gW[i] = acts[i].T @ g
            gb[i] = g.sum(axis=0)
            if i > 0:
                g = (g @ self.W[i].T) * (acts[i] > 0)
        grads = gW + gb
        norm = np.sqrt(sum(float((x * x).sum()) for x in grads))
        if norm > clip:
            grads = [x * (clip / norm) for x in grads]
        self._t += 1
        b1, b2, eps = 0.9, 0.999, 1e-8
        ps = self.params()
        for k, (p, gk) in enumerate(zip(ps, grads)):
            self._m[k] = b1 * self._m[k] + (1 - b1) * gk
            self._v[k] = b2 * self._v[k] + (1 - b2) * gk * gk
            mh = self._m[k] / (1 - b1 ** self._t)
            vh = self._v[k] / (1 - b2 ** self._t)
            p -= lr * mh / (np.sqrt(vh) + eps)


# ---------------------------------------------------------------------------
# The policy used by the simulator
# ---------------------------------------------------------------------------
@dataclass
class DQNPolicy:
    weights: list[np.ndarray]
    biases: list[np.ndarray]
    n_actions: int
    name: str = "rl"
    _F: np.ndarray = field(default=None, repr=False)  # type: ignore[assignment]

    @classmethod
    def load(cls, path: Path) -> "DQNPolicy":
        z = np.load(path)
        n = int(z["n_layers"])
        W = [z[f"W{i}"] for i in range(n)]
        b = [z[f"b{i}"] for i in range(n)]
        return cls(W, b, W[-1].shape[1])

    def q_values(self, x: np.ndarray) -> np.ndarray:
        h = x
        for i, (w, b) in enumerate(zip(self.weights, self.biases)):
            h = h @ w + b
            if i < len(self.weights) - 1:
                h = np.maximum(h, 0.0)
        return h

    def reset(self, params: MarketParams, n: int) -> None:
        if len(params.grid) != self.n_actions:
            raise ValueError("RL agent was trained on a different price grid")
        self._F = expected_cum_share(params)

    def act(self, state: State, params: MarketParams) -> np.ndarray:
        return self.q_values(features(state, params, self._F)).argmax(axis=1)


def save_policy(net: MLP, path: Path) -> None:
    arrs = {f"W{i}": w for i, w in enumerate(net.W)} | {f"b{i}": b for i, b in enumerate(net.b)}
    np.savez_compressed(path, n_layers=len(net.W), **arrs)


# ---------------------------------------------------------------------------
# Training (offline only)
# ---------------------------------------------------------------------------
@dataclass
class DQNConfig:
    hidden: int = 128
    rounds: int = 2000                # each round = n_envs parallel episodes
    n_envs: int = 64
    updates_per_step: int = 2
    batch: int = 256
    lr: float = 3e-4
    lr_final: float = 3e-5
    gamma: float = 1.0                # finite horizon, undiscounted revenue (time is in the state)
    buffer: int = 400_000
    eps_start: float = 1.0
    eps_end: float = 0.03
    eps_frac: float = 0.6
    tau: float = 0.005                # Polyak averaging of the target network (every gradient step)
    huber: float = 1.0
    eval_every: int = 25
    eval_scenarios: int = 200
    seed: int = 0


def _run_episode_batch(params: MarketParams, sc: Scenarios, choose, F: np.ndarray, scale: float):
    """Roll n episodes in lock-step; ``choose(phi, state) -> actions``. Returns transitions."""
    T, S, grid = params.horizon, sc.n, params.grid
    lam = params.arrival_rates()
    level = sc.level(params.demand_sigma)
    seats = np.full(S, params.capacity, dtype=np.int64)
    ref = np.full(S, params.ref_init)
    last = np.zeros(S, dtype=np.int64)
    exp_sold = np.zeros(S)
    obs, acts, rews, nxt, dones = [], [], [], [], []
    total = np.zeros(S)
    phi = None
    for t in range(T):
        st = State(t, T - t, seats.copy(), ref.copy(), last.copy(), params.capacity - seats, exp_sold.copy())
        phi = features(st, params, F)
        a = choose(phi, st)
        price = grid[a]
        _, sales = step_outcome(params, t, price, ref, seats, sc.u_arr[:, t], sc.u_buy[:, t], lam, level)
        q = purchase_prob(price, ref, params.eta, params.gamma, params.wtp_mu, params.wtp_sigma)
        exp_sold += np.where(seats > 0, lam[t] * scarcity_multiplier(params, seats) * q, 0.0)
        rev = price * sales
        total += rev
        seats = seats - sales
        last = sales
        ref = update_reference(ref, price, params.theta)
        obs.append(phi); acts.append(a); rews.append(rev / scale)
        dones.append(np.full(S, t == T - 1) | (seats == 0))
        if t < T - 1:
            st2 = State(t + 1, T - t - 1, seats.copy(), ref.copy(), last.copy(), params.capacity - seats, exp_sold.copy())
            nxt.append(features(st2, params, F))
        else:
            nxt.append(np.zeros_like(phi))
    return obs, acts, rews, nxt, dones, total


def train_dqn(params: MarketParams, cfg: DQNConfig, seed_family: int, val_family: int,
              log=print) -> tuple[MLP, dict]:
    """Train a Double-DQN; keep the network with the best greedy revenue on a
    validation set drawn from ``val_family`` (a TUNING family, never the eval one)."""
    rng = np.random.default_rng(cfg.seed)
    A = len(params.grid)
    net = MLP([N_FEATURES, cfg.hidden, cfg.hidden, A], rng)
    tgt = MLP([N_FEATURES, cfg.hidden, cfg.hidden, A], rng)
    tgt.copy_from(net)
    best = MLP([N_FEATURES, cfg.hidden, cfg.hidden, A], rng)
    best.copy_from(net)
    F = expected_cum_share(params)
    scale = params.capacity * params.price_max / 10.0     # episode return ≈ O(1..10)

    cap = cfg.buffer
    B_s = np.zeros((cap, N_FEATURES)); B_a = np.zeros(cap, dtype=np.int64); B_r = np.zeros(cap)
    B_n = np.zeros((cap, N_FEATURES)); B_d = np.zeros(cap, dtype=bool)
    ptr, size, grad_steps = 0, 0, 0
    val_sc = make_scenarios(val_family, cfg.eval_scenarios, params.horizon)
    history: list[dict] = []
    best_val = -np.inf
    t0 = time.time()

    def greedy_eval(model: MLP) -> float:
        *_, total = _run_episode_batch(params, val_sc, lambda phi, st: model.forward(phi).argmax(1), F, scale)
        return float(total.mean())

    for rnd in range(cfg.rounds):
        frac = rnd / max(1, cfg.rounds - 1)
        eps = cfg.eps_end + (cfg.eps_start - cfg.eps_end) * max(0.0, 1 - frac / cfg.eps_frac)
        lr = cfg.lr + (cfg.lr_final - cfg.lr) * frac
        sc = make_scenarios(seed_family, cfg.n_envs, params.horizon, start=rnd * cfg.n_envs)

        def choose(phi, st, _eps=eps):
            greedy = net.forward(phi).argmax(1)
            rand = rng.integers(0, A, size=phi.shape[0])
            return np.where(rng.random(phi.shape[0]) < _eps, rand, greedy)

        obs, acts, rews, nxt, dones, _ = _run_episode_batch(params, sc, choose, F, scale)
        alive = np.ones(cfg.n_envs, dtype=bool)
        for t in range(params.horizon):
            idx = np.nonzero(alive)[0]
            k = len(idx)
            if k:
                pos = (ptr + np.arange(k)) % cap
                B_s[pos], B_a[pos], B_r[pos] = obs[t][idx], acts[t][idx], rews[t][idx]
                B_n[pos], B_d[pos] = nxt[t][idx], dones[t][idx]
                ptr = (ptr + k) % cap
                size = min(cap, size + k)
            alive &= ~dones[t]
            # gradient updates
            if size >= 5 * cfg.batch:
                for _ in range(cfg.updates_per_step):
                    j = rng.integers(0, size, cfg.batch)
                    q_next_online = net.forward(B_n[j]).argmax(1)
                    q_next_tgt = tgt.forward(B_n[j])[np.arange(cfg.batch), q_next_online]
                    y = B_r[j] + cfg.gamma * (~B_d[j]) * q_next_tgt
                    q, acts_cache = net.forward(B_s[j], keep=True)
                    err = q[np.arange(cfg.batch), B_a[j]] - y
                    g_err = np.clip(err, -cfg.huber, cfg.huber) / cfg.batch
                    grad = np.zeros_like(q)
                    grad[np.arange(cfg.batch), B_a[j]] = g_err
                    net.backward_step(acts_cache, grad, lr)
                    grad_steps += 1
                    tgt.soft_update(net, cfg.tau)
        if (rnd + 1) % cfg.eval_every == 0 or rnd == cfg.rounds - 1:
            v = greedy_eval(net)
            history.append({"round": rnd + 1, "episodes": (rnd + 1) * cfg.n_envs, "epsilon": round(eps, 4),
                            "val_revenue": v, "seconds": round(time.time() - t0, 1)})
            if v > best_val:
                best_val = v
                best.copy_from(net)
            log(f"round {rnd + 1:4d}  eps={eps:.3f}  val revenue={v:,.0f}  best={best_val:,.0f}  "
                f"({time.time() - t0:.0f}s)")
    meta = {"config": cfg.__dict__, "history": history, "best_val_revenue": best_val,
            "train_seconds": round(time.time() - t0, 1), "grad_steps": grad_steps,
            "train_seed_family": seed_family, "val_seed_family": val_family,
            "trained_on": params.to_dict(), "n_features": N_FEATURES}
    return best, meta


def save_meta(meta: dict, path: Path) -> None:
    path.write_text(json.dumps(meta, indent=2, default=float))
