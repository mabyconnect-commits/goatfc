// scripts/onchain-admin.js — operate the GoatFC on-chain program (devnet).
// Raw @solana/web3.js, no Anchor dependency. Run on your machine:
//   npm i @solana/web3.js
//   RPC=https://api.devnet.solana.com AUTHORITY="$(cat ~/.config/solana/id.json)" \
//     node scripts/onchain-admin.js <init|rotate|fund <sol>|settle-loop>
const web3 = require("@solana/web3.js");
const crypto = require("crypto");
const fs = require("fs");
const bs58 = (() => { const m = require("bs58"); return m.default || m; })();

const PROGRAM_ID = new web3.PublicKey("D4XN8m2M8BBitfPpb3jNe3ji3TC5pnP4pcAmhSxwgr7p");
const RPC = process.env.RPC || "https://api.devnet.solana.com";
const SEED_FILE = process.env.SEED_FILE || ".goat-seed.devnet";

const DISC = {
  initialize: [175,175,109,31,13,152,155,237],
  set_commit: [152,164,77,97,97,206,81,77],
  fund: [218,188,111,221,152,113,174,7],
  settle: [175,42,185,87,144,131,102,212],
};
const BET_DISC = Buffer.from([147,23,35,59,15,75,155,32]);

function authority() {
  if (!process.env.AUTHORITY) { console.error('Set AUTHORITY="$(cat ~/.config/solana/id.json)"'); process.exit(1); }
  return web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.AUTHORITY)));
}
const pda = (seeds) => web3.PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const housePda = () => pda([Buffer.from("house")]);
const vaultPda = () => pda([Buffer.from("vault")]);
const sha256 = (b) => crypto.createHash("sha256").update(b).digest();
const ix = (name, extra = Buffer.alloc(0)) => Buffer.concat([Buffer.from(DISC[name]), extra]);

async function send(conn, kp, keys, data) {
  const tx = new web3.Transaction().add(new web3.TransactionInstruction({ programId: PROGRAM_ID, keys, data }));
  const sig = await web3.sendAndConfirmTransaction(conn, tx, [kp], { commitment: "confirmed" });
  return sig;
}

async function doInit(conn, kp, rotate) {
  const seed = crypto.randomBytes(32);
  fs.writeFileSync(SEED_FILE, seed.toString("hex"));
  fs.chmodSync(SEED_FILE, 0o600);
  const commit = sha256(seed);
  const keys = rotate
    ? [ { pubkey: housePda(), isSigner: false, isWritable: true }, { pubkey: kp.publicKey, isSigner: true, isWritable: false } ]
    : [ { pubkey: housePda(), isSigner: false, isWritable: true },
        { pubkey: vaultPda(), isSigner: false, isWritable: false },
        { pubkey: kp.publicKey, isSigner: true, isWritable: true },
        { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false } ];
  const sig = await send(conn, kp, keys, ix(rotate ? "set_commit" : "initialize", commit));
  console.log((rotate ? "✓ rotated commit" : "✓ initialized house"), "| sig:", sig);
  console.log("server_seed saved to", SEED_FILE, "(KEEP SECRET)");
}

async function doFund(conn, kp, sol) {
  const lamports = Math.round(Number(sol) * web3.LAMPORTS_PER_SOL);
  const data = ix("fund", (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(lamports)); return b; })());
  const keys = [ { pubkey: vaultPda(), isSigner: false, isWritable: true },
    { pubkey: kp.publicKey, isSigner: true, isWritable: true },
    { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false } ];
  console.log("✓ funded vault", sol, "SOL | sig:", await send(conn, kp, keys, data));
}

function decodeBet(buf) {
  let o = 8; const rd32 = () => { const v = buf.subarray(o, o + 32); o += 32; return v; };
  const player = new web3.PublicKey(rd32());
  const nonce = buf.readBigUInt64LE(o); o += 8;
  const amount = buf.readBigUInt64LE(o); o += 8;
  const zoneStake = buf.readBigUInt64LE(o); o += 8;
  const pick = buf[o]; o += 1; const zone = buf[o]; o += 1;
  const commit = Buffer.from(rd32());
  const settled = buf[o] === 1;
  return { player, nonce, amount, zoneStake, pick, zone, commit, settled };
}

async function settleOne(conn, kp, seed, betPubkey, bet) {
  // borsh Vec<u8>: 4-byte LE length + bytes
  const len = Buffer.alloc(4); len.writeUInt32LE(seed.length);
  const data = ix("settle", Buffer.concat([len, seed]));
  const keys = [ { pubkey: housePda(), isSigner: false, isWritable: false },
    { pubkey: betPubkey, isSigner: false, isWritable: true },
    { pubkey: vaultPda(), isSigner: false, isWritable: true },
    { pubkey: bet.player, isSigner: false, isWritable: true },
    { pubkey: kp.publicKey, isSigner: true, isWritable: false },
    { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false } ];
  return send(conn, kp, keys, data);
}

async function settleLoop(conn, kp) {
  if (!fs.existsSync(SEED_FILE)) { console.error("No", SEED_FILE, "- run `init` first."); process.exit(1); }
  const seed = Buffer.from(fs.readFileSync(SEED_FILE, "utf8").trim(), "hex");
  const myCommit = sha256(seed);
  console.log("Settler running. Watching for bets bound to the current commit…");
  for (;;) {
    try {
      const accts = await conn.getProgramAccounts(PROGRAM_ID, { filters: [{ memcmp: { offset: 0, bytes: bs58.encode(BET_DISC) } }] });
      for (const { pubkey, account } of accts) {
        const bet = decodeBet(account.data);
        if (bet.settled) continue;
        if (!bet.commit.equals(myCommit)) continue; // can't settle bets from another epoch's seed
        try { const sig = await settleOne(conn, kp, seed, pubkey, bet); console.log("settled", pubkey.toBase58(), "| sig:", sig); }
        catch (e) { console.error("settle failed", pubkey.toBase58(), e.message || e); }
      }
    } catch (e) { console.error("scan error:", e.message || e); }
    await new Promise((r) => setTimeout(r, 4000));
  }
}

(async () => {
  const conn = new web3.Connection(RPC, "confirmed");
  const kp = authority();
  const [cmd, arg] = process.argv.slice(2);
  console.log("Program:", PROGRAM_ID.toBase58(), "| authority:", kp.publicKey.toBase58(), "|", RPC);
  if (cmd === "init") return doInit(conn, kp, false);
  if (cmd === "rotate") return doInit(conn, kp, true);
  if (cmd === "fund") return doFund(conn, kp, arg || "1");
  if (cmd === "settle-loop") return settleLoop(conn, kp);
  console.log("usage: node scripts/onchain-admin.js <init|rotate|fund <sol>|settle-loop>");
})().catch((e) => { console.error("✗", e.message || e); process.exit(1); });
