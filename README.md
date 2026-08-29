# Bloxorz

A small playable Bloxorz game powered by the matrix levels in
`backend/levels.py`.

## Play

```bash
python3 backend/app.py
```

Then open <http://127.0.0.1:8000>.

Use the arrow keys or WASD to roll the block. You can also use the on-screen
controls or swipe across the board on a touch screen. Stand the block upright
on the green goal to finish a level.

The level menu automatically includes every complete `levelN` dictionary from
`backend/levels.py`, so new levels only need a `start`, `goal`, and `grid`.

## Project structure

```text
bloxorz/
├── backend/
│   ├── app.py          # Local server and levels API
│   ├── levels.py       # Matrix level definitions
│   └── solvers/        # Automatic path-finding algorithms
├── frontend/
│   ├── index.html      # Game page
│   ├── game.js         # Rules, controls, animation, and rendering
│   └── style.css       # Interface styles
├── docs/
│   └── codes.md        # Original level codes
└── README.md
```

Future solvers can be added inside `backend/solvers/` without mixing the
algorithm code with the browser interface or the level definitions.
