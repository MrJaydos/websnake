const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const GRID = 20;
const TICK_MS = 150;
const MIN_TICK = 60;

const rooms = new Map();

function createCode() {
  return crypto.randomBytes(2).toString("hex").toUpperCase();
}

function initSnake(playerNum) {
  const mid = Math.floor(GRID / 2);
  if (playerNum === 1) {
    return [
      { x: 4, y: mid },
      { x: 4, y: mid + 1 },
      { x: 4, y: mid + 2 },
    ];
  }
  return [
    { x: GRID - 5, y: mid },
    { x: GRID - 5, y: mid + 1 },
    { x: GRID - 5, y: mid + 2 },
  ];
}

function placeOneFood(room) {
  const occupied = new Set();
  for (const p of room.players) {
    for (const s of p.snake) occupied.add(`${s.x},${s.y}`);
  }
  for (const f of room.foods) occupied.add(`${f.x},${f.y}`);
  let pos;
  do {
    pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
  } while (occupied.has(`${pos.x},${pos.y}`));
  return pos;
}

function placeAllFood(room) {
  room.foods = [];
  room.foods.push(placeOneFood(room));
  room.foods.push(placeOneFood(room));
}

function tick(room) {
  const results = [];

  for (const p of room.players) {
    if (!p.alive) continue;
    p.dir = p.nextDir;
    const head = { x: p.snake[0].x + p.dir.x, y: p.snake[0].y + p.dir.y };

    if (room.mode === "easy") {
      head.x = (head.x + GRID) % GRID;
      head.y = (head.y + GRID) % GRID;
    } else if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      p.alive = false;
      continue;
    }

    p.pendingHead = head;
  }

  // check collisions after all heads computed
  for (const p of room.players) {
    if (!p.alive || !p.pendingHead) continue;
    const head = p.pendingHead;

    // self collision
    if (p.snake.some((s) => s.x === head.x && s.y === head.y)) {
      p.alive = false;
      continue;
    }

    // collision with other player's body
    for (const other of room.players) {
      if (other === p) continue;
      if (other.snake.some((s) => s.x === head.x && s.y === head.y)) {
        p.alive = false;
        break;
      }
    }
  }

  // head-on collision
  const alive = room.players.filter((p) => p.alive && p.pendingHead);
  if (alive.length === 2) {
    const [a, b] = alive;
    if (a.pendingHead.x === b.pendingHead.x && a.pendingHead.y === b.pendingHead.y) {
      a.alive = false;
      b.alive = false;
    }
  }

  // apply moves
  let ate = false;
  for (const p of room.players) {
    if (!p.alive || !p.pendingHead) continue;
    p.snake.unshift(p.pendingHead);

    const eatenIdx = room.foods.findIndex(
      (f) => f.x === p.pendingHead.x && f.y === p.pendingHead.y
    );
    if (eatenIdx !== -1) {
      p.score += 10;
      room.foods[eatenIdx] = placeOneFood(room);
      ate = true;
    } else {
      p.snake.pop();
    }
    p.pendingHead = null;
  }

  if (ate) {
    const maxLen = Math.max(...room.players.map((p) => p.snake.length));
    room.tickMs = Math.max(MIN_TICK, TICK_MS - maxLen * 3);
  }

  const aliveCount = room.players.filter((p) => p.alive).length;
  if (aliveCount <= 1) {
    room.state = "over";
    clearInterval(room.interval);
    room.interval = null;
  }

  broadcast(room);
}

function getState(room) {
  return {
    type: "state",
    players: room.players.map((p) => ({
      num: p.num,
      snake: p.snake,
      score: p.score,
      alive: p.alive,
      dir: p.dir,
    })),
    foods: room.foods,
    state: room.state,
    mode: room.mode,
    duration: room.startedAt ? Math.floor((Date.now() - room.startedAt) / 1000) : 0,
  };
}

function broadcast(room) {
  const msg = JSON.stringify(getState(room));
  for (const p of room.players) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(msg);
  }
}

function startGame(room) {
  room.state = "playing";
  for (let i = 0; i < room.players.length; i++) {
    const p = room.players[i];
    p.snake = initSnake(i + 1);
    p.dir = { x: 0, y: -1 };
    p.nextDir = { x: 0, y: -1 };
    p.score = 0;
    p.alive = true;
    p.pendingHead = null;
  }
  room.foods = [];
  placeAllFood(room);
  room.tickMs = TICK_MS;
  room.startedAt = Date.now();

  broadcast(room);

  room.interval = setInterval(() => tick(room), room.tickMs);
}

function handleDirection(player, dir) {
  if (dir.x + player.dir.x === 0 && dir.y + player.dir.y === 0) return;
  player.nextDir = dir;
}

function attach(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    let player = null;
    let room = null;

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === "create") {
        const code = createCode();
        const mode = msg.mode === "easy" ? "easy" : "hard";
        room = {
          code,
          mode,
          state: "waiting",
          players: [],
          foods: [],
          interval: null,
          tickMs: TICK_MS,
        };
        player = { num: 1, ws, snake: [], dir: { x: 0, y: -1 }, nextDir: { x: 0, y: -1 }, score: 0, alive: true, pendingHead: null };
        room.players.push(player);
        rooms.set(code, room);
        ws.send(JSON.stringify({ type: "created", code, playerNum: 1 }));
      }

      if (msg.type === "join") {
        const code = (msg.code || "").toUpperCase().trim();
        room = rooms.get(code);
        if (!room || room.state !== "waiting" || room.players.length >= 2) {
          ws.send(JSON.stringify({ type: "error", message: "Room not found or full" }));
          return;
        }
        player = { num: 2, ws, snake: [], dir: { x: 0, y: -1 }, nextDir: { x: 0, y: -1 }, score: 0, alive: true, pendingHead: null };
        room.players.push(player);
        ws.send(JSON.stringify({ type: "joined", code, playerNum: 2 }));
        startGame(room);
      }

      if (msg.type === "dir" && player && room && room.state === "playing") {
        const d = msg.dir;
        if (d && typeof d.x === "number" && typeof d.y === "number") {
          handleDirection(player, { x: d.x, y: d.y });
        }
      }

      if (msg.type === "rematch" && player && room && room.state === "over") {
        player.rematch = true;
        if (room.players.every((p) => p.rematch)) {
          room.players.forEach((p) => (p.rematch = false));
          startGame(room);
        } else {
          if (player.ws && player.ws.readyState === 1) {
            player.ws.send(JSON.stringify({ type: "rematch_wait" }));
          }
        }
      }
    });

    ws.on("close", () => {
      if (room) {
        if (room.interval) clearInterval(room.interval);
        room.state = "disconnected";
        for (const p of room.players) {
          if (p !== player && p.ws && p.ws.readyState === 1) {
            p.ws.send(JSON.stringify({ type: "opponent_left" }));
          }
        }
        rooms.delete(room.code);
      }
    });
  });
}

module.exports = { attach };
