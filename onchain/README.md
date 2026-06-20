# GoatFC — on-chain program ($GOAT + provably-fair penalty vault)

⚠️ **Scaffold. Not audited, not tested. Do NOT hold mainnet funds until you
have written tests, run it on devnet, and had an independent security audit.**

## What's here
- `programs/goatfc/src/lib.rs` — Anchor program: commit–reveal provably-fair
  penalty betting with an on-chain SOL vault.
  - `initialize(commit)` — create the House + vault, commit `sha256(server_seed)`.
  - `set_commit(commit)` — rotate the committed hash each epoch.
  - `fund(lamports)` — add SOL liquidity for payouts.
  - `place_bet(nonce, amount, zone_stake, pick, zone)` — escrow a bet into the vault.
  - `settle(server_seed)` — reveal the seed; the program verifies the commit and
    derives the outcome from `keccak(seed || player || nonce)`, paying winners
    from the vault. Neither side can change a result after the commit.

## $GOAT token
The reward-pool token is a standard SPL token — create it with
`scripts/create-goat-token.js` (see that file's header). Set `GOAT_MINT` afterward.

## Build / deploy (needs the Solana + Anchor toolchain — not this sandbox)
```bash
# install: https://solana.com/docs + https://www.anchor-lang.com/docs/installation
solana-keygen new                       # a deploy wallet
solana config set --url devnet && solana airdrop 2
cd onchain
anchor build
# put the real program id back into lib.rs (declare_id!) and Anchor.toml:
anchor keys sync
anchor build && anchor deploy           # devnet
```

## Before mainnet (non-negotiable for real funds)
1. Write tests (`anchor test`) covering win/lose, zone hits, reveal mismatch,
   double-settle, vault drain attempts, overflow.
2. Run a full devnet round of deposit → bet → settle → payout.
3. Get an independent **audit**. On-chain randomness via commit–reveal trusts the
   house to reveal honestly — consider Switchboard VRF for trustless randomness.
4. Add limits (max bet, vault solvency checks) and an emergency pause.
