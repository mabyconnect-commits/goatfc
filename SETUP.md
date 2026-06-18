# 🐐 GoatFC — going live with real SOL

GoatFC auto-detects whether the server is configured via `/api/goat-config`:

- **BETA** (default, nothing to set up): free credits, client-side provably-fair.
- **LIVE**: real custodial SOL once the env vars below are set. Players pick the
  network in-app — **Devnet** (free test SOL, default) or **Mainnet** (real SOL).

Networks are isolated (separate balances, deposit addresses, leaderboards, and
GOAT goal tallies). One treasury keypair works on both chains.

## How LIVE works
1. **Sign-in** — single-use challenge (`/api/goat-challenge`) → Phantom
   `signMessage` → HMAC session token (`/api/goat-login`). All money endpoints
   require the token; the nonce is single-use so signatures can't be replayed.
2. **Deposit** — each wallet gets a derived deposit address (from
   `FC_MASTER_SEED`); "Check now" sweeps it to the treasury and credits the balance.
3. **Play** — bets settle server-side (`/api/goat-bet`) with provably-fair math;
   goals increment the global Ronaldo/Messi tally (`/api/goat-stats`).
4. **Withdraw** — `/api/goat-withdraw` sends SOL from the treasury (debit-first,
   auto-refund on failure; large amounts → manual review queue).

## Environment variables (Vercel → Settings → Environment Variables)
| Variable | Value |
|---|---|
| `TREASURY_SECRET` | base58 secret key of the hot wallet that pays withdrawals + receives deposits. Keep it funded. |
| `FC_MASTER_SEED` | long random secret; derives deposit addresses. Never change after launch. |
| `FC_SESSION_SECRET` | long random secret; signs session tokens. |
| `SOLANA_RPC_MAINNET` | mainnet RPC URL (Helius/QuickNode). |
| `SOLANA_RPC_DEVNET` | devnet RPC URL (default `https://api.devnet.solana.com`). |
| `FC_MAX_BET` | *(optional)* max stake per bet in SOL (default 5). |
| `FC_AUTO_WITHDRAW_MAX` | *(optional)* auto-send ceiling; above → review queue (default 2). |

Also add an **Upstash Redis** database (Vercel Storage → Upstash → Redis). Use
the **`KV`** custom prefix so it injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`
(the code also accepts `UPSTASH_REDIS_REST_*`). All of `TREASURY_SECRET`,
`FC_MASTER_SEED`, `FC_SESSION_SECRET`, and KV must be present for LIVE mode.

## Generate keys + deploy
```bash
node scripts/gen-keys.js                       # prints treasury + secrets
BASE=https://goatfc.fun node scripts/smoke-devnet.js   # end-to-end devnet check
```

## Before mainnet
- Fund the treasury with SOL for payouts **and** fees.
- Test the full deposit → bet → withdraw loop on **devnet** first.
- Get an audit before holding real funds. 18+. Gambling is regulated in many
  regions — confirm it's allowed for your audience.
