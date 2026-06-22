(() => {
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const gameArea = document.getElementById("game-area");
  const scoreEl = document.getElementById("current-score");
  const finalScoreEl = document.getElementById("final-score");
  const startScreen = document.getElementById("start-screen");
  const gameoverScreen = document.getElementById("gameover-screen");
  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("start-btn");
  const replayBtn = document.getElementById("replay-btn");
  const scoreForm = document.getElementById("score-form");
  const nameInput = document.getElementById("player-name");
  const topScoreName = document.getElementById("top-score-name");
  const topScoreValue = document.getElementById("top-score-value");
  const modeBtns = document.querySelectorAll(".mode-btn");
  const modeDesc = document.getElementById("mode-desc");
  const finalMode = document.getElementById("final-mode");
  const speedIndicator = document.getElementById("speed-indicator");
  const newHighScoreEl = document.getElementById("new-high-score");
  const colorBtns = document.querySelectorAll(".color-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const pauseScreen = document.getElementById("pause-screen");
  const resumeBtn = document.getElementById("resume-btn");
  const shareBtn = document.getElementById("share-btn");
  const pbEl = document.getElementById("personal-best");
  const streakInfo = document.getElementById("streak-info");

  const GRID = 20;
  const BASE_INTERVAL = 150;
  const MIN_INTERVAL = 60;
  const STAR_DURATION = 6000;
  const COMBO_WINDOW = 20;

  let CELL;
  let snake, dir, nextDir, food, score, gameLoop, running, mode, startTime, gameDuration, fruitsEaten;
  let superFruit = null;
  let superFruitTimer = null;
  let superFruitSpawnedAt = 0;
  let tickCount = 0;
  let snakeColor = localStorage.getItem("snakeColor") || "#00ff41";
  let currentInterval = BASE_INTERVAL;
  let topScore = 0;
  let paused = false;
  let pausedAt = 0;
  let pausedElapsed = 0;

  // combo state
  let combo = 0;
  let lastFoodTick = -999;
  let comboText = null;
  let comboTextTime = 0;

  // star power-up state
  let star = null;
  let starTimer = null;
  let starSpawnedAt = 0;
  let starActive = false;
  let starEndTime = 0;
  let starOscillators = [];

  // timer remaining values for pause/resume
  let superFruitRemaining = 0;
  let starPickupRemaining = 0;
  let starActiveRemaining = 0;

  mode = "easy";

  let sfxCtx = null;
  let muted = localStorage.getItem("snakeMuted") === "true";
  const muteBtn = document.getElementById("mute-btn");
  function updateMuteBtn() {
    muteBtn.textContent = muted ? "🔇" : "🔊";
  }
  updateMuteBtn();
  muteBtn.addEventListener("click", (e) => {
    e.preventDefault();
    muted = !muted;
    localStorage.setItem("snakeMuted", muted);
    updateMuteBtn();
    if (muted && starActive) stopStarMusic();
  });

  function getSfxCtx() {
    if (muted) return null;
    if (!sfxCtx || sfxCtx.state === "closed") {
      try { sfxCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    }
    if (sfxCtx.state === "suspended") sfxCtx.resume();
    return sfxCtx;
  }

  function unlockAudio() {
    getSfxCtx();
    document.removeEventListener("touchstart", unlockAudio, true);
    document.removeEventListener("touchend", unlockAudio, true);
    document.removeEventListener("click", unlockAudio, true);
  }
  document.addEventListener("touchstart", unlockAudio, true);
  document.addEventListener("touchend", unlockAudio, true);
  document.addEventListener("click", unlockAudio, true);

  function playEatSound() {
    const ctx = getSfxCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }

  function playSuperFruitSound() {
    const ctx = getSfxCtx();
    if (!ctx) return;
    const notes = [800, 1000, 1200, 1600];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      const t = ctx.currentTime + i * 0.06;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    });
  }

  function playDeathSound() {
    const ctx = getSfxCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  }

  function getPersonalBest() {
    return parseInt(localStorage.getItem(`snakePB_${mode}`) || "0", 10);
  }

  function setPersonalBest(val) {
    localStorage.setItem(`snakePB_${mode}`, val);
    updatePBDisplay();
  }

  function updatePBDisplay() {
    const pb = getPersonalBest();
    pbEl.textContent = `PB: ${pb}`;
  }

  updatePBDisplay();

  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function getStreak() {
    try {
      return JSON.parse(localStorage.getItem("snakeStreak")) || {};
    } catch { return {}; }
  }

  function recordGame() {
    const today = getToday();
    const s = getStreak();
    if (s.lastDate === today) {
      s.gamesToday = (s.gamesToday || 0) + 1;
    } else {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (s.lastDate === yesterday) {
        s.dayStreak = (s.dayStreak || 1) + 1;
      } else {
        s.dayStreak = 1;
      }
      s.gamesToday = 1;
      s.lastDate = today;
    }
    s.totalGames = (s.totalGames || 0) + 1;
    localStorage.setItem("snakeStreak", JSON.stringify(s));
    updateStreakDisplay();
  }

  function updateStreakDisplay() {
    const s = getStreak();
    const today = getToday();
    const games = s.lastDate === today ? (s.gamesToday || 0) : 0;
    const streak = s.dayStreak || 0;
    const total = s.totalGames || 0;

    if (total === 0) {
      streakInfo.innerHTML = "";
      return;
    }

    let html = `<span class="streak-stat">Today: <span class="streak-val">${games}</span></span>`;
    if (streak > 1) {
      html += `<span class="streak-stat"><span class="streak-fire">&#x1F525;</span> <span class="streak-val">${streak}</span> day streak</span>`;
    }
    html += `<span class="streak-stat">Total: <span class="streak-val">${total}</span></span>`;
    streakInfo.innerHTML = html;
  }

  updateStreakDisplay();

  // color picker
  colorBtns.forEach((btn) => {
    if (btn.dataset.color === snakeColor) {
      colorBtns.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    }
    btn.addEventListener("click", () => {
      colorBtns.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      snakeColor = btn.dataset.color;
      localStorage.setItem("snakeColor", snakeColor);
    });
  });

  const hud = document.getElementById("hud");
  const dpad = document.getElementById("dpad");
  const isTouchDevice = matchMedia("(pointer: coarse)").matches;

  function getDpadH() {
    if (!isTouchDevice) return 0;
    return dpad.offsetHeight || 180;
  }

  function sizeCanvas() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpadH = getDpadH();
    const hudH = hud.offsetHeight;
    const availH = vh - hudH - dpadH;
    const size = Math.min(vw, availH);
    const snapped = Math.floor(size / GRID) * GRID;

    canvas.width = snapped;
    canvas.height = snapped;
    canvas.style.width = snapped + "px";
    canvas.style.height = snapped + "px";

    const left = Math.floor((vw - snapped) / 2);
    const top = hudH + Math.floor((availH - snapped) / 2);
    gameArea.style.left = left + "px";
    gameArea.style.top = top + "px";
    gameArea.style.width = snapped + "px";
    gameArea.style.height = snapped + "px";

    CELL = snapped / GRID;
    if (snake) draw();
  }

  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);

  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeBtns.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      mode = btn.dataset.mode;
      modeDesc.textContent = mode === "easy" ? "Walls wrap around" : "Walls kill you";
      updatePBDisplay();
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
    clearSuperFruit();
    clearStar();
    deactivateStar();
    tickCount = 0;
    currentInterval = BASE_INTERVAL;
    paused = false;
    pausedAt = 0;
    pausedElapsed = 0;
    combo = 0;
    lastFoodTick = -999;
    comboText = null;
    fruitsEaten = 0;
    updateSpeedDisplay();
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

  function spawnSuperFruit() {
    const head = snake[0];
    const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
    occupied.add(`${food.x},${food.y}`);
    if (star) occupied.add(`${star.x},${star.y}`);

    const candidates = [];
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        if (dx === 0 && dy === 0) continue;
        let nx = head.x + dx;
        let ny = head.y + dy;
        if (mode === "easy") {
          nx = (nx + GRID) % GRID;
          ny = (ny + GRID) % GRID;
        } else if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
          continue;
        }
        if (!occupied.has(`${nx},${ny}`)) {
          candidates.push({ x: nx, y: ny });
        }
      }
    }
    if (candidates.length === 0) return;

    superFruit = candidates[Math.floor(Math.random() * candidates.length)];
    superFruitSpawnedAt = Date.now();
    if (!animFrame) animFrame = requestAnimationFrame(animateEffects);
    superFruitTimer = setTimeout(() => {
      superFruit = null;
      superFruitTimer = null;
      draw();
    }, 5000);
  }

  function clearSuperFruit() {
    if (superFruitTimer) clearTimeout(superFruitTimer);
    superFruit = null;
    superFruitTimer = null;
  }

  // star power-up
  function spawnStar() {
    const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
    occupied.add(`${food.x},${food.y}`);
    if (superFruit) occupied.add(`${superFruit.x},${superFruit.y}`);

    const candidates = [];
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        if (!occupied.has(`${x},${y}`)) candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return;

    star = candidates[Math.floor(Math.random() * candidates.length)];
    starSpawnedAt = Date.now();
    if (!animFrame) animFrame = requestAnimationFrame(animateEffects);
    starTimer = setTimeout(() => {
      star = null;
      starTimer = null;
      draw();
    }, 7000);
  }

  function clearStar() {
    if (starTimer) clearTimeout(starTimer);
    star = null;
    starTimer = null;
  }

  let starActiveTimer = null;

  function activateStar() {
    starActive = true;
    starEndTime = Date.now() + STAR_DURATION;
    canvas.classList.add("star-active");
    playStarMusic();
    if (!animFrame) animFrame = requestAnimationFrame(animateEffects);
    starActiveTimer = setTimeout(() => {
      deactivateStar();
      draw();
    }, STAR_DURATION);
  }

  function deactivateStar() {
    starActive = false;
    if (starActiveTimer) clearTimeout(starActiveTimer);
    starActiveTimer = null;
    canvas.classList.remove("star-active");
    stopStarMusic();
  }

  function playStarMusic() {
    stopStarMusic();
    const ctx = getSfxCtx();
    if (!ctx) return;

    const bpm = 400;
    const noteLen = 60 / bpm;
    const melody = [
      523, 587, 659, 698, 784, 880, 784, 880,
      659, 698, 784, 698, 659, 587, 523, 587,
      659, 784, 880, 988, 880, 988, 1047, 988,
      880, 784, 659, 784, 880, 784, 659, 523,
    ];

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.18;
    gainNode.connect(ctx.destination);

    const totalDuration = melody.length * noteLen;
    const loops = Math.ceil(STAR_DURATION / 1000 / totalDuration) + 1;

    for (let loop = 0; loop < loops; loop++) {
      melody.forEach((freq, i) => {
        const t = ctx.currentTime + (loop * totalDuration) + (i * noteLen);
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = freq;

        const env = ctx.createGain();
        env.gain.setValueAtTime(0.18, t);
        env.gain.exponentialRampToValueAtTime(0.01, t + noteLen * 0.9);

        osc.connect(env);
        env.connect(gainNode);
        osc.start(t);
        osc.stop(t + noteLen * 0.95);
        starOscillators.push(osc);
      });
    }
  }

  function stopStarMusic() {
    starOscillators.forEach((o) => { try { o.stop(); } catch {} });
    starOscillators = [];
  }

  function getSnakeColors() {
    if (starActive) {
      const t = Date.now();
      const hue = (t / 5) % 360;
      return {
        body: `hsl(${hue}, 100%, 60%)`,
        head: `hsl(${(hue + 30) % 360}, 100%, 80%)`,
      };
    }
    const r = parseInt(snakeColor.slice(1, 3), 16);
    const g = parseInt(snakeColor.slice(3, 5), 16);
    const b = parseInt(snakeColor.slice(5, 7), 16);
    return {
      body: snakeColor,
      head: `rgb(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)})`,
      r, g, b,
    };
  }

  function getComboMultiplier() {
    if (combo >= 5) return 3;
    if (combo >= 3) return 2;
    if (combo >= 2) return 1.5;
    return 1;
  }

  function draw() {
    if (!CELL) return;
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

    // regular food
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

    // super fruit
    if (superFruit) {
      const elapsed = Date.now() - superFruitSpawnedAt;
      const remaining = Math.ceil((5000 - elapsed) / 1000);
      const pulse = 0.7 + Math.sin(Date.now() / 150) * 0.3;
      ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(
        superFruit.x * CELL + CELL / 2,
        superFruit.y * CELL + CELL / 2,
        CELL / 2 - 1,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.shadowBlur = 0;

      const textPulse = 0.8 + Math.sin(Date.now() / 200) * 0.2;
      ctx.font = `bold ${Math.round(CELL * 0.6)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(15, 15, 35, ${textPulse})`;
      ctx.fillText(
        remaining > 0 ? remaining : "1",
        superFruit.x * CELL + CELL / 2,
        superFruit.y * CELL + CELL / 2
      );
    }

    // star pickup
    if (star) {
      const elapsed = Date.now() - starSpawnedAt;
      const remaining = Math.ceil((7000 - elapsed) / 1000);
      const t = Date.now();
      const starHue = (t / 3) % 360;
      const starPulse = 0.8 + Math.sin(t / 120) * 0.2;
      ctx.fillStyle = `hsla(${starHue}, 100%, 65%, ${starPulse})`;
      ctx.shadowColor = `hsl(${starHue}, 100%, 65%)`;
      ctx.shadowBlur = 15;

      const cx = star.x * CELL + CELL / 2;
      const cy = star.y * CELL + CELL / 2;
      const outerR = CELL / 2 - 1;
      const innerR = outerR * 0.4;
      ctx.beginPath();
      for (let p = 0; p < 5; p++) {
        const angle = -Math.PI / 2 + (p * 2 * Math.PI / 5);
        const ix = cx + Math.cos(angle) * outerR;
        const iy = cy + Math.sin(angle) * outerR;
        if (p === 0) ctx.moveTo(ix, iy); else ctx.lineTo(ix, iy);
        const innerAngle = angle + Math.PI / 5;
        ctx.lineTo(cx + Math.cos(innerAngle) * innerR, cy + Math.sin(innerAngle) * innerR);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.font = `bold ${Math.round(CELL * 0.45)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(15, 15, 35, ${starPulse})`;
      ctx.fillText(remaining > 0 ? remaining : "1", cx, cy);
    }

    // snake
    const colors = getSnakeColors();
    snake.forEach((seg, i) => {
      if (starActive) {
        const hue = ((Date.now() / 5) + i * 15) % 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
      } else {
        const fade = 1 - (i / snake.length) * 0.4;
        ctx.fillStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${fade})`;
      }
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
    });

    // head highlight
    ctx.fillStyle = colors.head;
    ctx.fillRect(
      snake[0].x * CELL + 3,
      snake[0].y * CELL + 3,
      CELL - 6,
      CELL - 6
    );

    // star timer bar
    if (starActive) {
      const remaining = Math.max(0, starEndTime - Date.now());
      const pct = remaining / STAR_DURATION;
      const barH = 3;
      const hue = (Date.now() / 3) % 360;
      ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
      ctx.fillRect(0, canvas.height - barH, canvas.width * pct, barH);
    }

    // combo text
    if (comboText) {
      const age = Date.now() - comboTextTime;
      if (age < 1000) {
        const alpha = 1 - age / 1000;
        const rise = age / 1000 * 30;
        ctx.font = `bold ${Math.round(CELL * 0.8)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
        ctx.fillText(comboText, canvas.width / 2, canvas.height / 2 - rise);
      } else {
        comboText = null;
      }
    }
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

    if (!starActive && snake.some((s) => s.x === head.x && s.y === head.y)) {
      return gameOver();
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      if (tickCount - lastFoodTick <= COMBO_WINDOW) {
        combo++;
      } else {
        combo = 1;
      }
      lastFoodTick = tickCount;
      const mult = getComboMultiplier();
      const pts = Math.round(10 * mult);
      score += pts;
      scoreEl.textContent = score;
      fruitsEaten++;
      playEatSound();
      if (combo >= 2) {
        comboText = `${combo}x COMBO!`;
        comboTextTime = Date.now();
        if (!animFrame) animFrame = requestAnimationFrame(animateEffects);
      }
      placeFood();
      updateSpeed();
    } else if (superFruit && head.x === superFruit.x && head.y === superFruit.y) {
      const mult = getComboMultiplier();
      score += Math.round(50 * mult);
      scoreEl.textContent = score;
      fruitsEaten++;
      playSuperFruitSound();
      clearSuperFruit();
    } else if (star && head.x === star.x && head.y === star.y) {
      score += 30;
      scoreEl.textContent = score;
      clearStar();
      activateStar();
    } else {
      snake.pop();
    }

    tickCount++;
    if (!superFruit && !starActive && tickCount > 60 && Math.random() < 0.005) {
      spawnSuperFruit();
    }
    if (!star && !starActive && tickCount > 100 && Math.random() < 0.002) {
      spawnStar();
    }

    draw();
  }

  let animFrame = null;
  function animateEffects() {
    if ((superFruit || star || starActive || comboText) && running && !paused) {
      draw();
      animFrame = requestAnimationFrame(animateEffects);
    } else {
      animFrame = null;
    }
  }

  function updateSpeed() {
    clearInterval(gameLoop);
    currentInterval = Math.max(MIN_INTERVAL, BASE_INTERVAL - snake.length * 3);
    gameLoop = setInterval(tick, currentInterval);
    updateSpeedDisplay();
  }

  function updateSpeedDisplay() {
    const speed = (BASE_INTERVAL / currentInterval).toFixed(1);
    speedIndicator.textContent = `Speed: ${speed}x`;
  }

  function formatDuration(ms) {
    const secs = Math.floor(ms / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? m + "m " + s + "s" : s + "s";
  }

  function showNewHighScore() {
    newHighScoreEl.hidden = false;
    newHighScoreEl.style.animation = "none";
    newHighScoreEl.offsetHeight;
    newHighScoreEl.style.animation = "";
    setTimeout(() => { newHighScoreEl.hidden = true; }, 2000);
  }

  // pause / resume
  function pauseGame() {
    if (!running || paused) return;
    paused = true;
    pausedAt = Date.now();
    clearInterval(gameLoop);

    if (superFruitTimer) {
      superFruitRemaining = Math.max(0, 5000 - (Date.now() - superFruitSpawnedAt));
      clearTimeout(superFruitTimer);
      superFruitTimer = null;
    }
    if (starTimer) {
      starPickupRemaining = Math.max(0, 7000 - (Date.now() - starSpawnedAt));
      clearTimeout(starTimer);
      starTimer = null;
    }
    if (starActiveTimer && starActive) {
      starActiveRemaining = Math.max(0, starEndTime - Date.now());
      clearTimeout(starActiveTimer);
      starActiveTimer = null;
      stopStarMusic();
    }

    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }

    pauseScreen.hidden = false;
    overlay.style.display = "flex";
    pauseBtn.textContent = "||";
  }

  function resumeGame() {
    if (!paused) return;
    const elapsed = Date.now() - pausedAt;
    pausedElapsed += elapsed;
    paused = false;

    pauseScreen.hidden = true;
    overlay.style.display = "none";

    if (superFruit && superFruitRemaining > 0) {
      superFruitSpawnedAt = Date.now() - (5000 - superFruitRemaining);
      superFruitTimer = setTimeout(() => {
        superFruit = null;
        superFruitTimer = null;
        draw();
      }, superFruitRemaining);
    }
    if (star && starPickupRemaining > 0) {
      starSpawnedAt = Date.now() - (7000 - starPickupRemaining);
      starTimer = setTimeout(() => {
        star = null;
        starTimer = null;
        draw();
      }, starPickupRemaining);
    }
    if (starActive && starActiveRemaining > 0) {
      starEndTime = Date.now() + starActiveRemaining;
      playStarMusic();
      starActiveTimer = setTimeout(() => {
        deactivateStar();
        draw();
      }, starActiveRemaining);
    }

    gameLoop = setInterval(tick, currentInterval);
    if (superFruit || star || starActive || comboText) {
      animFrame = requestAnimationFrame(animateEffects);
    }
  }

  pauseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (!running) return;
    if (paused) resumeGame(); else pauseGame();
  });

  resumeBtn.addEventListener("click", () => {
    resumeGame();
  });

  function gameOver() {
    running = false;
    clearInterval(gameLoop);
    deactivateStar();
    playDeathSound();
    if (navigator.vibrate) navigator.vibrate([50, 30, 80]);
    gameDuration = Date.now() - startTime - pausedElapsed;

    const pb = getPersonalBest();
    if (score > pb) setPersonalBest(score);

    playDeathAnimation(() => {
      finalScoreEl.textContent = score;
      finalMode.textContent = mode === "easy" ? "Easy" : "Hard";
      document.getElementById("final-fruits").textContent = fruitsEaten;

      if (score > topScore && topScore > 0) showNewHighScore();

      gameoverScreen.hidden = false;
      overlay.style.display = "flex";

      const savedName = localStorage.getItem("snakeName");
      if (savedName) {
        scoreForm.hidden = true;
        replayBtn.hidden = false;
        shareBtn.hidden = false;
        autoSubmitScore(savedName);
      } else {
        scoreForm.hidden = false;
        replayBtn.hidden = true;
        shareBtn.hidden = false;
        nameInput.value = "";
        nameInput.focus();
      }
    });
  }

  function autoSubmitScore(name) {
    fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, score, mode, duration: Math.floor(gameDuration / 1000), fruits: fruitsEaten }),
    }).catch(() => {});
    loadTopScore();
  }

  function playDeathAnimation(callback) {
    let frame = 0;
    const totalFrames = 12;
    const deadSnake = snake.map((s) => ({ ...s }));
    const colors = getSnakeColors();

    function animateDeath() {
      frame++;
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

      const flash = frame % 4 < 2;
      const fadeOut = 1 - (frame / totalFrames);
      const segsToDraw = Math.max(0, deadSnake.length - Math.floor((frame / totalFrames) * deadSnake.length));

      for (let i = 0; i < segsToDraw; i++) {
        const seg = deadSnake[i];
        if (flash) {
          ctx.fillStyle = `rgba(255, 68, 68, ${fadeOut})`;
        } else {
          ctx.fillStyle = `rgba(${colors.r || 0}, ${colors.g || 255}, ${colors.b || 65}, ${fadeOut * 0.5})`;
        }
        ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
      }

      if (frame < totalFrames) {
        requestAnimationFrame(animateDeath);
      } else {
        callback();
      }
    }
    requestAnimationFrame(animateDeath);
  }

  function startGame() {
    sizeCanvas();
    reset();
    overlay.style.display = "none";
    startScreen.hidden = true;
    gameoverScreen.hidden = true;
    pauseScreen.hidden = true;
    running = true;
    startTime = Date.now();
    recordGame();
    draw();
    gameLoop = setInterval(tick, BASE_INTERVAL);
  }

  // share
  shareBtn.addEventListener("click", async () => {
    const modeLabel = mode === "easy" ? "Easy" : "Hard";
    const text = `I scored ${score} on Snake (${modeLabel})! Can you beat it?\nhttps://snake.alfi3.com`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Snake", text, url: "https://snake.alfi3.com" });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(text);
        shareBtn.textContent = "Copied!";
        setTimeout(() => { shareBtn.textContent = "Share"; }, 1500);
      } catch {}
    }
  });

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
    if (e.key === "Escape" || e.key === " ") {
      if (running) {
        e.preventDefault();
        if (paused) resumeGame(); else pauseGame();
      }
      return;
    }
    const newDir = KEY_MAP[e.key];
    if (!newDir || !running || paused) return;
    if (newDir.x + dir.x === 0 && newDir.y + dir.y === 0) return;
    nextDir = newDir;
    e.preventDefault();
  });

  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    if (running) e.preventDefault();
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    if (!touchStart || !running || paused) return;
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
      const newDir = DPAD_MAP[btn.dataset.dir];
      if (!newDir || !running || paused) return;
      if (newDir.x + dir.x === 0 && newDir.y + dir.y === 0) return;
      nextDir = newDir;
      vibrate();
      btn.classList.add("pressed");
      setTimeout(() => btn.classList.remove("pressed"), 100);
    }
    btn.addEventListener("pointerdown", handlePress, { passive: false });
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });

  startBtn.addEventListener("click", startGame);
  replayBtn.addEventListener("click", startGame);

  scoreForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    localStorage.setItem("snakeName", name);

    try {
      await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, score, mode, duration: Math.floor(gameDuration / 1000), fruits: fruitsEaten }),
      });
    } catch {
      // offline
    }

    scoreForm.hidden = true;
    replayBtn.hidden = false;
    replayBtn.focus();
    loadTopScore();
  });

  async function loadTopScore() {
    try {
      const res = await fetch("/api/scores");
      const data = await res.json();
      if (data.length > 0) {
        topScoreName.textContent = data[0].name;
        topScoreValue.textContent = data[0].score;
        topScore = data[0].score;
      }
    } catch {
      // ignore
    }
  }

  loadTopScore();
})();
