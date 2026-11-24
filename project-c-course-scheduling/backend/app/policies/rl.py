"""VFA: tabular Q-learning over a compact per-course state abstraction.

One Q-table is shared by all 25 courses ("parameter sharing"): each week
every course is an agent that observes a 5-feature abstraction of the state
and picks one of five actions. Returns are the negative cost-to-go
attributable to that course (its instructor/room costs, adjunct fees it
triggered, unserved and changed students), in $1000s.

State features (7 x 4 x 5 x 2 x 2 = 560 states):
  t            week 0..6
  wait         waitlist bucket {0, 1-4, 5-12, 13+}
  gap          projected demand (enrolled + waitlist + posterior remaining requests)
               minus capacity, bucket {<=-10, (-10,-2], (-2,4], (4,12], >12}
  orphan       course has a section without instructor
  mergeable    week >= 2 and the smallest section is < 50% full and fits in its siblings
Actions: 0 hold, 1 add capacity with full-time faculty (or re-staff orphan),
         2 add capacity with an adjunct (hire if needed), 3 room upgrade, 4 merge smallest.
An infeasible choice is executed as "hold" (and learned as such).

Trained on TRAINING seeds (disjoint from tuning and evaluation seeds);
the learned table ships in ``policies/trained/q_table.json``.
"""
from __future__ import annotations

import json
import time

import numpy as np

from ..config import POLICY_DIR, TRAIN_SEED_BASE
from ..simulator.env import Action, RegistrationEnv
from ..simulator.params import CANCEL_FROM_WEEK, N_WEEKS
from .common import (Policy, best_room_move, cover_orphans, execute_open, open_options, pending_free, pick_option,
                     reschedule_options, remaining_by_week)

N_ACTIONS = 5
ACTION_NAMES = ["hold", "add FT section", "add adjunct section", "room upgrade", "merge smallest"]
SHAPE = (N_WEEKS + 1, 4, 5, 2, 2)
Q_FILE = POLICY_DIR / "q_table.json"


def _bucket(x: float, edges: list[float]) -> int:
    for i, e in enumerate(edges):
        if x <= e:
            return i
    return len(edges)


def course_features(env: RegistrationEnv, c: int, rem: np.ndarray) -> tuple[int, ...]:
    W = env.waitlist(c)
    secs = env.course_sections(c)
    cap = sum(s.capacity for s in secs)
    E = sum(s.enrolled for s in secs)
    gap = E + W + rem[c] - cap
    orphan = int(any(s.instr_kind == "" for s in secs))
    merge = 0
    if CANCEL_FROM_WEEK <= env.t < N_WEEKS:
        act = [s for s in secs if s.status == "active"]
        if len(act) >= 2:
            sm = min(act, key=lambda s: s.enrolled)
            if sm.enrolled < 0.5 * sm.capacity and sm.enrolled <= sum(s.capacity - s.enrolled for s in act if s is not sm):
                merge = 1
    return (min(env.t, N_WEEKS), _bucket(W, [0, 4, 12]), _bucket(gap, [-10, -2, 4, 12]), orphan, merge)


def do_action(env: RegistrationEnv, c: int, a: int) -> bool:
    """Execute macro-action a for course c. Returns True if something was done."""
    t = env.t
    orphans = [s for s in env.course_sections(c) if s.instr_kind == ""]
    if a == 0:
        return False
    if a in (1, 2) and orphans:
        s = orphans[0]
        kinds = ("ft",) if a == 1 else ("adj",)
        opts = reschedule_options(env, s, kinds)
        same = [o for o in opts if o.pattern == s.pattern and o.room == s.room]
        if same:
            o = same[0]
            return env.apply(Action("assign", section=s.idx, instr_kind=o.instr_kind, instr=o.instr), strict=False)
        if opts:
            o = min(opts, key=lambda o: (o.clash, abs(o.capacity - s.capacity), o.cost))
            return env.apply(Action("reschedule", section=s.idx, instr_kind=o.instr_kind, instr=o.instr,
                                    room=o.room, pattern=o.pattern), strict=False)
        if a == 2:
            inst = env.inst
            for ai, adj in enumerate(inst.adjuncts):
                if (env.adj_hired_week[ai] < 0 and c in adj.qualified and t + adj.lead_time <= N_WEEKS
                        and env.budget >= env.S.cost.adjunct_hire_fee + adj.cost_per_section):
                    return env.apply(Action("hire", course=c, instr=ai), strict=False)
        return False
    if t >= N_WEEKS:
        return False
    need = max(env.waitlist(c) - pending_free(env, c), 10)
    if a == 1:
        o = pick_option(open_options(env, c, ("ft",)), need)
        return o is not None and execute_open(env, c, o)
    if a == 2:
        o = pick_option(open_options(env, c, ("adj",)), need)
        return o is not None and execute_open(env, c, o)
    if a == 3:
        mv = best_room_move(env, c)
        return mv is not None and env.apply(Action("move", section=mv[0], room=mv[1]), strict=False)
    if a == 4:
        act = env.course_sections(c, include_planned=False)
        if len(act) < 2:
            return False
        sm = min(act, key=lambda s: s.enrolled)
        dst = max((s for s in act if s.idx != sm.idx), key=lambda s: s.capacity - s.enrolled)
        return env.apply(Action("merge", section=sm.idx, target=dst.idx), strict=False)
    return False


