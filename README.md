# 🐐 GoatFC — Who is the GOAT?

A **Ronaldo vs Messi** penalty-shootout game. Pick your GOAT, choose your
country, take the penalty, and every goal you score pushes your GOAT up the
**global standings**. Live at **goatfc.fun**.

## ✨ What it does
- **WHO IS THE GOAT?** intro — pick **Ronaldo** or **Messi** as your striker.
- **Pick your country** — your flag rides along into the celebration.
- **Penalty betting** — call **GOAL** or **MISS** (×1.98) and optionally call the
  exact **corner** (×9.90). Provably fair.
- **Celebrations** — confetti in your GOAT's colours, signature lines
  (Ronaldo's *SIUUU!*, Messi's magic), and your country's flag on every goal.
- **⚡ General Penalty** — a communal round every minute; everyone plays the same provably-fair result. Pick GOAL/SAVE (+ optional angle). Each round adds **2 GOAT** to a Reward Pool that drops **once daily at a random minute** to everyone who bet in that exact round.
- **Global GOAT standings** — total goals scored as **Ronaldo vs Messi** across
  all players, updated live as you score.
- **Leaderboard** (profit / goals), session stats, shot history.
- **Wallet** — connect Phantom. Runs free in **BETA**; on-chain SOL (Devnet +
  Mainnet) activates when the server is configured (see `SETUP.md`).

## 🚀 Run locally
Static site + serverless API. No build step:
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## 📁 Structure
```
index.html      # the game
styles.css      # stadium + GOAT theme
app.js          # intro, betting, celebrations, standings, wallet
lib/goat.js     # server engine (accounts, auth, provably-fair, goat tallies)
api/goat-*.js   # serverless endpoints (config, login, bet, stats, …)
scripts/        # gen-keys, devnet smoke test, deploy
```

## 🎮 Modes
- **BETA** (default): free credits, client-side provably-fair. Fully playable.
- **LIVE**: real custodial SOL on **Devnet** and **Mainnet**, switchable in-app.

## ⚖️ Notes
GoatFC is an entertainment game and is **not affiliated** with any player or
club. 18+. Play responsibly. Real-money betting is regulated in many regions —
confirm it's permitted for your audience before enabling LIVE mode.
