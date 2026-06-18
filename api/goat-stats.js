// GET /api/goat-stats?network=devnet|mainnet — global Ronaldo vs Messi goal tally.
const fc = require("../lib/goat");

module.exports = async (req, res) => {
  fc.cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!fc.cfg().configured) return res.status(200).json({ ok: false, reason: "not_configured" });
  try {
    const net = fc.normNet(req.query && req.query.network);
    const stats = await fc.getGoatStats(net);
    return res.status(200).json({ ok: true, network: net, ...stats });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "stats_failed", detail: String(e) });
  }
};
