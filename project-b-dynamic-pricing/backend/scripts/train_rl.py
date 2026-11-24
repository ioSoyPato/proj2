"""Train the Double-DQN pricing agent on the default market and ship its weights.

    cd backend && python -m scripts.train_rl            # ~ a few minutes on a laptop
    python -m scripts.train_rl --rounds 100             # quick smoke run

Training episodes come from seed family SEED_RL_TRAIN; model selection uses a
validation set from SEED_TUNING.  The final-evaluation family (SEED_EVAL) is
never touched here.
"""
from __future__ import annotations

import argparse

from app.config import DATA_DIR, RL_META_JSON, RL_WEIGHTS, SEED_RL_TRAIN, SEED_TUNING
from app.policies.rl import DQNConfig, save_meta, save_policy, train_dqn
from app.simulator.params import default_params


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rounds", type=int, default=DQNConfig.rounds)
    ap.add_argument("--n-envs", type=int, default=DQNConfig.n_envs)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--lr", type=float, default=DQNConfig.lr)
    ap.add_argument("--tau", type=float, default=DQNConfig.tau)
    args = ap.parse_args()
    params = default_params()
    cfg = DQNConfig(rounds=args.rounds, n_envs=args.n_envs, seed=args.seed, lr=args.lr, lr_final=args.lr / 10,
                    tau=args.tau)
    print(f"training DQN on {params.arrival_shape_source} market: {cfg.rounds} rounds x {cfg.n_envs} episodes")
    # validation scenarios are offset far from the ones used for tuning other policies
    net, meta = train_dqn(params, cfg, seed_family=SEED_RL_TRAIN, val_family=SEED_TUNING + 500)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    save_policy(net, RL_WEIGHTS)
    save_meta(meta, RL_META_JSON)
    print(f"saved {RL_WEIGHTS} (best validation revenue {meta['best_val_revenue']:,.0f})")


if __name__ == "__main__":
    main()
