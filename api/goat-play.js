// POST /api/goat-play — place a pick in the current General Penalty round.
// Body: { address, token, network, side('goal'|'save'), stake, angle?, angleStake? }
// Escrows the stake; settlement happens when the round resolves (see gpResolve).
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
    const side = (b.side === "save" || b.side === "miss") ? "miss" : "goal";
    const stake = Number(b.stake);
    const angle = (side === "goal" && b.angle && fc.ECON.ZONES_LAND.includes(b.angle)) ? b.angle : null;
    const angleStake = angle ? Number(b.angleStake) || 0 : 0;
    if (!(stake >= fc.ECON.MIN_BET) || stake > fc.ECON.MAX_BET) return res.status(400).json({ ok: false, error: "bad_stake" });
    if (angle && (angleStake < fc.ECON.MIN_BET || angleStake > fc.ECON.MAX_BET)) return res.status(400).json({ ok: false, error: "bad_angle_stake" });

    const round = fc.gpRoundNow();
    const out = await fc.withLock(`gpplay:${net}:${b.address}`, async () => {
      const playedKey = `goat:gp:played:${net}:${round}:${b.address}`;
      if (await fc.kv().get(playedKey)) return { http: 409, payload: { ok: false, error: "already_joined" } };
      const a = await fc.getAccount(net, b.address);
      const total = stake + angleStake;
      if (total > a.balance + 1e-9) return { http: 400, payload: { ok: false, error: "insufficient", balance: a.balance } };
      a.balance = fc.round9(a.balance - total); // escrow
      await fc.putAccount(a);
      await fc.kv().rpush(fc.gpBetsKey(net, round), JSON.stringify({ address: b.address, side, stake, zone: angle, zoneStake: angleStake }));
      await fc.kv().set(playedKey, 1, { ex: 300 });
      // pool +2 once per round (on the round's first bet)
      const last = Number(await fc.kv().get(fc.gpLastPoolKey(net)));
      if (last !== round) { await fc.kv().set(fc.gpLastPoolKey(net), round); try { await fc.kv().incrbyfloat(fc.gpPoolKey(net), fc.GP.POOL_PER_ROUND); } catch (_) {} }
      const pool = await fc.gpGetPool(net);
      return { http: 200, payload: { ok: true, round, secondsLeft: fc.gpSecondsLeft(), pool, balance: a.balance, bet: { side, stake, angle, angleStake } } };
    });
    if (out.error === "busy") return res.status(429).json({ ok: false, error: "busy" });
    return res.status(out.http).json(out.payload);
  } catch (e) {
    return res.status(500).json({ ok: false, error: "play_failed", detail: String(e) });
  }
};
