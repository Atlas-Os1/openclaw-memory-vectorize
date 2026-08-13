from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import ModuleType
from typing import cast

REPO_ROOT = Path(__file__).resolve().parents[1]
CLI = REPO_ROOT / "scripts" / "memory_cli.py"
PROVIDER = REPO_ROOT / "__init__.py"
PLUGIN = REPO_ROOT / "plugin" / "index.ts"
WORKER = REPO_ROOT / "worker" / "src" / "index.ts"
TOKEN = "contract-test-token"


class ContractWorkerHandler(BaseHTTPRequestHandler):
    records: list[dict] = []
    fail_index_file = False
    malformed_json = False

    def log_message(self, format: str, *args: object) -> None:
        return

    def _record(self, body: dict | None = None) -> None:
        self.records.append(
            {
                "method": self.command,
                "path": self.path,
                "authorization": self.headers.get("Authorization"),
                "user_agent": self.headers.get("User-Agent"),
                "body": body,
            }
        )

    def _send_json(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _send_text(self, status: int, payload: str) -> None:
        raw = payload.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or "0")
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _authorized(self) -> bool:
        return self.headers.get("Authorization") == f"Bearer {TOKEN}"

    def do_GET(self) -> None:
        self._record()
        if self.path == "/health":
            self._send_json(200, {"status": "ok"})
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        body = self._read_body()
        self._record(body)
        if self.malformed_json:
            self._send_text(200, "not-json")
            return
        if not self._authorized():
            self._send_json(401, {"error": "Unauthorized"})
            return
        if self.path == "/query":
            self._send_json(
                200,
                {
                    "query": body.get("query"),
                    "count": 1,
                    "matches": [
                        {
                            "id": "dev:contract:1",
                            "score": 0.91,
                            "metadata": {
                                "agent": body.get("agent"),
                                "type": body.get("type", "context"),
                                "source_file": "contract-test",
                                "raw_text": "Scoped contract memory",
                            },
                        }
                    ],
                },
            )
            return
        if self.path == "/index":
            self._send_json(200, {"indexed": 1, "ids": [f"{body.get('agent')}:manual:1"]})
            return
        if self.path == "/capture":
            self._send_json(200, {"captured": True, "type": body.get("classification", "decision"), "id": "capture-1"})
            return
        if self.path == "/index-file":
            if self.fail_index_file:
                self._send_json(500, {"error": "simulated batch failure"})
            else:
                self._send_json(200, {"file": body.get("file"), "chunks": 1, "indexed": 1})
            return
        self._send_json(404, {"error": "not found"})


class ContractServer:
    def __init__(self, *, fail_index_file: bool = False, malformed_json: bool = False):
        self.fail_index_file = fail_index_file
        self.malformed_json = malformed_json
        self.httpd: ThreadingHTTPServer | None = None
        self.thread: threading.Thread | None = None

    def __enter__(self) -> "ContractServer":
        ContractWorkerHandler.records = []
        ContractWorkerHandler.fail_index_file = self.fail_index_file
        ContractWorkerHandler.malformed_json = self.malformed_json
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), ContractWorkerHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        assert self.httpd is not None
        self.httpd.shutdown()
        self.httpd.server_close()
        if self.thread:
            self.thread.join(timeout=2)

    @property
    def url(self) -> str:
        assert self.httpd is not None
        host, port = cast(tuple[str, int], self.httpd.server_address)
        return f"http://{host}:{port}"

    @property
    def records(self) -> list[dict]:
        return ContractWorkerHandler.records


