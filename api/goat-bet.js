// POST /api/goat-bet — server-authoritative, provably-fair penalty settlement.
// Body: { address, token, side, stake, zone, zoneStake, goat }
// On a GOAL, the chosen goat's global goal tally is incremented.
const fc = require("../lib/goat");

module.exports = async (req, res) => {
  fc.cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!fc.cfg().configured) return res.status(200).json({ ok: false, reason: "not_configured" });

  try {
    const b = fc.body(req);
    if (!fc.authed(b)) return res.status(401).json({ error: "unauthorized" });
    const net = fc.normNet(b.network);
    const goat = fc.normGoat(b.goat);

    const result = await fc.withLock(`bet:${net}:${b.address}`, async () => {
      const a = await fc.getAccount(net, b.address);
      const r = fc.settle(a, { side: b.side, stake: b.stake, zone: b.zone, zoneStake: b.zoneStake });
      if (r.error) return { http: 400, payload: { ok: false, error: r.error, balance: a.balance } };
      await fc.putAccount(a);
      // 4% house fee: 2% buyback / 1% bounty pool / 1% treasury (on total stake)
      try { await fc.routeBetFees(net, Number(b.stake) + (Number(b.zoneStake) || 0)); } catch (_) {}
      try {
        await fc.kv().lpush(fc.histKey(net, a.address), JSON.stringify({ ...r.record, goat }));
        await fc.kv().ltrim(fc.histKey(net, a.address), 0, 99);
        await fc.bumpLeaderboard(a);
      } catch (_) {}
      // headline GOAT standings: count every goal toward the chosen striker
      if (r.outcome === "goal") { try { await fc.incrGoatGoals(net, goat); } catch (_) {} }
      const stats = await fc.getGoatStats(net);
      return { http: 200, payload: { ok: true, outcome: r.outcome, land: r.land, net: r.net, win: r.win, zoneWin: r.zoneWin, goat, record: { ...r.record, goat }, account: fc.publicAccount(a, null), goatStats: stats } };
    });
    if (result.error === "busy") return res.status(429).json({ ok: false, error: "busy" });
    return res.status(result.http).json(result.payload);
  } catch (e) {
    return res.status(500).json({ ok: false, error: "bet_failed", detail: String(e) });
  }
};
