"""Baseline (do nothing) and the waitlist-threshold PFA."""
from __future__ import annotations

from ..simulator.env import Action, RegistrationEnv
from ..simulator.params import CANCEL_FROM_WEEK, N_WEEKS
from .common import Policy, best_room_move, cover_orphans, execute_open, open_options, pending_free, pick_option


class Baseline(Policy):
    """Keep the published Phase-1 timetable; never change anything."""
    name = "baseline"
    label = "Baseline (no changes)"
    policy_class = "baseline"

    def decide(self, env: RegistrationEnv) -> list[Action]:
        return []


class WaitlistRule(Policy):
    """PFA: open capacity when a course's waitlist exceeds N; merge sections below M.

    Each week t (in this order):
      1. orphaned sections are re-staffed (FT substitute > arrived adjunct > hire);
      2. for every course with waitlist W_c - (seats already planned) > N, add
         capacity: first the largest room upgrade (if it absorbs >= min(W_c, 8)
         seats), otherwise open a new section -- full-time professor with spare
         load if any, else an adjunct (hiring one if needed and the 2-week lead
         time still lands before registration closes);
      3. from week 2 on, a section with fewer than M students in a course with
         no waitlist is merged into its sibling with most free seats (if they fit).
    Tunable parameters: N (waitlist trigger) and M (minimum section size).
    """
    name = "pfa"
    label = "Waitlist rule (PFA)"
    policy_class = "PFA"

    def __init__(self, N: int = 5, M: int = 10):
        self.N, self.M = int(N), int(M)

    def params(self) -> dict:
        return {"N": self.N, "M": self.M}

    def decide(self, env: RegistrationEnv) -> list[Action]:
        cover_orphans(env)
        t = env.t
        if t >= N_WEEKS:
            return []
        for c in sorted(range(env.n_courses), key=lambda c: -env.waitlist(c)):
            need = env.waitlist(c) - pending_free(env, c)
            if need <= self.N:
                continue
            mv = best_room_move(env, c)
            if mv is not None and mv[2] >= min(need, 8):
                env.apply(Action("move", section=mv[0], room=mv[1]), strict=False)
                need = env.waitlist(c) - pending_free(env, c)
                if need <= self.N:
                    continue
            o = pick_option(open_options(env, c, ("ft",)), need)
            if o is None:
                o = pick_option(open_options(env, c, ("adj",)), need)
            if o is not None:
                execute_open(env, c, o)
        if t >= CANCEL_FROM_WEEK and self.M > 0:
            for c in range(env.n_courses):
                if env.waitlist(c) > 0:
                    continue
                secs = env.course_sections(c, include_planned=False)
                if len(secs) < 2:
                    continue
                small = min(secs, key=lambda s: s.enrolled)
                if small.enrolled >= self.M:
                    continue
                dst = max((s for s in secs if s.idx != small.idx), key=lambda s: s.capacity - s.enrolled)
                env.apply(Action("merge", section=small.idx, target=dst.idx), strict=False)
        return []