def run_cli(args: list[str], server: ContractServer, extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update(
        {
            "OPENCLAW_MEMORY_WORKER_URL": server.url,
            "OPENCLAW_MEMORY_WORKER_TOKEN": TOKEN,
            "PYTHONUNBUFFERED": "1",
        }
    )
    if extra_env:
        env.update(extra_env)
    return subprocess.run(
        [sys.executable, str(CLI), *args],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=10,
    )


def load_provider_module() -> ModuleType:
    agent_module = ModuleType("agent")
    memory_provider_module = ModuleType("agent.memory_provider")

    class MemoryProvider:  # minimal Hermes stub for import-only contract tests
        pass

    setattr(memory_provider_module, "MemoryProvider", MemoryProvider)
    tools_module = ModuleType("tools")
    registry_module = ModuleType("tools.registry")
    setattr(registry_module, "tool_error", lambda message: json.dumps({"error": message}))
    sys.modules["agent"] = agent_module
    sys.modules["agent.memory_provider"] = memory_provider_module
    sys.modules["tools"] = tools_module
    sys.modules["tools.registry"] = registry_module

    spec = importlib.util.spec_from_file_location("openclaw_memory_provider_contract", PROVIDER)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AuthenticatedCrossClientMemoryContracts(unittest.TestCase):
    def test_cli_health_query_index_and_capture_send_bearer_auth_and_preserve_scope(self) -> None:
        with ContractServer() as server:
            health = run_cli(["health", "--json"], server)
            self.assertEqual(health.returncode, 0, health.stderr)

            search = run_cli(["search", "contract", "--agent", "dev", "--json"], server)
            self.assertEqual(search.returncode, 0, search.stderr)
            body = json.loads(search.stdout)
            self.assertEqual(body["matches"][0]["metadata"]["agent"], "dev")

            with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as agents_file:
                json.dump({"known_agents": ["dev"], "pending_agents": []}, agents_file)
                agents_path = agents_file.name
            try:
                index = run_cli(["index", "dev", "--days", "0", "--json"], server, {"MEMORY_CLI_AGENTS_FILE": agents_path})
            finally:
                os.unlink(agents_path)
            self.assertEqual(index.returncode, 0, index.stderr)

            protected = [r for r in server.records if r["method"] == "POST"]
            self.assertGreaterEqual(len(protected), 2)
            self.assertTrue(all(r["authorization"] == f"Bearer {TOKEN}" for r in protected))
            self.assertIn({"agent": "dev", "file": "MEMORY.md"}, [r["body"] for r in protected if r["path"] == "/index-file"])

    def test_cli_index_all_returns_nonzero_when_any_index_file_fails(self) -> None:
        with ContractServer(fail_index_file=True) as server:
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as agents_file:
                json.dump({"known_agents": ["dev"], "pending_agents": []}, agents_file)
                agents_path = agents_file.name
            try:
                result = run_cli(["index-all", "--days", "0", "--json"], server, {"MEMORY_CLI_AGENTS_FILE": agents_path})
            finally:
                os.unlink(agents_path)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("simulated batch failure", result.stdout)

    def test_cli_malformed_worker_json_is_request_failure_not_usage_success(self) -> None:
        with ContractServer(malformed_json=True) as server:
            result = run_cli(["search", "contract", "--agent", "dev", "--json"], server)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("invalid JSON", result.stderr)

    def test_hermes_provider_preserves_agent_scope_and_rejects_unknown_memory_type(self) -> None:
        module = load_provider_module()
        provider = module.OpenClawMemoryVectorizeProvider()
        with ContractServer() as server:
            os.environ["OPENCLAW_MEMORY_WORKER_URL"] = server.url
            os.environ["OPENCLAW_MEMORY_WORKER_TOKEN"] = TOKEN
            os.environ["OPENCLAW_MEMORY_AGENT_ID"] = "dev"
            provider.initialize("contract-session", user_id="default")

            search = provider.handle_tool_call("openclaw_memory_search", {"query": "contract", "agent": "lilbeaver"})
            self.assertEqual(json.loads(search)["matches"][0]["metadata"]["agent"], "lilbeaver")

            invalid = provider.handle_tool_call(
                "openclaw_memory_remember",
                {"content": "bad type must not downgrade", "memory_type": "definitely-not-valid", "agent": "dev"},
            )
            self.assertIn("Invalid memory_type", invalid)

            query_record = next(r for r in server.records if r["path"] == "/query")
            self.assertEqual(query_record["authorization"], f"Bearer {TOKEN}")
            self.assertEqual(query_record["body"]["agent"], "lilbeaver")
            self.assertFalse(
                any(r["path"] == "/index" and r["body"].get("type") == "context" for r in server.records),
                "invalid memory types must fail closed instead of silently substituting context",
            )

    def test_openclaw_plugin_and_worker_sources_keep_the_authenticated_contract_visible(self) -> None:
        plugin = PLUGIN.read_text(encoding="utf-8")
        worker = WORKER.read_text(encoding="utf-8")

        self.assertIn("headers.Authorization = `Bearer ${token}`", plugin)
        self.assertIn("body: JSON.stringify({ agent, text, type, source_file: sourceFile })", plugin)
        self.assertIn("body: JSON.stringify({", plugin)
        self.assertIn("classification", plugin)

        for route in ("path === '/query'", "path === '/index'", "path === '/capture'", "path === '/index-file'"):
            route_pos = worker.index(route)
            auth_pos = worker.rfind("requireAuth(request, env, corsHeaders)", 0, route_pos + 500)
            self.assertNotEqual(auth_pos, -1, f"{route} must stay behind requireAuth")
        self.assertIn("return jsonResponse({ error: 'Unauthorized' }, { status: 401 }", worker)
        self.assertIn("if (body.agent) filter.agent = { $eq: body.agent }", worker)


if __name__ == "__main__":
    unittest.main()
