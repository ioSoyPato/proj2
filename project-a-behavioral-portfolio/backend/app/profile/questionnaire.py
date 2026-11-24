"""The 10-question client questionnaire and the prospect-theory estimation.

Value function (Tversky & Kahneman 1992, without probability weighting)::

    v(x) =  x^alpha            for x >= 0
    v(x) = -lambda (-x)^beta   for x <  0

Estimation, one formula per block of questions (``p = 1/2`` throughout):

* Gain curvature ``alpha``: the client states the certainty equivalent ``CE``
  of a lottery paying ``G`` with probability 1/2, else 0.
  ``CE^alpha = 1/2 G^alpha``  =>  ``alpha = ln(1/2) / ln(CE/G)``.
* Loss curvature ``beta``: the largest sure loss ``CE_L`` accepted instead of
  losing ``L`` with probability 1/2. ``-lambda CE_L^beta = -1/2 lambda L^beta``
  =>  ``beta = ln(1/2) / ln(CE_L/L)`` (``lambda`` cancels).
* Loss aversion ``lambda``: the smallest win ``G*`` that makes a 50/50
  "win G* / lose L" coin flip acceptable. Outcomes are measured relative to
  the stake at risk (``x/L``), which makes ``v`` scale-free -- the same
  convention as Part 3, where outcomes are fractions of reference wealth.
  Indifference ``1/2 (G*/L)^alpha = 1/2 lambda 1^beta``
  =>  ``lambda = (G*/L)^alpha``.

Each parameter is the geometric mean (mean in logs) over its questions, then
clipped to a plausible range. Four scenario questions map to the parameters
of the behavioural policies simulated in Part 3.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

ALPHA_RANGE = (0.25, 1.5)
BETA_RANGE = (0.25, 1.5)
LAMBDA_RANGE = (0.5, 6.0)


@dataclass(frozen=True)
class Question:
    id: str
    block: str  # "alpha" | "beta" | "lambda" | "bias"
    stake: float  # G or L in dollars (0 for bias questions)
    options: list[float]
    default: float
    param: str = ""  # for bias questions: which policy parameter the answer sets


QUESTIONS: list[Question] = [
    # gain curvature: CE of a 50% chance at G
    Question("q1", "alpha", 1_000, [150, 250, 350, 420, 460, 500, 600], 420),
    Question("q2", "alpha", 10_000, [1_500, 2_500, 3_500, 4_200, 4_600, 5_000, 6_000], 4_200),
    # loss curvature: largest sure loss accepted instead of a 50% chance of losing L
    Question("q3", "beta", 1_000, [250, 350, 420, 460, 500, 600, 700], 460),
    Question("q4", "beta", 10_000, [2_500, 3_500, 4_200, 4_600, 5_000, 6_000, 7_000], 4_600),
    # loss aversion: smallest win G* that makes "win G* / lose L" acceptable
    Question("q5", "lambda", 1_000, [1_000, 1_250, 1_500, 2_000, 2_500, 3_000, 4_000, 5_000], 2_500),
    Question("q6", "lambda", 10_000, [10_000, 12_500, 15_000, 20_000, 25_000, 30_000, 40_000, 50_000], 25_000),
    # behavioural scenarios -> policy parameters (option values ARE the parameter values)
    # q7: portfolio fell 20% in 3 months: sell all / sell half / hold / buy more
    #     -> panic drawdown threshold d (fraction). "Sell all" means the client already
    #        breaks at 20% => d = 15%; "sell half" => breaks a little deeper (25%); "hold"
    #        => has a breaking point further out (35%); "buy more" => never (d = 100%).
    Question("q7", "bias", 0, [0.15, 0.25, 0.35, 1.0], 0.25, "panic_drawdown"),
    # q8: after selling, how much must the market rebound before you buy back?
    #     -> re-entry recovery r (fraction above the trough of the portfolio you left)
    Question("q8", "bias", 0, [0.05, 0.10, 0.20, 0.30], 0.20, "reentry_recovery"),
    # q9: a fund you do not own rose 40% last year, yours 8%: ignore / small move / large move / switch
    #     -> chasing intensity k in [0, 1] (share of the portfolio moved into last year's winners)
    Question("q9", "bias", 0, [0.0, 0.25, 0.5, 0.75], 0.25, "chase_intensity"),
    # q10: how often do you look at, and act on, your portfolio? monthly / quarterly / yearly
    #     -> review period f in months for the chaser
    Question("q10", "bias", 0, [1, 3, 6, 12], 3, "review_months"),
]
QUESTION_BY_ID = {q.id: q for q in QUESTIONS}


def _clip(x: float, lo_hi: tuple[float, float]) -> float:
    return float(min(max(x, lo_hi[0]), lo_hi[1]))


def alpha_from_ce(ce: float, stake: float) -> float:
    """alpha = ln(1/2) / ln(CE/G). CE == G/2 gives alpha = 1 (risk neutral)."""
    ratio = min(max(ce / stake, 1e-6), 1 - 1e-6)
    return math.log(0.5) / math.log(ratio)


def beta_from_ce(ce_loss: float, stake: float) -> float:
    """beta = ln(1/2) / ln(CE_L/L)."""
    ratio = min(max(ce_loss / stake, 1e-6), 1 - 1e-6)
    return math.log(0.5) / math.log(ratio)


def lambda_from_mixed(gain: float, loss: float, alpha: float) -> float:
    """lambda = (G*/L)^alpha  (outcomes normalised by the stake L)."""
    return float((gain / loss) ** alpha)


@dataclass
class Profile:
    alpha: float
    beta: float
    lam: float
    panic_drawdown: float
    reentry_recovery: float
    chase_intensity: float
    review_months: int
    detail: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


def default_answers() -> dict[str, float]:
    return {q.id: q.default for q in QUESTIONS}


def estimate_profile(answers: dict[str, float] | None = None) -> Profile:
    """Turn questionnaire answers into prospect-theory and behavioural parameters.

    Missing answers fall back to the question default. Any numeric answer is
    accepted (the UI offers a grid, but the maths does not need it).
    """
    ans = default_answers()
    if answers:
        ans.update({k: float(v) for k, v in answers.items() if k in QUESTION_BY_ID})

    alphas = {q.id: alpha_from_ce(ans[q.id], q.stake) for q in QUESTIONS if q.block == "alpha"}
    betas = {q.id: beta_from_ce(ans[q.id], q.stake) for q in QUESTIONS if q.block == "beta"}
    alpha = _clip(math.exp(sum(math.log(a) for a in alphas.values()) / len(alphas)), ALPHA_RANGE)
    beta = _clip(math.exp(sum(math.log(b) for b in betas.values()) / len(betas)), BETA_RANGE)
    lams = {
        q.id: lambda_from_mixed(ans[q.id], q.stake, alpha)
        for q in QUESTIONS if q.block == "lambda"
    }
    lam = _clip(math.exp(sum(math.log(v) for v in lams.values()) / len(lams)), LAMBDA_RANGE)

    return Profile(
        alpha=alpha,
        beta=beta,
        lam=lam,
        panic_drawdown=float(ans["q7"]),
        reentry_recovery=float(ans["q8"]),
        chase_intensity=float(ans["q9"]),
        review_months=int(round(ans["q10"])),
        detail={
            "answers": ans,
            "alpha_by_question": alphas,
            "beta_by_question": betas,
            "lambda_by_question": lams,
        },
    )


def value_function(x, alpha: float, beta: float, lam: float):
    """Vectorised prospect-theory value v(x)."""
    import numpy as np

    x = np.asarray(x, dtype=float)
    pos = np.clip(x, 0.0, None)
    neg = np.clip(-x, 0.0, None)
    return pos ** alpha - lam * neg ** beta


def inverse_value(v: float, alpha: float, beta: float, lam: float) -> float:
    """x such that v(x) = v (used for the prospect-theory certainty equivalent)."""
    if v >= 0:
        return float(v ** (1.0 / alpha))
    return float(-((-v / lam) ** (1.0 / beta)))


def risk_label(lam: float) -> str:
    if lam < 1.5:
        return "low"
    if lam < 2.5:
        return "moderate"
    if lam < 3.5:
        return "high"
    return "very_high"


def cvar_cap_from_lambda(lam: float) -> float:
    """Monthly 95% CVaR limit for the MILP as a function of loss aversion.

    ``C(lambda) = clip(0.12 / lambda, 0.02, 0.10)``: a loss-neutral client
    (lambda = 1) accepts an equity-like 10% expected loss in the worst 5% of
    months; the textbook lambda = 2.25 gives about 5.3%; lambda = 4 gives 3%.
    """
    return float(min(max(0.12 / lam, 0.02), 0.10))
