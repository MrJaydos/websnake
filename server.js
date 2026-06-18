const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");

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
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const getScores = db.prepare(
  "SELECT name, score, created_at FROM scores ORDER BY score DESC LIMIT 20"
);
const insertScore = db.prepare(
  "INSERT INTO scores (name, score) VALUES (@name, @score)"
);

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/scores", (_req, res) => {
  res.json(getScores.all());
});

app.post("/api/scores", (req, res) => {
  const { name, score } = req.body;
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
  insertScore.run({ name: name.trim(), score });
  res.json({ ok: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Snake game running on http://0.0.0.0:${PORT}`);
});
