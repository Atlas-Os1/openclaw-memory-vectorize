import contextlib
import importlib.util
import io
import unittest
from argparse import Namespace
from pathlib import Path


SPEC = importlib.util.spec_from_file_location(
    "memory_cli", Path(__file__).with_name("memory_cli.py")
)
cli = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(cli)


class IndexFailurePropagationTests(unittest.TestCase):
    def test_partial_worker_run_is_failure(self):
        original = cli._request
        try:
            cli._request = lambda *args, **kwargs: {
                "status": 207,
                "body": {
                    "run_id": "a" * 32,
                    "total": 2,
                    "succeeded": 1,
                    "failed": 1,
                    "retryable": 1,
                },
            }
            result = cli._index_file("cleo", "MEMORY.md")
            self.assertEqual(result[0], False)
            self.assertEqual(result[1], 1)
            self.assertIn("run " + "a" * 32, result[2])
        finally:
            cli._request = original

    def test_index_command_returns_nonzero_and_prints_failure(self):
        original = cli._request
        try:
            calls = 0
            def request(*args, **kwargs):
                nonlocal calls
                calls += 1
                if calls == 1:
                    return {"status": 500, "body": {"error": "Vectorize unavailable"}}
                return {"status": 404, "body": {"error": "File not found"}}

            cli._request = request
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                result = cli.cmd_index(Namespace(agent="cleo", days=1, json=False))
            self.assertEqual(result, 2)
            self.assertIn("FAILED", output.getvalue())
            self.assertIn("Vectorize unavailable", output.getvalue())
        finally:
            cli._request = original


if __name__ == "__main__":
    unittest.main()
