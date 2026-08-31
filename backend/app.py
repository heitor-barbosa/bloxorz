"""Tiny local server for the Bloxorz browser game.

Run `python3 backend/app.py` and open http://127.0.0.1:8000.
The browser reads complete level dictionaries directly from backend/levels.py.
"""

from __future__ import annotations

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import levels


PROJECT_DIR = Path(__file__).resolve().parent.parent / "frontend"


def is_valid_position(position, grid) -> bool:
    """Check that a position is a playable cell inside the grid."""
    if not isinstance(position, (list, tuple)) or len(position) != 2:
        return False

    row, col = position
    if type(row) is not int or type(col) is not int:
        return False

    return (
        0 <= row < len(grid)
        and 0 <= col < len(grid[row])
        and grid[row][col] == 1
    )


def available_levels() -> list[dict]:
    """Return every valid level dictionary in definition order."""
    result = []

    for name, value in vars(levels).items():
        if not isinstance(value, dict):
            continue

        start = value.get("start")
        goal = value.get("goal")
        grid = value.get("grid")
        if (
            not isinstance(grid, (list, tuple))
            or not grid
            or not all(isinstance(row, (list, tuple)) and row for row in grid)
            or not is_valid_position(start, grid)
            or not is_valid_position(goal, grid)
        ):
            continue

        result.append(
            {
                "id": name,
                "label": name,
                "start": list(start),
                "goal": list(goal),
                "grid": grid,
            }
        )

    return result


class GameHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_DIR), **kwargs)

    def do_GET(self):  # noqa: N802 - required by SimpleHTTPRequestHandler
        if self.path.rstrip("/") == "/api/levels":
            payload = json.dumps(available_levels()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            return

        super().do_GET()

    def log_message(self, format, *args):
        # Keep the terminal quiet except for actual errors.
        if len(args) > 1 and str(args[1]).startswith(("4", "5")):
            super().log_message(format, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the local Bloxorz game")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    address = ("127.0.0.1", args.port)
    print(f"Bloxorz is ready at http://{address[0]}:{address[1]}")
    print("Press Ctrl+C to stop.")

    try:
        ThreadingHTTPServer(address, GameHandler).serve_forever()
    except KeyboardInterrupt:
        print("\nGame stopped.")


if __name__ == "__main__":
    main()
