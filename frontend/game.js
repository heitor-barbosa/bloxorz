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
const MOVE_DURATION = 170;
const UNDO_DURATION = 100;
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
let queuedDirection = null;
const directionFlashTimers = new Map();
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

function flashDirection(direction) {
  const button = document.querySelector(`[data-direction="${direction}"]`);
  if (!button) return;

  window.clearTimeout(directionFlashTimers.get(direction));
  button.classList.remove("direction-flash");
  void button.offsetWidth;
  button.classList.add("direction-flash");
  directionFlashTimers.set(direction, window.setTimeout(() => {
    button.classList.remove("direction-flash");
    directionFlashTimers.delete(direction);
  }, 170));
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
  queuedDirection = null;
  updateStats();
  displayMessage("Use arrow keys, WASD, or the controls below.");
  draw();
}

function chooseLevel(id) {
  level = levels.find((item) => item.id === id);
  levelSelect.value = level.id;
  resetLevel();
}

function move(direction, shouldFlash = true) {
  if (!level || won) return;
  if (shouldFlash) flashDirection(direction);
  if (locked) {
    queuedDirection = direction;
    return;
  }

  const previous = { ...state };
  const next = nextState(previous, direction);
  const supported = isSupported(next);

  moves += 1;
  state = next;
  locked = true;
  animation = {
    from: previous,
    to: next,
    direction,
    start: performance.now(),
    duration: MOVE_DURATION,
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
    direction: movementDirection(current, previous),
    start: performance.now(),
    duration: UNDO_DURATION,
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

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

function movementDirection(from, to) {
  const start = stateShape(from);
  const end = stateShape(to);
  const dx = end.x - start.x;
  const dz = end.z - start.z;

  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? "right" : "left";
  return dz > 0 ? "down" : "up";
}

function rotatePoint(point, pivot, axis, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const dz = point.z - pivot.z;

  if (axis === "z") {
    return {
      x: pivot.x + dx * cos - dy * sin,
      y: pivot.y + dx * sin + dy * cos,
      z: point.z,
    };
  }

  return {
    x: point.x,
    y: pivot.y + dy * cos - dz * sin,
    z: pivot.z + dy * sin + dz * cos,
  };
}

function boxVertices(shape) {
  const x0 = shape.x - shape.w / 2;
  const x1 = shape.x + shape.w / 2;
  const z0 = shape.z - shape.d / 2;
  const z1 = shape.z + shape.d / 2;

  return [
    { x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z0 },
    { x: x1, y: 0, z: z1 }, { x: x0, y: 0, z: z1 },
    { x: x0, y: shape.h, z: z0 }, { x: x1, y: shape.h, z: z0 },
    { x: x1, y: shape.h, z: z1 }, { x: x0, y: shape.h, z: z1 },
  ];
}

function rotatingBlock(progress) {
  const from = stateShape(animation.from);
  const to = stateShape(animation.to);
  const center = { x: from.x, y: from.h / 2, z: from.z };
  const targetCenter = { x: to.x, y: to.h / 2, z: to.z };
  const direction = animation.direction;
  const axis = direction === "left" || direction === "right" ? "z" : "x";
  const sign = direction === "left" || direction === "down" ? 1 : -1;
  const fullAngle = sign * Math.PI / 2;
  const pivot = { x: from.x, y: 0, z: from.z };

  if (direction === "left") pivot.x -= from.w / 2;
  if (direction === "right") pivot.x += from.w / 2;
  if (direction === "up") pivot.z -= from.d / 2;
  if (direction === "down") pivot.z += from.d / 2;

  // The visual block is slightly smaller than its logical grid footprint.
  // This small translation keeps the real rotation while ending exactly on
  // the next cells, avoiding a visible snap at the end.
  const endpoint = rotatePoint(center, pivot, axis, fullAngle);
  const correction = {
    x: targetCenter.x - endpoint.x,
    y: targetCenter.y - endpoint.y,
    z: targetCenter.z - endpoint.z,
  };
  const angle = fullAngle * progress;
  const fallingProgress = animation.falling ? Math.max(0, (progress - 0.58) / 0.42) : 0;

  const vertices = boxVertices(from).map((vertex) => {
    const rotated = rotatePoint(vertex, pivot, axis, angle);
    return {
      x: rotated.x + correction.x * progress,
      y: rotated.y + correction.y * progress - fallingProgress ** 2 * 3.2,
      z: rotated.z + correction.z * progress,
    };
  });

  return {
    vertices,
    alpha: animation.falling ? 1 - Math.max(0, (progress - 0.78) / 0.22) : 1,
  };
}

function animatedBlock(now) {
  if (!animation) return { shape: { ...stateShape(state), bottom: 0 } };

  const raw = Math.min(1, (now - animation.start) / animation.duration);
  const progress = easeOutCubic(raw);
  const geometry = rotatingBlock(progress);

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
      displayMessage(`${level.label} complete in ${moves} moves!`, "success");
    } else if (queuedDirection) {
      const direction = queuedDirection;
      queuedDirection = null;
      requestAnimationFrame(() => move(direction, false));
    }
  }

  return geometry;
}

function drawBlockMesh(vertices, alpha, palette) {
  const faces = [
    { indices: [0, 3, 2, 1], fill: palette.fill },
    { indices: [4, 5, 6, 7], fill: palette.fill },
    { indices: [0, 1, 5, 4], fill: palette.fill },
    { indices: [1, 2, 6, 5], fill: palette.fill },
    { indices: [2, 3, 7, 6], fill: palette.fill },
    { indices: [3, 0, 4, 7], fill: palette.fill },
  ];

  faces.forEach((face) => {
    face.points = face.indices.map((index) => {
      const vertex = vertices[index];
      return project(vertex.x, vertex.y, vertex.z);
    });
    face.area = face.points.reduce((total, point, index) => {
      const next = face.points[(index + 1) % face.points.length];
      return total + point.x * next.y - next.x * point.y;
    }, 0) / 2;
    face.depth = face.indices.reduce((total, index) => (
      total + vertices[index].x * BOARD_X_Y + vertices[index].z * BOARD_DEPTH_Y
    ), 0) / face.indices.length;
  });
  const visibleFaces = faces
    .filter((face) => face.area > 0.01)
    .sort((a, b) => a.depth - b.depth);

  ctx.save();
  ctx.globalAlpha = alpha;
  visibleFaces.forEach((face) => {
    polygon(face.points, face.fill, palette.stroke);
  });
  ctx.restore();
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
  const block = animatedBlock(now);
  const blockPalette = {
    fill: "#f2a312",
    top: "#f2a312",
    left: "#f2a312",
    right: "#f2a312",
    stroke: "#ffdf9a",
  };
  if (block.vertices) drawBlockMesh(block.vertices, block.alpha, blockPalette);
  else drawPrism(block.shape, blockPalette);
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
      .map((item) => `<option value="${item.id}">${item.label}</option>`)
      .join("");
    chooseLevel(levels[0].id);
    resizeCanvas();
  } catch (error) {
    displayMessage(`${error.message}. Start the game with: python3 backend/app.py`, "danger");
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
