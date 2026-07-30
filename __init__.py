"""Hermes memory provider for the OpenClaw memory worker.

This file makes the repo discoverable by Hermes as a memory provider when it is
installed under ``$HERMES_HOME/plugins/openclaw-memory-vectorize``.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from typing import Any, Dict, List, Optional

from agent.memory_provider import MemoryProvider
from tools.registry import tool_error

logger = logging.getLogger(__name__)

MEMORY_TYPES = {
    "decision",
    "correction",
    "learning",
    "preference",
    "context",
    "user_profile",
}

SEARCH_SCHEMA = {
    "name": "openclaw_memory_search",
    "description": "Search long-term memory in the OpenClaw Cloudflare Vectorize worker.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "What to search for."},
            "agent": {"type": "string", "description": "Optional agent scope, such as cleo or lilbeaver."},
            "top_k": {"type": "integer", "description": "Max results. Default 5, max 20."},
            "min_score": {"type": "number", "description": "Minimum similarity score. Default from config."},
        },
        "required": ["query"],
    },
}

REMEMBER_SCHEMA = {
    "name": "openclaw_memory_remember",
    "description": "Store an explicit memory in the OpenClaw Cloudflare Vectorize worker.",
    "parameters": {
        "type": "object",
        "properties": {
            "content": {"type": "string", "description": "The memory text to store."},
            "memory_type": {
                "type": "string",
                "enum": sorted(MEMORY_TYPES),
                "description": "Memory category. Default context.",
            },
            "agent": {"type": "string", "description": "Optional agent scope, such as cleo or lilbeaver."},
            "source_file": {"type": "string", "description": "Optional source label. Default hermes-tool."},
        },
        "required": ["content"],
    },
}


def _clean_base_url(url: str) -> str:
    return url.strip().rstrip("/")


def _json_result(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False)


class _OpenClawWorkerClient:
    def __init__(self, base_url: str, token: str = ""):
        self.base_url = _clean_base_url(base_url)
        self.token = token.strip()

    def _headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            # Cloudflare bot heuristics can reject Python's default requests UA (1010).
            # Use an explicit integration UA so Hermes profile memory calls match curl/browser-like clients.
            "User-Agent": "Hermes-OpenClaw-MemoryProvider/1.0",
        }
        if self.token:
            # Strip a leading "Bearer " prefix only (anchored, case-insensitive),
            # matching the TS plugin (plugin/index.ts). A bare str.replace would
            # remove every occurrence anywhere in the token, corrupting tokens
            # that legitimately contain the substring.
            bare_token = re.sub(r"^Bearer\s+", "", self.token, flags=re.IGNORECASE).strip()
            headers["Authorization"] = f"Bearer {bare_token}"
        return headers

    def post(self, path: str, body: Dict[str, Any], timeout: float = 8.0) -> Any:
        import requests

        response = requests.post(
            f"{self.base_url}{path}",
            json=body,
            headers=self._headers(),
            timeout=timeout,
        )
        try:
            payload = response.json()
        except Exception:
            payload = response.text
        if not response.ok:
            raise RuntimeError(f"OpenClaw worker {path} failed ({response.status_code}): {payload}")
        return payload


class OpenClawMemoryVectorizeProvider(MemoryProvider):
    """Hermes MemoryProvider backed by openclaw-memory-worker."""

    def __init__(self):
        self._client: Optional[_OpenClawWorkerClient] = None
        self._worker_url = ""
        self._token = ""
        self._agent_id = "hermes"
        self._user_id = "default"
        self._session_id = ""
        self._min_score = 0.5
        self._recall_limit = 5
        self._prefetch_result = ""
        self._prefetch_lock = threading.Lock()
        self._prefetch_thread: Optional[threading.Thread] = None
        self._sync_thread: Optional[threading.Thread] = None

    @property
    def name(self) -> str:
        return "openclaw-memory-vectorize"

    def is_available(self) -> bool:
        return bool(os.environ.get("OPENCLAW_MEMORY_WORKER_URL", "").strip())

    def get_config_schema(self) -> List[Dict[str, Any]]:
        return [
            {
                "key": "worker_url",
                "description": "openclaw-memory-worker URL",
                "required": True,
                "env_var": "OPENCLAW_MEMORY_WORKER_URL",
            },
            {
                "key": "worker_token",
                "description": "Optional bearer token for the memory worker",
                "secret": True,
                "required": False,
                "env_var": "OPENCLAW_MEMORY_WORKER_TOKEN",
            },
            {
                "key": "agent_id",
                "description": "Agent scope used in Vectorize metadata",
                "default": "hermes",
                "env_var": "OPENCLAW_MEMORY_AGENT_ID",
            },
            {
                "key": "recall_limit",
                "description": "Default number of memories to recall",
                "default": "5",
                "env_var": "OPENCLAW_MEMORY_RECALL_LIMIT",
            },
            {
                "key": "min_score",
                "description": "Default minimum similarity score",
                "default": "0.5",
                "env_var": "OPENCLAW_MEMORY_MIN_SCORE",
            },
        ]

    def initialize(self, session_id: str, **kwargs) -> None:
        self._worker_url = _clean_base_url(os.environ.get("OPENCLAW_MEMORY_WORKER_URL", ""))
        self._token = os.environ.get("OPENCLAW_MEMORY_WORKER_TOKEN", "")
        self._agent_id = (
            os.environ.get("OPENCLAW_MEMORY_AGENT_ID")
            or os.environ.get("HERMES_AGENT_ID")
            or kwargs.get("agent_identity")
            or kwargs.get("agent_id")
            or "hermes"
        )
        self._user_id = kwargs.get("user_id") or "default"
        self._session_id = session_id
        self._recall_limit = self._int_env("OPENCLAW_MEMORY_RECALL_LIMIT", 5, minimum=1, maximum=20)
        self._min_score = self._float_env("OPENCLAW_MEMORY_MIN_SCORE", 0.5, minimum=0.0, maximum=1.0)
        if self._worker_url:
            self._client = _OpenClawWorkerClient(self._worker_url, self._token)

    @staticmethod
    def _int_env(name: str, default: int, *, minimum: int, maximum: int) -> int:
        try:
            value = int(os.environ.get(name, str(default)))
        except Exception:
            return default
        return max(minimum, min(maximum, value))

    @staticmethod
    def _float_env(name: str, default: float, *, minimum: float, maximum: float) -> float:
        try:
            value = float(os.environ.get(name, str(default)))
        except Exception:
            return default
        return max(minimum, min(maximum, value))

    def system_prompt_block(self) -> str:
        if not self._client:
            return ""
        return (
            "# OpenClaw Memory\n"
            f"Active. Agent scope: {self._agent_id}. User: {self._user_id}.\n"
            "Use openclaw_memory_search to recall context and "
            "openclaw_memory_remember to store durable facts, decisions, and preferences."
        )

    def queue_prefetch(self, query: str, *, session_id: str = "") -> None:
        if not self._client or not query:
            return
        if self._prefetch_thread and self._prefetch_thread.is_alive():
            self._prefetch_thread.join(timeout=2.0)

        def _run() -> None:
            try:
                result = self._search(query, self._agent_id, self._recall_limit, self._min_score)
                lines = self._format_matches(result)
                with self._prefetch_lock:
                    self._prefetch_result = "\n".join(lines)
            except Exception as exc:
                logger.debug("OpenClaw memory prefetch failed: %s", exc)

        self._prefetch_thread = threading.Thread(target=_run, daemon=True, name="openclaw-memory-prefetch")
        self._prefetch_thread.start()

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        if self._prefetch_thread and self._prefetch_thread.is_alive():
            self._prefetch_thread.join(timeout=3.0)
        with self._prefetch_lock:
            result = self._prefetch_result
            self._prefetch_result = ""
        if not result:
            return ""
        return f"## OpenClaw Memory\n{result}"

    def sync_turn(
        self,
        user_content: str,
        assistant_content: str,
        *,
        session_id: str = "",
        messages: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        if not self._client or not (user_content or assistant_content):
            return
        if self._sync_thread and self._sync_thread.is_alive():
            self._sync_thread.join(timeout=5.0)

        content = self._turn_content(user_content, assistant_content)
        active_session = session_id or self._session_id

        def _sync() -> None:
            try:
                self._capture(content, source_file=f"hermes-turn:{active_session}")
            except Exception as exc:
                logger.warning("OpenClaw memory sync failed: %s", exc)

        self._sync_thread = threading.Thread(target=_sync, daemon=True, name="openclaw-memory-sync")
        self._sync_thread.start()

    @staticmethod
    def _turn_content(user_content: str, assistant_content: str) -> str:
        parts = []
        if user_content:
            parts.append(f"User: {user_content}")
        if assistant_content:
            parts.append(f"Assistant: {assistant_content}")
        return "\n\n".join(parts).strip()

    def _capture(
        self,
        content: str,
        *,
        source_file: str,
        memory_type: str = "context",
        agent: Optional[str] = None,
    ) -> Any:
        if not self._client:
            raise RuntimeError("OpenClaw memory client is not initialized")
        body = {
            "agent": agent or self._agent_id,
            "turn_type": "assistant",
            "content": content,
            "classification": memory_type,
        }
        result = self._client.post("/capture", body, timeout=8.0)
        if isinstance(result, dict) and result.get("captured") is False:
            return self._index(content, memory_type=memory_type, source_file=source_file, agent=agent)
        return result

    def _index(
        self,
        content: str,
        *,
        memory_type: str = "context",
        source_file: str = "hermes",
        agent: Optional[str] = None,
    ) -> Any:
        if not self._client:
            raise RuntimeError("OpenClaw memory client is not initialized")
        safe_type = memory_type if memory_type in MEMORY_TYPES else "context"
        return self._client.post("/index", {
            "agent": agent or self._agent_id,
            "text": content,
            "type": safe_type,
            "source_file": source_file,
        }, timeout=8.0)

    def _search(self, query: str, agent: str, top_k: int, min_score: float) -> Any:
        if not self._client:
            raise RuntimeError("OpenClaw memory client is not initialized")
        return self._client.post("/query", {
            "query": query,
            "agent": agent,
            "topK": max(1, min(20, int(top_k))),
            "minScore": max(0.0, min(1.0, float(min_score))),
        }, timeout=8.0)

    @staticmethod
    def _format_matches(result: Any) -> List[str]:
        if not isinstance(result, dict):
            return []
        lines = []
        for match in result.get("matches") or []:
            metadata = match.get("metadata") or {}
            text = str(metadata.get("raw_text") or "").strip()
            if not text:
                continue
            score = match.get("score", 0)
            source = metadata.get("source_file") or "memory"
            lines.append(f"- ({score:.2f}, {source}) {text}")
        return lines

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        return [SEARCH_SCHEMA, REMEMBER_SCHEMA]

    def handle_tool_call(self, tool_name: str, args: dict, **kwargs) -> str:
        if not self._client:
            return tool_error("OpenClaw memory worker is not configured")

        if tool_name == "openclaw_memory_search":
            query = args.get("query", "")
            if not query:
                return tool_error("Missing required parameter: query")
            try:
                result = self._search(
                    query,
                    args.get("agent") or self._agent_id,
                    int(args.get("top_k") or self._recall_limit),
                    float(args.get("min_score") or self._min_score),
                )
                return _json_result(result)
            except Exception as exc:
                return tool_error(f"OpenClaw memory search failed: {exc}")

        if tool_name == "openclaw_memory_remember":
            content = args.get("content", "")
            if not content:
                return tool_error("Missing required parameter: content")
            memory_type = args.get("memory_type") or "context"
            source_file = args.get("source_file") or "hermes-tool"
            # Pass the per-call agent override through as a parameter instead of
            # mutating self._agent_id: background daemon threads (prefetch/sync)
            # read self._agent_id concurrently and would index under the wrong
            # agent during the mutation window.
            try:
                return _json_result(self._index(
                    content,
                    memory_type=memory_type,
                    source_file=source_file,
                    agent=args.get("agent"),
                ))
            except Exception as exc:
                return tool_error(f"OpenClaw memory write failed: {exc}")

        return tool_error(f"Unknown tool: {tool_name}")

    def on_memory_write(
        self,
        action: str,
        target: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        if action not in {"add", "replace"} or not content or not self._client:
            return
        memory_type = "preference" if target == "user" else "context"
        source_file = "hermes-memory-tool"
        if metadata and metadata.get("tool_name"):
            source_file = str(metadata["tool_name"])
        try:
            self._index(content, memory_type=memory_type, source_file=source_file)
        except Exception as exc:
            logger.debug("OpenClaw memory mirror failed: %s", exc)

    def on_session_switch(
        self,
        new_session_id: str,
        *,
        parent_session_id: str = "",
        reset: bool = False,
        rewound: bool = False,
        **kwargs,
    ) -> None:
        self._session_id = new_session_id
        if reset or rewound:
            with self._prefetch_lock:
                self._prefetch_result = ""

    def shutdown(self) -> None:
        for thread in (self._prefetch_thread, self._sync_thread):
            if thread and thread.is_alive():
                thread.join(timeout=5.0)


def register(ctx) -> None:
    """Register OpenClaw Vectorize as a Hermes memory provider."""
    ctx.register_memory_provider(OpenClawMemoryVectorizeProvider())
