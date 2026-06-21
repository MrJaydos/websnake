(() => {
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const gameArea = document.getElementById("game-area");
  const overlay = document.getElementById("overlay");
  const lobbyScreen = document.getElementById("lobby-screen");
  const waitingScreen = document.getElementById("waiting-screen");
  const gameoverScreen = document.getElementById("gameover-screen");
  const disconnectedScreen = document.getElementById("disconnected-screen");
  const roomCodeEl = document.getElementById("room-code");
  const createBtn = document.getElementById("create-btn");
  const joinBtn = document.getElementById("join-btn");
  const joinCodeInput = document.getElementById("join-code");
  const rematchBtn = document.getElementById("rematch-btn");
  const rematchStatus = document.getElementById("rematch-status");
  const backBtn = document.getElementById("back-btn");
  const dcBackBtn = document.getElementById("dc-back-btn");
  const resultText = document.getElementById("result-text");
  const finalP1 = document.getElementById("final-p1");
  const finalP2 = document.getElementById("final-p2");
  const p1ScoreEl = document.getElementById("p1-score");
  const p2ScoreEl = document.getElementById("p2-score");
  const modeBtns = document.querySelectorAll(".mode-btn");
  const modeDesc = document.getElementById("mode-desc");
  const multiScoreForm = document.getElementById("multi-score-form");
  const multiNameInput = document.getElementById("multi-player-name");

  const GRID = 20;
  const HUD_H = 36;
  const P1_COLOR = "#00ff41";
  const P2_COLOR = "#00aaff";
  const dpad = document.getElementById("dpad");
  const isTouchDevice = matchMedia("(pointer: coarse)").matches;

  let CELL;
  let ws = null;
  let myNum = 0;
  let gameState = null;
  let mode = "easy";
  let lastResult = null;
  let lastMyScore = 0;

  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeBtns.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      mode = btn.dataset.mode;
      modeDesc.textContent = mode === "easy" ? "Walls wrap around" : "Walls kill you";
    });
  });

  function getDpadH() {
    if (!isTouchDevice) return 0;
    return dpad.offsetHeight || 180;
  }

  function sizeCanvas() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpadH = getDpadH();
    const availH = vh - HUD_H - dpadH;
    const size = Math.min(vw, availH);
    const snapped = Math.floor(size / GRID) * GRID;
    canvas.width = snapped;
    canvas.height = snapped;
    canvas.style.width = snapped + "px";
    canvas.style.height = snapped + "px";
    const left = Math.floor((vw - snapped) / 2);
    const top = HUD_H + Math.floor((availH - snapped) / 2);
    gameArea.style.left = left + "px";
    gameArea.style.top = top + "px";
    gameArea.style.width = snapped + "px";
    gameArea.style.height = snapped + "px";
    CELL = snapped / GRID;
    if (gameState) draw();
  }

  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);

  function showScreen(screen) {
    lobbyScreen.hidden = true;
    waitingScreen.hidden = true;
    gameoverScreen.hidden = true;
    disconnectedScreen.hidden = true;
    if (screen) {
      screen.hidden = false;
      overlay.style.display = "flex";
    } else {
      overlay.style.display = "none";
    }
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}`);

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "created") {
        myNum = msg.playerNum;
        roomCodeEl.textContent = msg.code;
        showScreen(waitingScreen);
      }

      if (msg.type === "joined") {
        myNum = msg.playerNum;
        showScreen(null);
      }

      if (msg.type === "error") {
        let errEl = document.getElementById("error-msg");
        if (!errEl) {
          errEl = document.createElement("p");
          errEl.id = "error-msg";
          joinBtn.parentNode.appendChild(errEl);
        }
        errEl.textContent = msg.message;
      }

      if (msg.type === "state") {
        gameState = msg;
        const p1 = msg.players.find((p) => p.num === 1);
        const p2 = msg.players.find((p) => p.num === 2);
        p1ScoreEl.textContent = "P1: " + (p1 ? p1.score : 0);
        p2ScoreEl.textContent = "P2: " + (p2 ? p2.score : 0);

        if (msg.state === "playing") {
          showScreen(null);
        }

        if (msg.state === "over") {
          const me = msg.players.find((p) => p.num === myNum);
          const them = msg.players.find((p) => p.num !== myNum);
          if (me && them) {
            if (!me.alive && !them.alive) {
              resultText.textContent = "Draw!";
              lastResult = "draw";
            } else if (me.alive) {
              resultText.textContent = "You Win!";
              lastResult = "win";
            } else {
              resultText.textContent = "You Lose";
              lastResult = "lose";
            }
            lastMyScore = me.score;
          }
          finalP1.textContent = p1 ? p1.score : 0;
          finalP2.textContent = p2 ? p2.score : 0;
          multiScoreForm.hidden = false;
          rematchBtn.hidden = true;
          rematchStatus.hidden = true;
          multiNameInput.value = localStorage.getItem("snakeName") || "";
          showScreen(gameoverScreen);
        }

        draw();
      }

      if (msg.type === "rematch_wait") {
        rematchBtn.hidden = true;
        rematchStatus.hidden = false;
      }

      if (msg.type === "opponent_left") {
        gameState = null;
        showScreen(disconnectedScreen);
      }
    };

    ws.onclose = () => {
      if (gameState && gameState.state === "playing") {
        showScreen(disconnectedScreen);
      }
    };
  }

  createBtn.addEventListener("click", () => {
    connect();
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "create", mode }));
    });
  });

  joinBtn.addEventListener("click", () => {
    const code = joinCodeInput.value.trim();
    if (!code) return;
    connect();
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "join", code }));
    });
  });

  multiScoreForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = multiNameInput.value.trim();
    if (!name) return;
    localStorage.setItem("snakeName", name);

    try {
      await fetch("/api/multi-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, score: lastMyScore, result: lastResult, mode }),
      });
    } catch {}

    multiScoreForm.hidden = true;
    rematchBtn.hidden = false;
  });

  rematchBtn.addEventListener("click", () => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "rematch" }));
      rematchBtn.hidden = true;
      rematchStatus.hidden = false;
    }
  });

  function backToLobby() {
    if (ws) ws.close();
    ws = null;
    gameState = null;
    myNum = 0;
    showScreen(lobbyScreen);
  }

  backBtn.addEventListener("click", backToLobby);
  dcBackBtn.addEventListener("click", backToLobby);

  function draw() {
    if (!gameState || !CELL) return;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
    const foods = gameState.foods || [];
    for (const f of foods) {
      ctx.fillStyle = "#ff4444";
      ctx.shadowColor = "#ff4444";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(
        f.x * CELL + CELL / 2,
        f.y * CELL + CELL / 2,
        CELL / 2 - 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // snakes
    for (const p of gameState.players) {
      const baseColor = p.num === 1 ? P1_COLOR : P2_COLOR;
      const r = parseInt(baseColor.slice(1, 3), 16);
      const g = parseInt(baseColor.slice(3, 5), 16);
      const b = parseInt(baseColor.slice(5, 7), 16);

      if (!p.alive) {
        ctx.globalAlpha = 0.3;
      }

      p.snake.forEach((seg, i) => {
        const fade = 1 - (i / p.snake.length) * 0.4;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fade})`;
        ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
      });

      if (p.snake.length > 0) {
        const headR = Math.min(255, r + 60);
        const headG = Math.min(255, g + 60);
        const headB = Math.min(255, b + 60);
        ctx.fillStyle = `rgb(${headR}, ${headG}, ${headB})`;
        ctx.fillRect(
          p.snake[0].x * CELL + 3,
          p.snake[0].y * CELL + 3,
          CELL - 6,
          CELL - 6
        );
      }

      ctx.globalAlpha = 1;
    }
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
    const dir = KEY_MAP[e.key];
    if (!dir || !ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "dir", dir }));
    e.preventDefault();
  });

  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    if (!touchStart) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - touchStart.x;
    const dy = e.touches[0].clientY - touchStart.y;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;

    let dir;
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    } else {
      dir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
    }

    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "dir", dir }));
    }
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: false });

  // d-pad buttons
  const DPAD_MAP = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  function vibrate() {
    if (navigator.vibrate) navigator.vibrate(15);
  }

  document.querySelectorAll(".dpad-btn").forEach((btn) => {
    function handlePress(e) {
      e.preventDefault();
      e.stopPropagation();
      const d = DPAD_MAP[btn.dataset.dir];
      if (!d || !ws || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: "dir", dir: d }));
      vibrate();
      btn.classList.add("pressed");
      setTimeout(() => btn.classList.remove("pressed"), 100);
    }
    btn.addEventListener("pointerdown", handlePress, { passive: false });
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });
})();
