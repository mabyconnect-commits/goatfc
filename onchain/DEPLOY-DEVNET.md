# Deploy GoatFC to Devnet — step by step

The frontend is already pinned to this program ID:

```
D4XN8m2M8BBitfPpb3jNe3ji3TC5pnP4pcAmhSxwgr7p
```

Follow these on **your own machine** (this needs the Rust/Solana/Anchor
toolchain and internet — it can't be done from the Claude sandbox).

---

## 0. Install the toolchain (once)

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Anchor (via avm), matching Anchor.toml (0.30.1)
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.30.1 && avm use 0.30.1

anchor --version   # anchor-cli 0.30.1
```

## 1. Point Solana at devnet + fund your deployer wallet

```bash
solana config set --url https://api.devnet.solana.com
solana-keygen new            # if you don't have ~/.config/solana/id.json
solana airdrop 2             # repeat until you have ~5 SOL (deploy costs ~3-4)
solana balance
```

## 2. Put the program keypair in place (so it deploys to the pinned ID)

The frontend expects the address above. Save the matching keypair so
`anchor deploy` publishes to exactly that address:

```bash
mkdir -p onchain/target/deploy
cat > onchain/target/deploy/goatfc-keypair.json <<'EOF'
[142,238,200,225,124,200,104,73,144,96,111,209,32,84,118,130,225,28,195,118,45,147,13,83,39,98,126,192,137,177,27,26,179,51,81,147,49,88,37,106,245,253,86,4,123,124,224,183,252,165,84,168,1,26,168,207,159,238,10,162,74,237,114,135]
EOF

# sanity check — must print D4XN8m2M8BBitfPpb3jNe3ji3TC5pnP4pcAmhSxwgr7p
solana-keygen pubkey onchain/target/deploy/goatfc-keypair.json
```

> This is a **devnet** program keypair. For mainnet, generate a fresh one
> (`solana-keygen new -o ...`) and run `anchor keys sync` to update the IDs.

## 3. Build + deploy

```bash
cd onchain
anchor build
anchor deploy --provider.cluster devnet
```

`anchor build` also writes the IDL to `onchain/target/idl/goatfc.json` — keep
it; the frontend/admin scripts use it.

## 4. Initialize the house (commit the first server seed)

The house must commit `sha256(server_seed)` before bets can settle. Use the
admin script (run from the repo root):

```bash
RPC=https://api.devnet.solana.com \
AUTHORITY=$(cat ~/.config/solana/id.json) \
node scripts/onchain-admin.js init
```

It prints and **saves your `server_seed` to `.goat-seed.devnet` (keep secret)**
and sends the on-chain commit. Fund the vault with some SOL so it can pay wins:

```bash
node scripts/onchain-admin.js fund 2     # 2 SOL into the vault PDA
```

## 5. Tell the frontend it's live

Set this Vercel env var (Settings → Environment Variables) and redeploy:

```
GOATFC_PROGRAM_ID=D4XN8m2M8BBitfPpb3jNe3ji3TC5pnP4pcAmhSxwgr7p
```

`/api/goat-config` will then report `programId`, and the app switches the
single-penalty flow to on-chain `place_bet` (wallet-signed) instead of the
custodial path.

## 6. Settling bets

`place_bet` locks the player's SOL; `settle` (authority-only) reveals the seed
and pays the win. Run the settler so bets resolve:

```bash
node scripts/onchain-admin.js settle-loop    # watches for new bets and settles
```

For production you'd run this as a small always-on worker (or a cron). On
devnet you can just leave it running in a terminal while you test.

---

## Notes / safety
- After a reveal, rotate the commit (`node scripts/onchain-admin.js rotate`)
  before opening a new epoch of bets so the seed can't be reused.
- This program is **unaudited**. Test the full place→settle→payout loop on
  devnet thoroughly. Get an audit before mainnet funds.
