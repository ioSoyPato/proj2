"""Smoke tests for every API endpoint."""
from fastapi.testclient import TestClient

from app.api.main import app

client = TestClient(app)


def test_static_endpoints():
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and "credentials" in h
    assert all(isinstance(v, bool) for v in h["credentials"].values())  # never exposes values
    inst = client.get("/api/instance").json()
    assert len(inst["courses"]) == 25 and len(inst["sections"]) == 37
    p1 = client.get("/api/phase1").json()
    assert p1["monolithic"]["violations"] == [] and len(p1["timetable"]) == 37
    r = client.get("/api/results")
    assert r.status_code == 200
    res = r.json()
    assert res["meta"]["n_eval"] >= 500 and res["meta"]["crn_verified"]
    assert {p["name"] for p in res["policies"]} == {"baseline", "pfa", "dla", "rl"}


def test_episode_and_live_evaluate():
    ep = client.post("/api/episode", json={"policy": "pfa", "seed": 9000001, "N": 3}).json()
    assert len(ep["weeks"]) == 7 and ep["params"]["N"] == 3
    ev = client.post("/api/evaluate", json={"n_scenarios": 5, "policies": ["baseline", "pfa"], "penalty_unserved": 2000}).json()
    assert ev["live"] and ev["n_scenarios"] == 5 and ev["settings"]["cost"]["penalty_unserved"] == 2000
    assert client.post("/api/evaluate", json={"n_scenarios": 5, "policies": ["nope"]}).status_code == 404
    assert client.post("/api/evaluate", json={"n_scenarios": 1}).status_code == 422
