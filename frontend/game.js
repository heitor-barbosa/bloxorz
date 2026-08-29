const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const levelSelect = document.querySelector("#level-select");
const movesLabel = document.querySelector("#moves");
const positionLabel = document.querySelector("#position");
const message = document.querySelector("#message");

const BOARD_X = 52;
const BOARD_DEPTH_X = -26;
const BOARD_X_Y = 4;
const BOARD_DEPTH_Y = 28;
const ISO_Y = 42;
const TILE_HEIGHT = 0.16;
const DIRECTIONS = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

let levels = [];
let level = null;
let state = null;
let history = [];
let moves = 0;
let won = false;
let locked = false;
let animation = null;
let viewport = { width: 0, height: 0, dpr: 1 };

function occupiedCells(position) {
  const { row, col, orientation } = position;
  if (orientation === "standing") return [[row, col]];
  if (orientation === "x") return [[row, col], [row, col + 1]];
  return [[row, col], [row + 1, col]];
}

function nextState(current, direction) {
  const { row, col, orientation } = current;

  if (orientation === "standing") {
    if (direction === "left") return { row, col: col - 2, orientation: "x" };
    if (direction === "right") return { row, col: col + 1, orientation: "x" };
    if (direction === "up") return { row: row - 2, col, orientation: "z" };
    return { row: row + 1, col, orientation: "z" };
  }

  if (orientation === "x") {
    if (direction === "left") return { row, col: col - 1, orientation: "standing" };
    if (direction === "right") return { row, col: col + 2, orientation: "standing" };
    if (direction === "up") return { row: row - 1, col, orientation: "x" };
    return { row: row + 1, col, orientation: "x" };
  }

  if (direction === "left") return { row, col: col - 1, orientation: "z" };
  if (direction === "right") return { row, col: col + 1, orientation: "z" };
  if (direction === "up") return { row: row - 1, col, orientation: "standing" };
  return { row: row + 2, col, orientation: "standing" };
}

function isSupported(position) {
  return occupiedCells(position).every(([row, col]) => (
    row >= 0 &&
    row < level.grid.length &&
    col >= 0 &&
    col < level.grid[row].length &&
    level.grid[row][col] === 1
  ));
}

function isGoal(position) {
  return position.orientation === "standing" &&
    position.row === level.goal[0] &&
    position.col === level.goal[1];
}

function displayMessage(text, kind = "") {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
}

function updateStats() {
  movesLabel.textContent = moves;
  positionLabel.textContent = state.orientation === "standing"
    ? "Standing"
    : state.orientation === "x" ? "Lying east–west" : "Lying north–south";
}

function resetLevel() {
  if (!level) return;
  state = {
    row: level.start[0],
    col: level.start[1],
    orientation: "standing",
  };
  history = [];
  moves = 0;
  won = false;
  locked = false;
  animation = null;
  updateStats();
  displayMessage("Use arrow keys, WASD, or the controls below.");
  draw();
}

function chooseLevel(number) {
  level = levels.find((item) => item.number === Number(number));
  levelSelect.value = String(level.number);
  resetLevel();
}

function move(direction) {
  if (!level || locked || won) return;

  const previous = { ...state };
  const next = nextState(previous, direction);
  const supported = isSupported(next);

  moves += 1;
  state = next;
  locked = true;
  animation = {
    from: previous,
    to: next,
    start: performance.now(),
    duration: 190,
    falling: !supported,
  };
  updateStats();
  displayMessage(supported ? "Keep rolling…" : "The block fell!", supported ? "" : "danger");

  if (supported) history.push(previous);
  requestAnimationFrame(draw);
}

function undo() {
  if (locked || !history.length) return;
  const previous = history.pop();
  const current = { ...state };
  state = previous;
  moves = Math.max(0, moves - 1);
  won = false;
  locked = true;
  animation = {
    from: current,
    to: previous,
    start: performance.now(),
    duration: 150,
    falling: false,
  };
  updateStats();
  displayMessage("Move undone.");
  requestAnimationFrame(draw);
}

function stateShape(position) {
  if (position.orientation === "standing") {
    return { x: position.col + 0.5, z: position.row + 0.5, w: 0.72, d: 0.72, h: 1.72 };
  }
  if (position.orientation === "x") {
    return { x: position.col + 1, z: position.row + 0.5, w: 1.72, d: 0.72, h: 0.72 };
  }
  return { x: position.col + 0.5, z: position.row + 1, w: 0.72, d: 1.72, h: 0.72 };
}

function project(x, y, z) {
  // Oblique camera matching the reference: columns run almost horizontally
  // from left to right, while rows recede down and to the left.
  return {
    x: x * BOARD_X + z * BOARD_DEPTH_X,
    y: x * BOARD_X_Y + z * BOARD_DEPTH_Y - y * ISO_Y,
  };
}

function polygon(points, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawPrism({ x, z, w, d, h, bottom = 0, alpha = 1 }, palette) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  const y0 = bottom;
  const y1 = bottom + h;

  const top = [
    project(x0, y1, z0), project(x1, y1, z0),
    project(x1, y1, z1), project(x0, y1, z1),
  ];
  const right = [
    project(x1, y1, z0), project(x1, y0, z0),
    project(x1, y0, z1), project(x1, y1, z1),
  ];
  const left = [
    project(x0, y1, z1), project(x1, y1, z1),
    project(x1, y0, z1), project(x0, y0, z1),
  ];

  ctx.save();
  ctx.globalAlpha = alpha;
  polygon(right, palette.right, palette.stroke);
  polygon(left, palette.left, palette.stroke);
  polygon(top, palette.top, palette.stroke);
  ctx.restore();
}

