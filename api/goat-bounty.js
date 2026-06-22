// World Cup Bounty (SOL raffle). Ticket sales fund the pool.
//   GET  /api/goat-bounty?network=&address=        → { ok, pool, tickets, ticketPrice }
//   POST /api/goat-bounty { address, token, action:"buy", qty }  → buy tickets
const fc = require("../lib/goat");

module.exports = async (req, res) => {
  fc.cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!fc.cfg().configured) return res.status(200).json({ ok: false, reason: "not_configured" });
  try {
    const net = fc.normNet((req.query && req.query.network) || (fc.body(req) || {}).network);
    if (req.method === "GET") {
      let draw = null; try { draw = await fc.bountyResolve(net); } catch (_) {} // lazily run the draw past the deadline
      const st = await fc.bountyState(net, req.query && req.query.address);
      return res.status(200).json({ ok: true, network: net, ticketPrice: fc.BOUNTY.TICKET_PRICE, ...st, justDrew: draw && draw.resolved ? draw : null });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const b = fc.body(req);
    if (!fc.authed(b)) return res.status(401).json({ error: "unauthorized" });
    if (b.action !== "buy") return res.status(400).json({ ok: false, error: "bad_action" });

    const out = await fc.withLock(`bounty:${net}:${b.address}`, async () => {
      const r = await fc.bountyBuy(net, b.address, b.qty);
      if (r.error) return { http: 400, payload: { ok: false, error: r.error, balance: r.balance } };
      return { http: 200, payload: { ok: true, network: net, balance: r.balance, pool: r.pool, tickets: r.tickets, ticketPrice: fc.BOUNTY.TICKET_PRICE } };
    });
    if (out.error === "busy") return res.status(429).json({ ok: false, error: "busy" });
    return res.status(out.http).json(out.payload);
  } catch (e) {
    return res.status(500).json({ ok: false, error: "bounty_failed", detail: String(e) });
  }
};
