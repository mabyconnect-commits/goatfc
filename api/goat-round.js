// GET /api/goat-round?network=&address= — General Penalty round state.
// Lazily resolves finished rounds and runs the daily jackpot. Never exposes
// the CURRENT round's outcome (only past, already-resolved rounds).
const fc = require("../lib/goat");

module.exports = async (req, res) => {
  fc.cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!fc.cfg().configured) return res.status(200).json({ ok: false, reason: "not_configured" });
  try {
    const net = fc.normNet(req.query && req.query.network);
    await fc.gpResolve(net);
    const round = fc.gpRoundNow();
    const pool = await fc.gpGetPool(net);
    const recent = [];
    for (let r = round - 1; r >= round - 20 && r >= 0; r--) {
      const o = fc.gpOutcome(net, r);
      let players = 0; try { players = await fc.kv().llen(fc.gpBetsKey(net, r)); } catch (_) {}
      recent.push({ round: r, side: o.side, land: o.land, players });
    }
    let roundPlayers = 0; try { roundPlayers = await fc.kv().llen(fc.gpBetsKey(net, round)); } catch (_) {}
    let tokens = 0; const addr = req.query && req.query.address;
    if (fc.isAddress(addr)) tokens = await fc.gpGetTokens(net, addr);
    // NOTE: the split-vs-winner mode is intentionally NOT exposed before the drop
    // — no one can know it until the jackpot actually fires.
    return res.status(200).json({ ok: true, network: net, round, secondsLeft: fc.gpSecondsLeft(), poolPerRound: fc.GP.POOL_PER_ROUND, pool, tokens, roundPlayers, recent });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "round_failed", detail: String(e) });
  }
};
