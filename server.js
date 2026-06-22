const express = require("express");
const http = require("http");
const Database = require("better-sqlite3");
const path = require("path");
const multiplayer = require("./multiplayer");

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database(
  path.join(process.env.DATA_DIR || __dirname, "leaderboard.db")
);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    mode TEXT NOT NULL DEFAULT 'hard',
    duration INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const hasMode = db.prepare(
  "SELECT COUNT(*) as cnt FROM pragma_table_info('scores') WHERE name = 'mode'"
).get();
if (hasMode.cnt === 0) {
  db.exec("ALTER TABLE scores ADD COLUMN mode TEXT NOT NULL DEFAULT 'hard'");
}

const hasDuration = db.prepare(
  "SELECT COUNT(*) as cnt FROM pragma_table_info('scores') WHERE name = 'duration'"
).get();
if (hasDuration.cnt === 0) {
  db.exec("ALTER TABLE scores ADD COLUMN duration INTEGER NOT NULL DEFAULT 0");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS multi_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    result TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'easy',
    duration INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const hasMultiDuration = db.prepare(
  "SELECT COUNT(*) as cnt FROM pragma_table_info('multi_scores') WHERE name = 'duration'"
).get();
if (hasMultiDuration.cnt === 0) {
  db.exec("ALTER TABLE multi_scores ADD COLUMN duration INTEGER NOT NULL DEFAULT 0");
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  },
}));

const ADMIN_KEY = process.env.ADMIN_KEY || "";

const getScores = db.prepare(`
  SELECT id, name, score, mode, duration
  FROM scores s
  WHERE id = (
    SELECT id FROM scores s2 WHERE s2.name = s.name
    ORDER BY s2.score DESC, CASE s2.mode WHEN 'hard' THEN 0 ELSE 1 END, s2.id DESC
    LIMIT 1
  )
  ORDER BY score DESC
  LIMIT 10
`);
const insertScore = db.prepare(
  "INSERT INTO scores (name, score, mode, duration) VALUES (@name, @score, @mode, @duration)"
);
const deleteScore = db.prepare("DELETE FROM scores WHERE id = ?");

const getMultiScores = db.prepare(`
  SELECT id, name, score, result, mode, duration
  FROM multi_scores ms
  WHERE id = (
    SELECT id FROM multi_scores ms2 WHERE ms2.name = ms.name
    ORDER BY ms2.score DESC, CASE ms2.mode WHEN 'hard' THEN 0 ELSE 1 END, ms2.id DESC
    LIMIT 1
  )
  ORDER BY score DESC
  LIMIT 10
`);
const insertMultiScore = db.prepare(
  "INSERT INTO multi_scores (name, score, result, mode, duration) VALUES (@name, @score, @result, @mode, @duration)"
);
const deleteMultiScore = db.prepare("DELETE FROM multi_scores WHERE id = ?");

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/scores", (_req, res) => {
  res.json(getScores.all());
});

app.post("/api/scores", (req, res) => {
  const { name, score, mode, duration } = req.body;
  if (
    !name ||
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.trim().length > 20
  ) {
    return res.status(400).json({ error: "Name must be 1-20 characters" });
  }
  if (!Number.isInteger(score) || score < 0) {
    return res.status(400).json({ error: "Score must be a non-negative integer" });
  }
  const validMode = mode === "easy" ? "easy" : "hard";
  const validDuration = Number.isInteger(duration) && duration >= 0 ? duration : 0;
  insertScore.run({ name: name.trim(), score, mode: validMode, duration: validDuration });
  res.json({ ok: true });
});

app.get("/api/multi-scores", (_req, res) => {
  res.json(getMultiScores.all());
});

app.post("/api/multi-scores", (req, res) => {
  const { name, score, result, mode, duration } = req.body;
  if (
    !name ||
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.trim().length > 20
  ) {
    return res.status(400).json({ error: "Name must be 1-20 characters" });
  }
  if (!Number.isInteger(score) || score < 0) {
    return res.status(400).json({ error: "Score must be a non-negative integer" });
  }
  const validMode = mode === "easy" ? "easy" : "hard";
  const validResult = ["win", "lose", "draw"].includes(result) ? result : "lose";
  const validDuration = Number.isInteger(duration) && duration >= 0 ? duration : 0;
  insertMultiScore.run({ name: name.trim(), score, result: validResult, mode: validMode, duration: validDuration });
  res.json({ ok: true });
});

function checkAdmin(req, res) {
  const key = req.headers["x-admin-key"] || req.query.key;
  if (!ADMIN_KEY) return true;
  if (key === ADMIN_KEY) return true;
  res.status(403).json({ error: "Invalid admin key" });
  return false;
}

app.delete("/api/scores/:id", (req, res) => {
  if (!checkAdmin(req, res)) return;
  deleteScore.run(req.params.id);
  res.json({ ok: true });
});

app.delete("/api/multi-scores/:id", (req, res) => {
  if (!checkAdmin(req, res)) return;
  deleteMultiScore.run(req.params.id);
  res.json({ ok: true });
});

const server = http.createServer(app);
multiplayer.attach(server);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Snake game running on http://0.0.0.0:${PORT}`);
});