function drawTile(row, col) {
  const isTarget = row === level.goal[0] && col === level.goal[1];
  drawPrism(
    { x: col + 0.5, z: row + 0.5, w: 0.92, d: 0.92, h: TILE_HEIGHT, bottom: -TILE_HEIGHT },
    isTarget
      ? { top: "#1c6659", left: "#12463e", right: "#0d3833", stroke: "#40d8b2" }
      : { top: "#40505e", left: "#293743", right: "#202c36", stroke: "#5b6a76" },
  );

  if (isTarget) {
    const inset = 0.25;
    polygon([
      project(col + inset, 0.012, row + inset),
      project(col + 1 - inset, 0.012, row + inset),
      project(col + 1 - inset, 0.012, row + 1 - inset),
      project(col + inset, 0.012, row + 1 - inset),
    ], "#071a19", "#69f0ce", 1.5);
  }
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function animatedBlock(now) {
  if (!animation) return { ...stateShape(state), bottom: 0 };

  const raw = Math.min(1, (now - animation.start) / animation.duration);
  const progress = smoothStep(raw);
  const from = stateShape(animation.from);
  const to = stateShape(animation.to);
  const falling = animation.falling;

  const shape = {
    x: lerp(from.x, to.x, progress),
    z: lerp(from.z, to.z, progress),
    w: lerp(from.w, to.w, progress),
    d: lerp(from.d, to.d, progress),
    h: lerp(from.h, to.h, progress),
    bottom: falling ? -Math.max(0, (progress - 0.45) * 3.5) : Math.sin(progress * Math.PI) * 0.09,
    alpha: falling ? 1 - Math.max(0, (progress - 0.7) / 0.3) : 1,
  };

  if (raw < 1) {
    requestAnimationFrame(draw);
  } else {
    const didFall = animation.falling;
    animation = null;
    locked = false;
    if (didFall) {
      locked = true;
      window.setTimeout(resetLevel, 350);
    } else if (isGoal(state)) {
      won = true;
      displayMessage(`Level ${level.number} complete in ${moves} moves!`, "success");
    }
  }

  return shape;
}

function boardBounds() {
  const rows = level.grid.length;
  const cols = Math.max(...level.grid.map((row) => row.length));
  const corners = [
    project(0, 2.1, 0), project(cols, 2.1, 0),
    project(cols, -0.2, rows), project(0, -0.2, rows),
  ];
  return {
    minX: Math.min(...corners.map((point) => point.x)),
    maxX: Math.max(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxY: Math.max(...corners.map((point) => point.y)),
  };
}

function draw(now = performance.now()) {
  if (!level) return;

  const { width, height, dpr } = viewport;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const bounds = boardBounds();
  const boardWidth = bounds.maxX - bounds.minX;
  const boardHeight = bounds.maxY - bounds.minY;
  const scale = Math.min(
    1.25,
    Math.max(0.34, (width - 42) / boardWidth),
    Math.max(0.34, (height - 48) / boardHeight),
  );
  const originX = width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
  const originY = height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale + 12;

  ctx.save();
  ctx.translate(originX, originY);
  ctx.scale(scale, scale);

  const tiles = [];
  level.grid.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell === 1) tiles.push([rowIndex, colIndex]);
    });
  });
  // Back-to-front order for the oblique camera depth.
  tiles.sort((a, b) =>
    (a[0] * BOARD_DEPTH_Y + a[1] * BOARD_X_Y) -
    (b[0] * BOARD_DEPTH_Y + b[1] * BOARD_X_Y)
  );
  tiles.forEach(([row, col]) => drawTile(row, col));

  ctx.save();
  ctx.shadowColor = "#f6a92855";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;
  drawPrism(animatedBlock(now), {
    top: "#ffd376",
    left: "#e9951e",
    right: "#bd6812",
    stroke: "#ffdf9a",
  });
  ctx.restore();
  ctx.restore();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewport = { width: rect.width, height: rect.height, dpr };
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  draw();
}

async function loadLevels() {
  try {
    const response = await fetch("/api/levels");
    if (!response.ok) throw new Error("Could not load levels");
    levels = await response.json();
    if (!levels.length) throw new Error("No complete levels found");

    levelSelect.innerHTML = levels
      .map((item) => `<option value="${item.number}">Level ${item.number}</option>`)
      .join("");
    chooseLevel(levels[0].number);
    resizeCanvas();
  } catch (error) {
    displayMessage(`${error.message}. Start the game with: python3 app.py`, "danger");
  }
}

window.addEventListener("keydown", (event) => {
  const direction = DIRECTIONS[event.key];
  if (direction) {
    event.preventDefault();
    move(direction);
  } else if (event.key === "r" || event.key === "R") {
    resetLevel();
  } else if (event.key === "z" || event.key === "Z") {
    undo();
  }
});

document.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("click", () => move(button.dataset.direction));
});
document.querySelector("#restart").addEventListener("click", resetLevel);
document.querySelector("#undo").addEventListener("click", undo);
levelSelect.addEventListener("change", () => chooseLevel(levelSelect.value));
window.addEventListener("resize", resizeCanvas);

let swipeStart = null;
canvas.addEventListener("pointerdown", (event) => {
  swipeStart = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointerup", (event) => {
  if (!swipeStart) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
  else move(dy > 0 ? "down" : "up");
});

loadLevels();