class QLearningPolicy(Policy):
    name = "rl"
    label = "Q-learning (VFA / RL)"
    policy_class = "VFA"

    def __init__(self, Q: np.ndarray | None = None, epsilon: float = 0.0, rng: np.random.Generator | None = None,
                 meta: dict | None = None, visits: np.ndarray | None = None):
        if Q is None:
            Q, meta, visits = load_q()
        self.Q = Q
        self.visits = visits if visits is not None else np.ones_like(Q)
        self.epsilon = epsilon
        self.rng = rng or np.random.default_rng(0)
        self.meta = meta or {}
        self.trace: list[tuple[int, tuple, int, float]] = []  # (course, state, action, cost before)

    def params(self) -> dict:
        return {"episodes": self.meta.get("episodes"), "states_visited": self.meta.get("states_visited")}

    def reset(self, env: RegistrationEnv) -> None:
        super().reset(env)
        self.trace = []

    def decide(self, env: RegistrationEnv) -> list[Action]:
        rem = remaining_by_week(env).sum(axis=1)
        feats = {c: course_features(env, c, rem) for c in range(env.n_courses)}
        order = sorted(range(env.n_courses), key=lambda c: -(feats[c][2] * 10 + feats[c][1]))
        for c in order:
            st = course_features(env, c, rem)
            before = env.course_cost(c)
            if self.epsilon > 0 and self.rng.random() < self.epsilon:
                a = int(self.rng.integers(N_ACTIONS))
                done = do_action(env, c, a)
                executed = a if done else 0
            else:
                # greedy over actions that were actually experienced in training, best first;
                # an infeasible choice falls through to the next best (hold always works)
                q = np.where(self.visits[st] > 0, self.Q[st], -np.inf)
                q[0] = self.Q[st][0] if self.visits[st][0] > 0 else 0.0
                executed = 0
                for a in np.argsort(-q, kind="stable"):
                    if not np.isfinite(q[a]) or a == 0:
                        break
                    if do_action(env, c, int(a)):
                        executed = int(a)
                        break
            self.trace.append((c, st, executed, before))
        if env.t >= N_WEEKS:  # safety net at term start: re-staff with whoever is free
            cover_orphans(env, allow_hire=False)
        return []


# ---------------------------------------------------------------------- training
def train(inst, timetable, settings, episodes: int = 15000, seed_base: int = TRAIN_SEED_BASE,
          log_every: int = 100) -> tuple[np.ndarray, dict]:
    from ..simulator.scenario import make_scenario

    Q = np.zeros(SHAPE + (N_ACTIONS,))
    visits = np.zeros_like(Q)
    rng = np.random.default_rng(seed_base)
    curve: list[dict] = []
    window: list[float] = []
    t0 = time.perf_counter()
    for ep in range(episodes):
        eps = max(0.05, 0.6 * (1 - ep / (0.75 * episodes)))
        pol = QLearningPolicy(Q, epsilon=eps, rng=rng, meta={}, visits=visits)
        env = RegistrationEnv(inst, timetable, make_scenario(inst, seed_base + ep, settings.scen), settings)
        out = env.run(pol)
        # per-course transitions: reward = -(cost(next decision) - cost(this decision)) / 1000
        by_c: dict[int, list[tuple[tuple, int, float]]] = {}
        for c, st, a, before in pol.trace:
            by_c.setdefault(c, []).append((st, a, before))
        for c, steps in by_c.items():
            final = env.course_cost(c)
            # every-visit Monte-Carlo target: the course's realised cost-to-go from this decision.
            # (More robust than 1-step bootstrapping when many true states share one table cell.)
            for st, a, before in steps:
                G = -(final - before) / 1000.0
                visits[st + (a,)] += 1
                alpha = max(0.01, 1.0 / visits[st + (a,)])
                Q[st + (a,)] += alpha * (G - Q[st + (a,)])
        window.append(out["total_cost"])
        if (ep + 1) % log_every == 0:
            curve.append({"episode": ep + 1, "mean_cost": float(np.mean(window)), "epsilon": eps,
                          "unserved": float(out["unserved"])})
            window = []
    meta = {"episodes": episodes, "seed_base": seed_base, "seconds": time.perf_counter() - t0,
            "states_visited": int((visits.sum(axis=-1) > 0).sum()), "n_states": int(np.prod(SHAPE)),
            "curve": curve, "shape": list(SHAPE), "actions": ACTION_NAMES}
    meta["visits"] = visits
    return Q, meta


def save_q(Q: np.ndarray, meta: dict) -> None:
    POLICY_DIR.mkdir(parents=True, exist_ok=True)
    visits = meta.pop("visits", np.ones_like(Q))
    Q_FILE.write_text(json.dumps({"meta": meta, "Q": np.round(Q, 4).tolist(),
                                  "visits": visits.astype(int).tolist()}), encoding="utf-8")
    global _Q_CACHE
    _Q_CACHE = None


_Q_CACHE: tuple[np.ndarray, dict, np.ndarray] | None = None


def load_q() -> tuple[np.ndarray, dict, np.ndarray]:
    global _Q_CACHE
    if _Q_CACHE is None:
        if Q_FILE.is_file():
            js = json.loads(Q_FILE.read_text(encoding="utf-8"))
            _Q_CACHE = (np.array(js["Q"]), js["meta"], np.array(js["visits"]))
        else:
            z = np.zeros(SHAPE + (N_ACTIONS,))
            _Q_CACHE = (z, {"episodes": 0, "untrained": True}, z)
    return _Q_CACHE


def policy_summary(Q: np.ndarray, visits: np.ndarray) -> list[dict]:
    """Greedy action per (week, wait, gap) with orphan=0, merge=0 -- for the dashboard heatmap."""
    out = []
    for t in range(SHAPE[0]):
        for w in range(SHAPE[1]):
            for g in range(SHAPE[2]):
                v = visits[t, w, g, 0, 0]
                q = np.where(v > 0, Q[t, w, g, 0, 0], -np.inf)
                seen = bool(v.sum() > 0)
                out.append({"week": t, "wait": w, "gap": g, "action": int(np.argmax(q)) if seen else None,
                            "visits": int(v.sum())})
    return out
