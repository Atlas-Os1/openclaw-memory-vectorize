#!/usr/bin/env python3
"""CLI for the OpenClaw memory-vectorize Worker.

Replaces memory-vector-search.sh and memory-vector-index.sh with one tool
that has real subcommands, error handling, and a roster that matches the
agents actually running today (the old index script's hardcoded agent list
had gone stale and silently skipped half the fleet).

Usage:
    memory_cli.py search "<query>" [--agent AGENT] [--top-k N] [--min-score S] [--json]
    memory_cli.py index <agent> [--days N] [--json]
    memory_cli.py index-all [--days N] [--json]
    memory_cli.py health [--json]
    memory_cli.py stats [--json]

Configuration (canonical env vars):
    OPENCLAW_MEMORY_WORKER_URL    Base URL of the deployed worker (required).
    OPENCLAW_MEMORY_WORKER_TOKEN  Optional bearer token for protected endpoints.

Legacy compatibility:
    MEMORY_WORKER_URL and MEMORY_WORKER_TOKEN are still accepted as deprecated
    fallbacks so existing cron/scripts do not break immediately. New setup docs
    and profile wiring should use only the OPENCLAW_MEMORY_* names.

Exit codes:
    0  success (including "no results found" for search)
    1  usage error (bad args, missing OPENCLAW_MEMORY_WORKER_URL)
    2  request to the worker failed (network error, non-2xx, bad JSON)
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

# The agent roster lives in agents.json next to this script, not as Python
# literals here. There has already been one profile rename (default ->
# atlas) and agents get added/retired over time, so adding an agent should
# be a one-line JSON edit that's easy to diff and review -- not a code
# change to this file. Override the path with MEMORY_CLI_AGENTS_FILE if
# you need to point at a different roster (e.g. for testing).
DEFAULT_AGENTS_FILE = Path(__file__).resolve().parent / "agents.json"


def _load_agents() -> tuple[list[str], list[str]]:
    agents_file = Path(os.environ.get("MEMORY_CLI_AGENTS_FILE", DEFAULT_AGENTS_FILE))
    try:
        with open(agents_file, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Agent roster file not found: {agents_file}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as exc:
        print(f"Agent roster file {agents_file} is not valid JSON: {exc}", file=sys.stderr)
        sys.exit(1)

    known = data.get("known_agents", [])
    pending = data.get("pending_agents", [])
    if not known:
        print(f"Agent roster file {agents_file} has an empty or missing 'known_agents' list.",
              file=sys.stderr)
        sys.exit(1)
    return known, pending


KNOWN_AGENTS, PENDING_AGENTS = _load_agents()

DEFAULT_TOP_K = 5
DEFAULT_MIN_SCORE = 0.5
DEFAULT_DAYS = 7


def _worker_url() -> str:
    url = (
        os.environ.get("OPENCLAW_MEMORY_WORKER_URL", "").strip()
        or os.environ.get("MEMORY_WORKER_URL", "").strip()
    )
    if not url:
        print("OPENCLAW_MEMORY_WORKER_URL is not set.", file=sys.stderr)
        sys.exit(1)
    return url.rstrip("/")


def _token() -> str:
    return (
        os.environ.get("OPENCLAW_MEMORY_WORKER_TOKEN", "").strip()
        or os.environ.get("MEMORY_WORKER_TOKEN", "").strip()
    )


def _request(method: str, path: str, body: dict | None = None, timeout: float = 15.0) -> dict:
    url = f"{_worker_url()}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "openclaw-memory-cli/1.0",
    }
    token = _token()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return {"status": resp.status, "body": json.loads(raw) if raw else {}}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"error": raw}
        return {"status": exc.code, "body": parsed}
    except urllib.error.URLError as exc:
        print(f"Could not reach worker at {url}: {exc.reason}", file=sys.stderr)
        sys.exit(2)


def cmd_health(args: argparse.Namespace) -> int:
    result = _request("GET", "/health")
    if args.json:
        print(json.dumps(result["body"]))
    else:
        status = result["body"].get("status", "unknown")
        print(f"worker: {status} (HTTP {result['status']})")
    return 0 if result["status"] < 400 else 2


def cmd_stats(args: argparse.Namespace) -> int:
    result = _request("GET", "/stats")
    if args.json:
        print(json.dumps(result["body"]))
    else:
        b = result["body"]
        print(f"index: {b.get('index', '?')}  dims: {b.get('dimensions', '?')}  "
              f"model: {b.get('model', '?')}  status: {b.get('status', '?')}")
    return 0 if result["status"] < 400 else 2


def cmd_search(args: argparse.Namespace) -> int:
    body = {
        "query": args.query,
        "topK": args.top_k,
        "minScore": args.min_score,
    }
    if args.agent:
        body["agent"] = args.agent

    result = _request("POST", "/query", body)
    if result["status"] >= 400:
        print(f"Search failed (HTTP {result['status']}): {result['body']}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(result["body"]))
        return 0

    payload = result["body"]
    count = payload.get("count", 0)
    if count == 0:
        print("No relevant memories found.")
        return 0

    print(f"Found {count} relevant memories:")
    for i, match in enumerate(payload.get("matches", []), start=1):
        meta = match.get("metadata", {})
        score = match.get("score", 0.0)
        print(f"\n--- [{i}] score={score:.3f} agent={meta.get('agent')} "
              f"source={meta.get('source_file')}")
        print(meta.get("raw_text", ""))
    return 0


def _index_file(agent: str, file: str) -> tuple[bool, int, str]:
    result = _request("POST", "/index-file", {"agent": agent, "file": file})
    body = result["body"]
    if result["status"] >= 400 or body.get("failed", 0) > 0:
        detail = body.get("error", str(body))
        if body.get("run_id"):
            detail = f"run {body['run_id']}: {detail}"
        return False, body.get("succeeded", body.get("chunks", 0)), detail
    return True, body.get("succeeded", body.get("chunks", 0)), ""


def _index_one_agent(agent: str, days: int) -> dict:
    report = {"agent": agent, "files": [], "failed": False}

    ok, chunks, err = _index_file(agent, "MEMORY.md")
    report["files"].append({"file": "MEMORY.md", "ok": ok, "chunks": chunks, "error": err})
    report["failed"] = not ok

    today = datetime.date.today()
    for i in range(days):
        date_str = (today - datetime.timedelta(days=i)).isoformat()
        file = f"memory/{date_str}.md"
        ok, chunks, err = _index_file(agent, file)
        # Missing daily files are expected; retain other failures in the report.
        if not ok and "File not found" in err:
            continue
        report["files"].append({"file": file, "ok": ok, "chunks": chunks, "error": err})
        report["failed"] = report["failed"] or not ok

    return report


def cmd_index(args: argparse.Namespace) -> int:
    agent = args.agent
    if agent in PENDING_AGENTS:
        print(f"'{agent}' is a recognized name but has no memory-provider wiring yet "
              f"(no MEMORY.md path, no OPENCLAW_MEMORY_AGENT_ID configured). "
              f"Nothing to index.", file=sys.stderr)
        return 1
    if agent not in KNOWN_AGENTS:
        print(f"Unknown agent '{agent}'. Known agents: {', '.join(KNOWN_AGENTS)}", file=sys.stderr)
        return 1

    report = _index_one_agent(agent, args.days)
    if args.json:
        print(json.dumps(report))
    else:
        print(f"Indexing {agent}:")
        for f in report["files"]:
            marker = "ok" if f["ok"] else f"FAILED ({f['error']})"
            print(f"  {f['file']}: {f['chunks']} chunks  [{marker}]")
    return 2 if report["failed"] else 0


def cmd_index_all(args: argparse.Namespace) -> int:
    reports = [_index_one_agent(agent, args.days) for agent in KNOWN_AGENTS]
    if args.json:
        print(json.dumps(reports))
        return 2 if any(report["failed"] for report in reports) else 0

    for report in reports:
        print(f"Indexing {report['agent']}:")
        for f in report["files"]:
            marker = "ok" if f["ok"] else f"FAILED ({f['error']})"
            print(f"  {f['file']}: {f['chunks']} chunks  [{marker}]")
    print("Done.")
    return 2 if any(report["failed"] for report in reports) else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="OpenClaw memory-vectorize CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p_search = sub.add_parser("search", help="Semantic search over stored memories")
    p_search.add_argument("query")
    p_search.add_argument("--agent", default=None, help="Filter to one agent")
    p_search.add_argument("--top-k", type=int, default=DEFAULT_TOP_K)
    p_search.add_argument("--min-score", type=float, default=DEFAULT_MIN_SCORE)
    p_search.add_argument("--json", action="store_true")
    p_search.set_defaults(func=cmd_search)

    p_index = sub.add_parser("index", help="Reindex one agent's memory files")
    p_index.add_argument("agent", choices=KNOWN_AGENTS + PENDING_AGENTS)
    p_index.add_argument("--days", type=int, default=DEFAULT_DAYS,
                          help="How many days of dated memory files to check (default 7)")
    p_index.add_argument("--json", action="store_true")
    p_index.set_defaults(func=cmd_index)

    p_index_all = sub.add_parser("index-all", help="Reindex every known agent")
    p_index_all.add_argument("--days", type=int, default=DEFAULT_DAYS)
    p_index_all.add_argument("--json", action="store_true")
    p_index_all.set_defaults(func=cmd_index_all)

    p_health = sub.add_parser("health", help="Check worker health")
    p_health.add_argument("--json", action="store_true")
    p_health.set_defaults(func=cmd_health)

    p_stats = sub.add_parser("stats", help="Show index statistics")
    p_stats.add_argument("--json", action="store_true")
    p_stats.set_defaults(func=cmd_stats)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
