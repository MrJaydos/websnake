(() => {
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("current-score");
  const finalScoreEl = document.getElementById("final-score");
  const startScreen = document.getElementById("start-screen");
  const gameoverScreen = document.getElementById("gameover-screen");
  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("start-btn");
  const replayBtn = document.getElementById("replay-btn");
  const scoreForm = document.getElementById("score-form");
  const nameInput = document.getElementById("player-name");
  const leaderboardBody = document.getElementById("leaderboard-body");

  const GRID = 20;
  const CELL = canvas.width / GRID;
  const BASE_INTERVAL = 150;
  const MIN_INTERVAL = 60;

  let snake, dir, nextDir, food, score, gameLoop, running, mode;
  const modeBtns = document.querySelectorAll(".mode-btn");
  const modeDesc = document.getElementById("mode-desc");
  const finalMode = document.getElementById("final-mode");

  mode = "easy";

  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeBtns.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      mode = btn.dataset.mode;
      modeDesc.textContent = mode === "easy" ? "Walls wrap around" : "Walls kill you";
    });
  });

  function reset() {
    const mid = Math.floor(GRID / 2);
    snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    scoreEl.textContent = "0";
    placeFood();
  }

  function placeFood() {
    const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
    let pos;
    do {
      pos = {
        x: Math.floor(Math.random() * GRID),
        y: Math.floor(Math.random() * GRID),
      };
    } while (occupied.has(`${pos.x},${pos.y}`));
    food = pos;
  }

  function draw() {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grid lines
    ctx.strokeStyle = "#1f1f3a";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(canvas.width, i * CELL);
      ctx.stroke();
    }

    // food
    ctx.fillStyle = "#ff4444";
    ctx.shadowColor = "#ff4444";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(
      food.x * CELL + CELL / 2,
      food.y * CELL + CELL / 2,
      CELL / 2 - 2,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.shadowBlur = 0;

    // snake
    snake.forEach((seg, i) => {
      const brightness = 1 - (i / snake.length) * 0.4;
      ctx.fillStyle = `rgba(0, 255, 65, ${brightness})`;
      ctx.fillRect(
        seg.x * CELL + 1,
        seg.y * CELL + 1,
        CELL - 2,
        CELL - 2
      );
    });

    // head highlight
    ctx.fillStyle = "#66ff88";
    ctx.fillRect(
      snake[0].x * CELL + 3,
      snake[0].y * CELL + 3,
      CELL - 6,
      CELL - 6
    );
  }

  function tick() {
    dir = nextDir;
    const head = {
      x: snake[0].x + dir.x,
      y: snake[0].y + dir.y,
    };

    if (mode === "easy") {
      head.x = (head.x + GRID) % GRID;
      head.y = (head.y + GRID) % GRID;
    } else if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      return gameOver();
    }

    if (snake.some((s) => s.x === head.x && s.y === head.y)) {
      return gameOver();
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      placeFood();
      updateSpeed();
    } else {
      snake.pop();
    }

    draw();
  }

  function updateSpeed() {
    clearInterval(gameLoop);
    const interval = Math.max(MIN_INTERVAL, BASE_INTERVAL - snake.length * 3);
    gameLoop = setInterval(tick, interval);
  }

  function gameOver() {
    running = false;
    clearInterval(gameLoop);
    finalScoreEl.textContent = score;
    finalMode.textContent = mode === "easy" ? "Easy" : "Hard";
    gameoverScreen.hidden = false;
    overlay.style.display = "flex";
    scoreForm.hidden = false;
    replayBtn.hidden = true;
    nameInput.value = localStorage.getItem("snakeName") || "";
    nameInput.focus();
  }

  function startGame() {
    reset();
    overlay.style.display = "none";
    startScreen.hidden = true;
    gameoverScreen.hidden = true;
    running = true;
    draw();
    gameLoop = setInterval(tick, BASE_INTERVAL);
  }

  // controls
  const KEY_MAP = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    a: { x: -1, y: 0 },
    d: { x: 1, y: 0 },
  };

  document.addEventListener("keydown", (e) => {
    const newDir = KEY_MAP[e.key];
    if (!newDir || !running) return;
    if (newDir.x + dir.x === 0 && newDir.y + dir.y === 0) return;
    nextDir = newDir;
    e.preventDefault();
  });

  // touch controls — prevent scrolling while playing
  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    if (running) e.preventDefault();
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    if (!touchStart || !running) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - touchStart.x;
    const dy = e.touches[0].clientY - touchStart.y;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;

    let newDir;
    if (Math.abs(dx) > Math.abs(dy)) {
      newDir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    } else {
      newDir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
    }
    if (newDir.x + dir.x !== 0 || newDir.y + dir.y !== 0) {
      nextDir = newDir;
    }
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: false });

  // buttons
  startBtn.addEventListener("click", startGame);
  replayBtn.addEventListener("click", startGame);

  // score submission
  scoreForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    localStorage.setItem("snakeName", name);

    try {
      await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, score, mode }),
      });
    } catch {
      // offline - ignore
    }

    scoreForm.hidden = true;
    replayBtn.hidden = false;
    replayBtn.focus();
    loadLeaderboard();
  });

  // leaderboard
  async function loadLeaderboard() {
    try {
      const res = await fetch("/api/scores");
      const data = await res.json();
      leaderboardBody.innerHTML = data
        .map(
          (row, i) =>
            `<tr><td>${i + 1}</td><td>${escapeHtml(row.name)}</td><td>${row.score}</td><td>${row.mode === "easy" ? "Easy" : "Hard"}</td></tr>`
        )
        .join("");
    } catch {
      leaderboardBody.innerHTML =
        '<tr><td colspan="4">Could not load scores</td></tr>';
    }
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  loadLeaderboard();
})();
