// scripts/create-goat-token.js — create the $GOAT SPL token mint.
// Run on YOUR machine (has network to Solana):
//   npm i @solana/web3.js @solana/spl-token bs58
//   RPC=https://api.devnet.solana.com MINT_AUTH=<base58 secret> SUPPLY=1000000000 node scripts/create-goat-token.js
// Prints the new mint address. Use it as the $GOAT token across GoatFC.
const web3 = require("@solana/web3.js");
const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = require("@solana/spl-token");
const _b = require("bs58"); const bs58 = _b && _b.default ? _b.default : _b;

(async () => {
  const RPC = process.env.RPC || "https://api.devnet.solana.com";
  const DECIMALS = Number(process.env.DECIMALS || 6);
  const SUPPLY = BigInt(process.env.SUPPLY || "1000000000"); // whole tokens
  if (!process.env.MINT_AUTH) { console.error("Set MINT_AUTH=<base58 secret key> (a funded wallet)"); process.exit(1); }
  const payer = web3.Keypair.fromSecretKey(bs58.decode(process.env.MINT_AUTH));
  const conn = new web3.Connection(RPC, "confirmed");
  console.log("Network:", RPC, "| payer:", payer.publicKey.toBase58());

  const mint = await createMint(conn, payer, payer.publicKey, payer.publicKey, DECIMALS);
  console.log("✓ $GOAT mint:", mint.toBase58());

  const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
  await mintTo(conn, payer, mint, ata.address, payer, SUPPLY * (10n ** BigInt(DECIMALS)));
  console.log("✓ minted", SUPPLY.toString(), "$GOAT to", ata.address.toBase58());
  console.log("\nSet GOAT_MINT=" + mint.toBase58() + " in your env. Keep MINT_AUTH secret.");
})().catch((e) => { console.error("✗", e.message || e); process.exit(1); });
