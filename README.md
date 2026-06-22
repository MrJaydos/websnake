# Snake

A retro-styled snake game with online multiplayer, leaderboards, and power-ups. Built with Node.js, Express, WebSocket, and Canvas.

## Features

- **Solo & Multiplayer** — Classic solo mode plus real-time 2-player online via WebSocket
- **Easy/Hard Modes** — Easy wraps walls, Hard kills on wall collision
- **Leaderboard** — Persistent SQLite leaderboard for solo and multiplayer, with admin delete
- **Power-ups** — Golden super fruit (50pts, spawns near snake, 5s timer) and rainbow star (Mario Kart-style invincibility with 8-bit music)
- **Combo System** — Chain food pickups within 20 ticks for 1.5x/2x/3x score multipliers
- **Sound Effects** — 8-bit sounds for eating, dying, and star power-up music
- **Personal Best** — Per-mode PB tracked locally
- **Pause** — Space/Escape keys or HUD button, freezes all timers
- **Snake Colors** — 6 color options saved to localStorage
- **Share** — Native share or clipboard fallback on game over
- **Mobile** — Fullscreen layout with d-pad controls and haptic feedback
- **PWA** — Installable on mobile with offline support via service worker

## Running Locally

```bash
npm install
npm start
```

Server starts on `http://localhost:3000` (or `PORT` env var).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `.` (project root) | Directory for `leaderboard.db` |
| `ADMIN_KEY` | _(none)_ | Key required for deleting leaderboard entries |

## Deploying with Docker

```bash
docker build -t websnake .
docker run -p 3000:3000 -v snake-data:/app/data websnake
```

Mount `/app/data` to persist the leaderboard database. Set `ADMIN_KEY` to enable score deletion from the leaderboard page.

## Tech Stack

- **Backend** — Node.js, Express, `ws` (WebSocket), `better-sqlite3`
- **Frontend** — Vanilla JS, Canvas, Web Audio API
- **Deploy** — Docker (multi-stage build), works with Coolify/Railway/Fly.io
