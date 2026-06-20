/* ============================================================
   GoatFC — Ronaldo vs Messi penalty shootout (client)
   BETA: free credits + client provably-fair. LIVE: custodial SOL
   via /api/goat-* (Devnet + Mainnet), auto-detected from /api/goat-config.
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ---- odds / config (mirror lib/goat.js) ---- */
  const MAIN_MULT = 1.98, ZONE_MULT = 9.9, P_GOAL = 0.5, MIN_BET = 0.01, START_CREDITS = 5, GRANT = 1;
  const ZONES = ["TL", "TR", "BL", "BR", "C"];
  const ZNAME = { TL: "TOP LEFT", TR: "TOP RIGHT", BL: "BOTTOM LEFT", BR: "BOTTOM RIGHT", C: "CENTRE" };
  const ZOFF = { TL: { x: -120, y: -310 }, TR: { x: 120, y: -310 }, BL: { x: -120, y: -190 }, BR: { x: 120, y: -190 }, C: { x: 0, y: -250 } };
  const ZKEEP = { TL: "left", TR: "right", BL: "left", BR: "right", C: "center" };

  const GOATS = {
    ronaldo: { name: "Ronaldo", short: "CR7", flag: "🇵🇹", cls: "r",
      title: "SIUUUU!", lines: ["CR7 sends the keeper the wrong way!", "Calma, calma… RONALDO!", "The famous SIUUU jump! 🐐", "Power, precision, Ronaldo."] },
    messi: { name: "Messi", short: "LM10", flag: "🇦🇷", cls: "m",
      title: "MAGIC! 🐐", lines: ["La Pulga rolls it in, ice cold.", "Simply Leo. Simply magic.", "Messi does it again! 🐐", "Left foot of God."] },
  };
  const COUNTRIES = [
    ["Argentina","🇦🇷"],["Portugal","🇵🇹"],["Brazil","🇧🇷"],["France","🇫🇷"],["Spain","🇪🇸"],["England","🏴󠁧󠁢󠁥󠁮󠁧󠁿"],
    ["Germany","🇩🇪"],["Italy","🇮🇹"],["Netherlands","🇳🇱"],["Belgium","🇧🇪"],["Croatia","🇭🇷"],["Uruguay","🇺🇾"],
    ["Colombia","🇨🇴"],["Mexico","🇲🇽"],["USA","🇺🇸"],["Morocco","🇲🇦"],["Nigeria","🇳🇬"],["Ghana","🇬🇭"],
    ["Senegal","🇸🇳"],["Egypt","🇪🇬"],["Cameroon","🇨🇲"],["Japan","🇯🇵"],["Korea","🇰🇷"],["Saudi Arabia","🇸🇦"],
  ];

  const fmt = (n, d = 3) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt2 = (n) => fmt(n, 2);
  const short = (a) => a.slice(0, 4) + "…" + a.slice(-4);
  const clamp0 = (n) => Math.max(0, n);

  /* ---- state ---- */
  let provider = null, address = null;
  let side = "goal", zoneOn = false, zonePick = null, busy = false;
  let goat = localStorage.getItem("goatfc:goat") || null;
  let country = JSON.parse(localStorage.getItem("goatfc:country") || "null");
  let state = null, stats = null, lbMode = "profit";

  const el = {};
  ["miniR","miniM","miniBar","modePill","lbBtn","connectBtn","accountBtn",
   "gcFlag","gcName","gcSub","changeGoat","balCard","balVal","netToggle",
   "sideGoal","sideMiss","stakeInput","zonebet","zbSwitch","zbPick","zoneWrap","zoneInput",
   "totalBet","toWin","kickBtn","msg","stR","stM","stBar","stNote",
   "stShots","stGoals","stStreak","stPnl","feed","betaBanner",
   "stadium","stars","zones","keeper","ball","strikerBadge","strikerFlag","strikerName","flash","flashText","flashSub","confetti",
   "intro","countryGrid","introDone","celebrate","celEmoji","celTitle","celLine","celFlag",
   "lbModal","lbProfit","lbGoals","lbCol","lbBody",
   "accModal","accBal","accAddr","handleInput","saveHandle","logoutBtn",
   "depLive","depBeta","depAddr","copyDep","checkDepBtn","grantBtn","depositMsg",
   "wdDest","wdAmount","wdBtn","withdrawMsg","profileMsg"
  ].forEach((id) => (el[id] = document.getElementById(id)));

  /* ============================================================ base58 + provably fair */
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  function b58encode(bytes) {
    const d = [0];
    for (let i = 0; i < bytes.length; i++) { let c = bytes[i]; for (let j = 0; j < d.length; j++) { c += d[j] << 8; d[j] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } }
    let s = ""; for (let k = 0; k < bytes.length && bytes[k] === 0; k++) s += "1";
    for (let q = d.length - 1; q >= 0; q--) s += B58[d[q]]; return s;
  }
  const enc = new TextEncoder();
  const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const randHex = (n = 16) => toHex(crypto.getRandomValues(new Uint8Array(n)));
  const sha256Hex = async (s) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  async function hmacFloat(seed, msg) {
    const k = await crypto.subtle.importKey("raw", enc.encode(seed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
    return (((sig[0] << 24) | (sig[1] << 16) | (sig[2] << 8) | sig[3]) >>> 0) / 2 ** 32;
  }
  async function newSeed() { state.server = randHex(32); state.hash = await sha256Hex(state.server); if (!state.client) state.client = randHex(8); state.nonce = 0; }

  /* ============================================================ backend */
  const API = {
    live: false, token: null, deposit: null, network: localStorage.getItem("goatfc:net") || "devnet",
    setNet(n) { this.network = n === "mainnet" ? "mainnet" : "devnet"; localStorage.setItem("goatfc:net", this.network); },
    async detect() { try { const d = await (await fetch("/api/goat-config")).json(); this.live = !!d.configured; } catch (_) { this.live = false; } return this.live; },
    async post(p, x) { const r = await fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, token: this.token, network: this.network, ...x }) }); return r.json(); },
    async login() {
      const c = await this.post("/api/goat-challenge", {}); if (!c.ok) throw new Error(c.error || "challenge");
      const signed = await provider.signMessage(enc.encode(c.message), "utf8");
      const sig = b58encode(signed.signature || signed);
      const d = await this.post("/api/goat-login", { nonce: c.nonce, signature: sig }); if (!d.ok) throw new Error(d.error || "login");
      this.token = d.token; this.deposit = d.account.depositAddress; return d.account;
    },
  };

  /* ============================================================ local state */
  const key = (a) => `goatfc:acct:${a}`;
  const blank = () => ({ credits: START_CREDITS, handle: "", shots: 0, wins: 0, streak: 0, best: 0, wagered: 0, pnl: 0, goals: 0, history: [], server: "", hash: "", client: "", nonce: 0 });
  function load(a) { try { const r = localStorage.getItem(key(a)); if (r) return Object.assign(blank(), JSON.parse(r)); } catch (_) {} return blank(); }
  const save = () => { if (address && !API.live) localStorage.setItem(key(address), JSON.stringify(state)); };
  function applyAccount(a) { state.credits = a.balance; state.handle = a.handle || ""; state.shots = a.shots; state.wins = a.wins; state.streak = a.streak; state.best = a.best; state.wagered = a.wagered; state.pnl = a.pnl; state.hash = a.serverSeedHash; state.client = a.clientSeed; state.nonce = a.nonce; }

  /* global GOAT standings */
  const statsKey = () => "goatfc:stats:" + API.network;
  function loadStats() { try { const r = localStorage.getItem(statsKey()); if (r) return JSON.parse(r); } catch (_) {} return { ronaldo: 1287, messi: 1199 }; }
  const saveStats = () => localStorage.setItem(statsKey(), JSON.stringify(stats));
  async function refreshStats() {
    if (API.live) { try { const d = await (await fetch("/api/goat-stats?network=" + API.network)).json(); if (d.ok) stats = { ronaldo: d.ronaldo, messi: d.messi }; } catch (_) {} }
    if (!stats) stats = loadStats();
    renderStandings();
  }
  function renderStandings() {
    const r = stats.ronaldo, m = stats.messi, tot = r + m || 1, pct = (r / tot) * 100;
    el.miniR.textContent = r.toLocaleString(); el.miniM.textContent = m.toLocaleString(); el.miniBar.style.width = pct + "%";
    el.stR.textContent = r.toLocaleString(); el.stM.textContent = m.toLocaleString(); el.stBar.style.width = pct + "%";
    const lead = r === m ? "Dead level — it's anyone's GOAT." : (r > m ? "Ronaldo leads by " + (r - m).toLocaleString() : "Messi leads by " + (m - r).toLocaleString());
    el.stNote.textContent = lead;
  }

  /* ============================================================ wallet */
  const getProvider = () => (window.phantom?.solana?.isPhantom && window.phantom.solana) || (window.solana?.isPhantom && window.solana) || null;
  async function connect(eager) {
    provider = getProvider();
    if (!provider) { el.connectBtn.textContent = "Get Phantom ↗"; if (!eager) window.open("https://phantom.app/", "_blank"); return; }
    try {
      const resp = await provider.connect(eager ? { onlyIfTrusted: true } : {});
      address = resp.publicKey.toString();
      await onConnected();
    } catch (_) {}
  }
  async function onConnected() {
    await API.detect();
    state = blank();
    if (API.live) {
      try { applyAccount(await API.login()); }
      catch (_) { API.live = false; state = load(address); if (!state.server) await newSeed(); }
    } else { state = load(address); if (!state.server) await newSeed(); }
    el.connectBtn.hidden = true; el.accountBtn.hidden = false; el.balCard.hidden = false;
    el.accAddr.textContent = short(address); el.wdDest.value = address; el.handleInput.value = state.handle || "";
    setMode(); renderAll(); refreshStats(); save();
    provider.on && provider.on("disconnect", logout);
  }
  function setMode() {
    el.modePill.hidden = false;
    el.modePill.textContent = API.live ? "LIVE · " + (API.network === "mainnet" ? "MAINNET" : "DEVNET") : "BETA";
    el.modePill.className = "mode-pill " + (API.live ? (API.network === "mainnet" ? "live mainnet" : "live") : "beta");
    el.netToggle.hidden = !API.live; el.depLive.hidden = !API.live; el.depBeta.hidden = API.live;
    el.betaBanner.style.display = API.live ? "none" : "";
    $$("#netToggle button").forEach((b) => b.classList.toggle("on", b.dataset.net === API.network));
    if (API.live && API.deposit) el.depAddr.textContent = API.deposit;
  }
  async function switchNet(n) {
    if (!API.live || n === API.network || busy) return;
    if (n === "mainnet" && !confirm("Switch to MAINNET? Bets here use REAL SOL.")) return;
    API.setNet(n);
    const d = await API.post("/api/goat-account", {});
    if (!d.ok) { API.setNet(n === "mainnet" ? "devnet" : "mainnet"); return; }
    API.deposit = d.account.depositAddress; state.history = []; applyAccount(d.account);
    setMode(); renderAll(); refreshStats();
  }
  function logout() {
    try { provider && provider.disconnect && provider.disconnect(); } catch (_) {}
    address = null; state = null; API.token = null;
    el.connectBtn.hidden = false; el.accountBtn.hidden = true; el.balCard.hidden = true;
    closeAll(); el.feed.innerHTML = '<p class="feed-empty">No shots yet — pick your spot.</p>';
  }

  /* ============================================================ intro: goat + country */
  function buildCountries() {
    el.countryGrid.innerHTML = COUNTRIES.map(([n, f]) => `<button class="cflag" data-c="${n}"><span class="e">${f}</span>${n}</button>`).join("");
    $$(".cflag", el.countryGrid).forEach((b) => b.addEventListener("click", () => {
      const n = b.dataset.c, f = COUNTRIES.find((c) => c[0] === n)[1];
      country = { name: n, flag: f };
      $$(".cflag", el.countryGrid).forEach((x) => x.classList.toggle("sel", x === b));
      el.introDone.disabled = false;
    }));
  }
  function pickGoat(g) {
    goat = g; localStorage.setItem("goatfc:goat", g);
    $$(".goatpick").forEach((b) => b.classList.toggle("sel", b.dataset.goat === g));
    setTimeout(() => { $(".intro-step[data-step='0']").classList.remove("on"); $(".intro-step[data-step='1']").classList.add("on"); }, 180);
  }
  function finishIntro() {
    if (!goat || !country) return;
    localStorage.setItem("goatfc:country", JSON.stringify(country));
    localStorage.setItem("goatfc:onboarded", "1");
    el.intro.classList.remove("open");
    renderGoat();
  }
  function renderGoat() {
    if (!goat) return;
    const g = GOATS[goat], cf = country ? country.flag : "🏳️";
    el.gcFlag.textContent = g.flag; el.gcName.textContent = g.name;
    el.gcSub.textContent = (country ? country.name + " " + cf : "Your GOAT") + " · " + g.short;
    el.strikerFlag.textContent = cf; el.strikerName.textContent = g.name + " " + g.flag;
  }

  /* ============================================================ bet builder */
  function selectSide(s) { side = s; el.sideGoal.classList.toggle("on", s === "goal"); el.sideMiss.classList.toggle("on", s === "miss"); el.zonebet.style.opacity = s === "goal" ? 1 : .5; if (s !== "goal" && zoneOn) toggleZone(false); renderReadout(); }
  function toggleZone(f) { zoneOn = side !== "goal" ? false : (f !== undefined ? f : !zoneOn); el.zbSwitch.classList.toggle("on", zoneOn); el.zoneWrap.hidden = !zoneOn; el.zones.classList.toggle("on", zoneOn); renderReadout(); }
  function selectZone(z) { if (!ZOFF[z] || z === "C") return; zonePick = z; $$(".zone").forEach((b) => b.classList.toggle("sel", b.dataset.zone === z)); el.zbPick.textContent = ZNAME[z]; if (!zoneOn) toggleZone(true); renderReadout(); }
  const stakeVal = () => Math.max(0, Number(el.stakeInput.value) || 0);
  const zoneVal = () => (zoneOn ? Math.max(0, Number(el.zoneInput.value) || 0) : 0);
  function renderReadout() { const a = stakeVal(), z = zoneVal(); el.totalBet.textContent = fmt(a + z) + " ◎"; el.toWin.textContent = fmt(a * MAIN_MULT + (zoneOn && zonePick ? z * ZONE_MULT : 0)) + " ◎"; }
  function renderStats() {
    el.balVal.textContent = fmt(state.credits); el.accBal.textContent = fmt(state.credits);
    el.stShots.textContent = state.shots; el.stGoals.textContent = state.goals || 0; el.stStreak.textContent = state.streak;
    el.stPnl.textContent = (state.pnl >= 0 ? "+" : "") + fmt2(state.pnl);
    el.stPnl.style.color = state.pnl > 0 ? "var(--lime)" : state.pnl < 0 ? "var(--r)" : "var(--gold)";
  }
  function renderFeed() {
    if (!state.history.length) { el.feed.innerHTML = '<p class="feed-empty">No shots yet — pick your spot.</p>'; return; }
    el.feed.innerHTML = state.history.slice(0, 12).map((h) => `<div class="feed-row">
      <span class="res"><span class="tag ${h.win ? "win" : "loss"}">${h.win ? "WIN" : "LOSS"}</span> ${h.outcome === "goal" ? "GOAL" : "SAVE"} → ${ZNAME[h.land] || h.land}</span>
      <span class="amt ${h.win ? "win" : "loss"}">${h.net >= 0 ? "+" : ""}${fmt2(h.net)}</span></div>`).join("");
  }
  function renderAll() { renderGoat(); renderReadout(); renderStats(); renderFeed(); }

  /* ============================================================ the penalty */
  function resetScene() { el.ball.classList.remove("spin"); el.ball.style.transition = "none"; el.ball.style.transform = "translate(-50%,0)"; el.keeper.className = "keeper"; el.flash.className = "flash"; void el.ball.offsetWidth; }
  function animate(outcome, land) {
    return new Promise((res) => {
      const o = ZOFF[land] || ZOFF.C;
      let dir = outcome === "miss" ? ZKEEP[land] : (land === "C" ? (Math.random() < .5 ? "left" : "right") : (ZKEEP[land] === "left" ? "right" : "left"));
      el.ball.classList.add("spin");
      requestAnimationFrame(() => {
        el.keeper.classList.add("dive-" + dir);
        el.ball.style.transition = "transform .62s cubic-bezier(.22,.61,.36,1)";
        if (outcome === "miss") { el.ball.style.transform = `translate(calc(-50% + ${o.x * .55}px),${o.y * .55}px) scale(.85)`; setTimeout(() => { el.ball.style.transition = "transform .4s ease-in"; el.ball.style.transform = `translate(calc(-50% + ${o.x * .3}px),-40px) scale(.8)`; }, 640); }
        else el.ball.style.transform = `translate(calc(-50% + ${o.x}px),${o.y}px) scale(.72)`;
      });
      setTimeout(res, outcome === "miss" ? 1080 : 720);
    });
  }
  function showFlash(outcome, win, jackpot) {
    el.flash.className = "flash show " + outcome;
    el.flashText.textContent = jackpot ? "TOP BINS! 🎯" : outcome === "goal" ? "GOAL!" : (win ? "SAVED! 🧤" : "MISS!");
    el.flashSub.textContent = jackpot ? "Corner smashed ×9.9" : "";
  }
  function confettiBurst() {
    const colors = goat === "messi" ? ["#5aa9e6", "#ffffff", "#ffd34e"] : ["#ff3b46", "#ffffff", "#ffd34e"];
    let html = "";
    for (let i = 0; i < 80; i++) html += `<i style="left:${Math.random() * 100}%;background:${colors[i % 3]};animation-duration:${1.6 + Math.random() * 1.6}s;animation-delay:${Math.random() * .3}s;transform:rotate(${Math.random() * 360}deg)"></i>`;
    el.confetti.innerHTML = html;
    setTimeout(() => (el.confetti.innerHTML = ""), 3200);
  }
  function celebrate() {
    const g = GOATS[goat];
    el.celEmoji.textContent = "🐐";
    el.celTitle.textContent = g.title;
    el.celLine.textContent = g.lines[Math.floor(Math.random() * g.lines.length)] + (country ? "  " + country.flag : "");
    el.celFlag.textContent = country ? country.flag : g.flag;
    el.celebrate.classList.add("open");
    setTimeout(() => el.celebrate.classList.remove("open"), 1900);
  }

  async function settleLocal(p) {
    const m = `${state.client}:${state.nonce}`;
    const roll = await hmacFloat(state.server, m), zr = await hmacFloat(state.server, m + ":zone");
    const outcome = roll < P_GOAL ? "goal" : "miss";
    const land = ZONES[Math.floor(zr * ZONES.length)];
    const mainP = p.side === outcome ? p.main * (MAIN_MULT - 1) : -p.main;
    const za = zoneOn && zonePick && p.z >= MIN_BET;
    const zw = za && outcome === "goal" && land === zonePick;
    const zoneP = za ? (zw ? p.z * (ZONE_MULT - 1) : -p.z) : 0;
    const net = Math.round((mainP + zoneP) * 1e9) / 1e9, win = net > 0;
    state.credits = clamp0(state.credits + net); state.shots++; state.wagered += p.main + p.z; state.pnl += net;
    if (outcome === "goal") { state.goals = (state.goals || 0) + 1; stats[goat]++; saveStats(); }
    if (win) { state.wins++; state.streak = state.streak >= 0 ? state.streak + 1 : 1; if (net > state.best) state.best = net; }
    else state.streak = state.streak <= 0 ? state.streak - 1 : -1;
    state.history.unshift({ outcome, land, win, net }); state.history = state.history.slice(0, 50);
    state.nonce++;
    return { ok: true, outcome, land, net, win, zoneWin: zw };
  }
  async function settleServer(p) {
    const d = await API.post("/api/goat-bet", { side: p.side, stake: p.main, zone: zoneOn ? zonePick : null, zoneStake: zoneOn ? p.z : 0, goat });
    if (!d.ok) return { ok: false, error: d.error };
    state.history.unshift({ outcome: d.outcome, land: d.land, win: d.win, net: d.net }); state.history = state.history.slice(0, 50);
    if (d.outcome === "goal") state.goals = (state.goals || 0) + 1;
    if (d.goatStats) stats = { ronaldo: d.goatStats.ronaldo, messi: d.goatStats.messi };
    applyAccount(d.account);
    return { ok: true, outcome: d.outcome, land: d.land, net: d.net, win: d.win, zoneWin: d.zoneWin };
  }

  async function shoot() {
    if (busy || !state) return;
    if (!goat) { openIntro(); return; }
    const main = stakeVal(), z = zoneVal(), total = main + z;
    if (main < MIN_BET) return msg("Min stake is " + fmt2(MIN_BET) + " ◎.", "err");
    if (zoneOn && (!zonePick || z < MIN_BET)) return msg("Pick a corner + stake, or turn the corner bet off.", "err");
    if (total > state.credits + 1e-9) return msg("Not enough balance. Lower the stake or top up.", "err");
    busy = true; el.kickBtn.disabled = true; el.kickBtn.textContent = "…"; el.msg.textContent = ""; resetScene();
    let r; try { r = API.live ? await settleServer({ side, main, z }) : await settleLocal({ side, main, z }); } catch (_) { r = { ok: false }; }
    if (!r.ok) { busy = false; el.kickBtn.disabled = false; el.kickBtn.textContent = "⚽ SHOOT"; return msg("Couldn't place the bet — try again.", "err"); }
    await animate(r.outcome, r.land);
    showFlash(r.outcome, r.win, r.zoneWin);
    renderAll(); renderStandings(); save();
    if (r.outcome === "goal") { confettiBurst(); setTimeout(celebrate, 350); }
    msg(r.win ? (r.zoneWin ? `Top bins! +${fmt(r.net)} ◎` : `${GOATS[goat].name} scores! +${fmt(r.net)} ◎`) : `Missed — ${fmt(r.net)} ◎`, r.win ? "ok" : "err");
    if (!API.live && state.credits < MIN_BET) setTimeout(() => { state.credits = GRANT; save(); renderStats(); msg("Out of credits — here's " + fmt(GRANT) + " ◎ on the house.", "ok"); }, 1400);
    setTimeout(() => { el.flash.className = "flash"; resetScene(); busy = false; el.kickBtn.disabled = false; el.kickBtn.textContent = "⚽ SHOOT"; }, 1700);
  }
  const msg = (t, c) => { el.msg.textContent = t; el.msg.className = "msg " + (c || ""); };

  /* ============================================================ modals */
  const open = (id) => document.getElementById(id).classList.add("open");
  const close = (id) => document.getElementById(id).classList.remove("open");
  const closeAll = () => $$(".overlay").forEach((m) => { if (m.id !== "intro") m.classList.remove("open"); });
  $$("[data-close]").forEach((b) => b.addEventListener("click", () => close(b.dataset.close)));
  $$(".overlay").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m && m.id !== "intro") m.classList.remove("open"); }));
  function openIntro() { $(".intro-step[data-step='1']").classList.remove("on"); $(".intro-step[data-step='0']").classList.add("on"); el.intro.classList.add("open"); }

  /* leaderboard */
  const SEED = [
    { h: "PenaltyKing", goat: "ronaldo", shots: 40, profit: 0.87, goals: 22 }, { h: "LaPulga", goat: "messi", shots: 38, profit: 0.84, goals: 21 },
    { h: "SiuMaster", goat: "ronaldo", shots: 55, profit: 0.42, goals: 30 }, { h: "TikiTaka", goat: "messi", shots: 29, profit: 0.38, goals: 15 },
    { h: "GoldenBoot", goat: "ronaldo", shots: 61, profit: 0.24, goals: 33 }, { h: "Maestro10", goat: "messi", shots: 47, profit: 0.22, goals: 25 },
    { h: "ColdFinish", goat: "messi", shots: 22, profit: -0.46, goals: 9 }, { h: "Panenka", goat: "ronaldo", shots: 31, profit: -0.55, goals: 12 },
  ];
  function drawLB(rows) {
    rows.sort((a, b) => lbMode === "profit" ? b.profit - a.profit : b.goals - a.goals);
    el.lbCol.textContent = lbMode === "profit" ? "Profit" : "Goals";
    const medal = ["🥇", "🥈", "🥉"];
    el.lbBody.innerHTML = rows.slice(0, 12).map((r, i) => `<tr class="${r.me ? "me" : ""}"><td>${i < 3 ? medal[i] : i + 1}</td>
      <td>${r.h}${r.me ? " (you)" : ""}</td><td>${GOATS[r.goat] ? GOATS[r.goat].flag : ""} ${r.goat || ""}</td>
      ${lbMode === "profit" ? `<td class="${r.profit >= 0 ? "pos" : "neg"}">${r.profit >= 0 ? "+" : ""}${fmt2(r.profit)} ◎</td>` : `<td class="pos">${r.goals}</td>`}</tr>`).join("");
  }
  function renderLB() {
    const rows = SEED.slice();
    if (state && state.shots > 0) rows.push({ h: state.handle || "You", goat: goat || "ronaldo", shots: state.shots, profit: state.pnl, goals: state.goals || 0, me: true });
    drawLB(rows);
  }

  /* ============================================================ wire up */
  $$(".goatpick").forEach((b) => b.addEventListener("click", () => pickGoat(b.dataset.goat)));
  el.introDone.addEventListener("click", finishIntro);
  el.changeGoat.addEventListener("click", openIntro);
  el.connectBtn.addEventListener("click", () => connect(false));
  el.accountBtn.addEventListener("click", () => { el.accBal.textContent = fmt(state.credits); open("accModal"); });
  el.lbBtn.addEventListener("click", () => { renderLB(); open("lbModal"); });
  el.lbProfit.addEventListener("click", () => { lbMode = "profit"; el.lbProfit.classList.add("on"); el.lbGoals.classList.remove("on"); renderLB(); });
  el.lbGoals.addEventListener("click", () => { lbMode = "goals"; el.lbGoals.classList.add("on"); el.lbProfit.classList.remove("on"); renderLB(); });
  el.sideGoal.addEventListener("click", () => selectSide("goal"));
  el.sideMiss.addEventListener("click", () => selectSide("miss"));
  el.zbSwitch.addEventListener("click", () => toggleZone());
  $$(".zone").forEach((b) => b.addEventListener("click", () => selectZone(b.dataset.zone)));
  el.kickBtn.addEventListener("click", shoot);
  el.stakeInput.addEventListener("input", renderReadout);
  el.zoneInput.addEventListener("input", renderReadout);
  $$(".chip").forEach((c) => c.addEventListener("click", () => { const v = stakeVal(); if (c.dataset.chip) el.stakeInput.value = c.dataset.chip; else if (c.dataset.op === "2x") el.stakeInput.value = (v * 2).toFixed(2); else if (c.dataset.op === "max") el.stakeInput.value = state ? state.credits.toFixed(2) : v.toFixed(2); renderReadout(); }));
  $$("#netToggle button").forEach((b) => b.addEventListener("click", () => switchNet(b.dataset.net)));
  $$(".tab").forEach((t) => t.addEventListener("click", () => { $$(".tab").forEach((x) => x.classList.toggle("on", x === t)); $$(".pane").forEach((p) => p.classList.toggle("on", p.id === "pane-" + t.dataset.tab)); }));
  el.saveHandle.addEventListener("click", async () => {
    const h = el.handleInput.value.trim(); if (!/^[A-Za-z0-9_]{3,20}$/.test(h)) return setMsg(el.profileMsg, "3–20 letters, numbers or _.", "err");
    if (API.live) { const d = await API.post("/api/goat-profile", { handle: h }); if (!d.ok) return setMsg(el.profileMsg, "Couldn't save.", "err"); applyAccount(d.account); } else { state.handle = h; save(); }
    renderStats(); setMsg(el.profileMsg, "Saved as " + h + ".", "ok");
  });
  el.logoutBtn.addEventListener("click", logout);
  el.grantBtn.addEventListener("click", () => { state.credits += GRANT; save(); renderStats(); setMsg(el.depositMsg, "+" + fmt(GRANT) + " ◎ added.", "ok"); });
  el.copyDep && el.copyDep.addEventListener("click", async () => { try { await navigator.clipboard.writeText(API.deposit || ""); setMsg(el.depositMsg, "Copied.", "ok"); } catch (_) {} });
  el.checkDepBtn && el.checkDepBtn.addEventListener("click", async () => { setMsg(el.depositMsg, "Checking…", ""); const d = await API.post("/api/goat-deposit-check", {}); if (!d.ok) return setMsg(el.depositMsg, "Try again.", "err"); if (d.credited > 0) { state.credits = d.balance; renderStats(); setMsg(el.depositMsg, `Credited ${fmt(d.credited)} ◎!`, "ok"); } else setMsg(el.depositMsg, "No deposit found yet.", ""); });
  el.wdBtn.addEventListener("click", async () => {
    if (!API.live) return setMsg(el.withdrawMsg, "Withdrawals open when the server is live.", "");
    const d = await API.post("/api/goat-withdraw", { destination: el.wdDest.value.trim(), amount: Number(el.wdAmount.value) });
    if (!d.ok) return setMsg(el.withdrawMsg, d.error === "below_min" ? "Below minimum." : d.error === "insufficient" ? "Not enough balance." : "Failed.", "err");
    state.credits = d.balance; renderStats();
    setMsg(el.withdrawMsg, d.queued ? "Queued for review." : "Sent! " + (d.signature ? "tx " + d.signature.slice(0, 8) + "…" : ""), "ok");
  });
  const setMsg = (n, t, c) => { n.textContent = t; n.className = "msg " + (c || ""); };
  document.addEventListener("keydown", (e) => { if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return; if (e.key === "g") selectSide("goal"); else if (e.key === "m") selectSide("miss"); else if ((e.key === " " || e.key === "Enter") && address && !$(".overlay.open")) { e.preventDefault(); shoot(); } });

  /* ============================================================ GENERAL PENALTY */
  const GP_ROUND = 60, GP_POOL_PER = 2, GP_SEED = "goatfc-general-penalty-v1";
  const gpEl = { timer: $("#gpTimer"), pool: $("#gpPool"), tok: $("#gpTok"), stake: $("#gpStake"), join: $("#gpJoin"), status: $("#gpStatus"), last: $("#gpLast") };
  let gpSide = "goal", gpAngle = "", gpPending = null, gpBusy = false, gpLastPoll = 0;
  let gpData = { pool: 6, tokens: 0, lastRound: 0 };
  const gpRound = () => Math.floor(Date.now() / 1000 / GP_ROUND);
  const gpLeft = () => GP_ROUND - Math.floor(Date.now() / 1000) % GP_ROUND;
  const gpKey = () => "goatfc:gp:" + API.network;
  function gpLoad() { try { const r = localStorage.getItem(gpKey()); if (r) gpData = Object.assign({ pool: 6, tokens: 0, lastRound: gpRound() }, JSON.parse(r)); } catch (_) {} }
  const gpSaveLocal = () => { try { localStorage.setItem(gpKey(), JSON.stringify(gpData)); } catch (_) {} };
  async function gpOutcome(r) {
    const side = (await hmacFloat(GP_SEED, `${r}`)) < P_GOAL ? "goal" : "miss";
    const land = ZONES[Math.floor((await hmacFloat(GP_SEED, `${r}:a`)) * ZONES.length)];
    return { side, land };
  }
  function gpTrigger(r) { const day = Math.floor(r / 1440); let h = 2166136261; const s = "jp" + day; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return day * 1440 + ((h >>> 0) % 1440); }
  const gpStatus = (t, c) => { gpEl.status.textContent = t; gpEl.status.className = "gp-status " + (c || ""); };
  function gpRender() { gpEl.pool.textContent = Math.round(gpData.pool).toLocaleString(); gpEl.tok.textContent = (Math.round((gpData.tokens || 0) * 100) / 100).toLocaleString(); }
  function gpTimerTick() { gpEl.timer.textContent = "0:" + String(gpLeft()).padStart(2, "0"); }

  async function gpResolveBeta(r) {
    const { side, land } = await gpOutcome(r);
    const b = gpPending;
    if (b && b.round === r && state) {
      const mainP = b.side === side ? b.stake * (MAIN_MULT - 1) : -b.stake;
      const aWin = b.angle && side === "goal" && land === b.angle;
      const aP = b.angle ? (aWin ? b.angleStake * (ZONE_MULT - 1) : -b.angleStake) : 0;
      const net = Math.round((mainP + aP) * 1e9) / 1e9, win = net > 0;
      state.credits = clamp0(state.credits + net + b.stake + b.angleStake); // un-escrow + winnings
      state.shots++; state.wagered += b.stake + b.angleStake; state.pnl += net;
      state.history.unshift({ outcome: side, land, win, net }); state.history = state.history.slice(0, 50);
      let jp = 0;
      if (r === gpTrigger(r)) { jp = gpData.pool; gpData.tokens = (gpData.tokens || 0) + jp; gpData.pool = 0; }
      renderAll(); save(); gpSaveLocal();
      gpStatus(win ? `${side === "goal" ? "GOAL" : "SAVE"}! +${fmt(net)} ◎` : `${side === "goal" ? "GOAL" : "SAVE"} — ${fmt(net)} ◎`, win ? "ok" : "err");
      if (jp > 0) { confettiBurst(); gpStatus(`🐐 DAILY GOAT DROP! You won ${fmt(jp)} GOAT!`, "jackpot"); }
    }
    gpEl.last.innerHTML = `Last round: <b class="${side === "goal" ? "g" : "s"}">${side === "goal" ? "GOAL" : "SAVE"}</b> → ${ZNAME[land]}`;
    gpPending = null; gpEl.join.disabled = false; gpRender();
  }

  async function gpPoll() {
    try {
      const q = address ? "&address=" + address : "";
      const d = await (await fetch(`/api/goat-round?network=${API.network}${q}`)).json();
      if (d.ok) { gpData.pool = d.pool; if (typeof d.tokens === "number") gpData.tokens = d.tokens; gpRender();
        if (d.recent && d.recent[0]) { const o = d.recent[0]; gpEl.last.innerHTML = `Last round: <b class="${o.side === "goal" ? "g" : "s"}">${o.side === "goal" ? "GOAL" : "SAVE"}</b> → ${ZNAME[o.land]}`; } }
    } catch (_) {}
  }
  async function gpRefreshLive() {
    if (!API.live) return;
    try { const d = await API.post("/api/goat-account", {}); if (d.ok) { applyAccount(d.account); renderAll(); } } catch (_) {}
    gpPoll(); gpPending = null; gpEl.join.disabled = false;
  }

  function gpTick() {
    gpTimerTick();
    const cur = gpRound();
    if (cur !== gpData.lastRound) {
      if (!API.live) { const elapsed = Math.min(cur - gpData.lastRound, 5); gpData.pool += GP_POOL_PER * elapsed; }
      gpData.lastRound = cur; gpSaveLocal(); gpRender();
      if (gpPending && gpPending.round < cur) { API.live ? gpRefreshLive() : gpResolveBeta(gpPending.round); }
    }
    if (API.live && Date.now() - gpLastPoll > 5000) { gpLastPoll = Date.now(); gpPoll(); }
  }

  async function gpJoin() {
    if (gpBusy) return;
    if (!address || !state) { gpStatus("Connect your wallet to join.", "err"); return; }
    const stake = Math.max(0, Number(gpEl.stake.value) || 0);
    const useAngle = gpSide === "goal" && gpAngle;
    const angle = useAngle ? gpAngle : null, angleStake = useAngle ? stake : 0, total = stake + angleStake;
    if (stake < MIN_BET) return gpStatus("Min stake " + fmt2(MIN_BET) + " ◎.", "err");
    if (total > state.credits + 1e-9) return gpStatus("Not enough balance.", "err");
    if (gpPending && gpPending.round === gpRound()) return gpStatus("You're already in this round.", "err");
    gpBusy = true; gpEl.join.disabled = true;
    const round = gpRound();
    if (API.live) {
      const d = await API.post("/api/goat-play", { side: gpSide, stake, angle, angleStake });
      if (!d.ok) { gpBusy = false; gpEl.join.disabled = false; return gpStatus(d.error === "already_joined" ? "Already in this round." : d.error === "insufficient" ? "Not enough balance." : "Couldn't join — try again.", "err"); }
      state.credits = d.balance; gpData.pool = d.pool; renderStats(); gpRender(); gpPending = { round };
    } else {
      state.credits = clamp0(state.credits - total); renderStats(); save();
      gpPending = { round, side: gpSide === "save" ? "miss" : "goal", stake, angle, angleStake };
    }
    gpStatus(`You're in round #${round}: ${gpSide.toUpperCase()}${angle ? " + " + angle : ""} for ${fmt(stake)} ◎. Result in ${gpLeft()}s.`, "ok");
    gpBusy = false;
  }

  function gpInit() {
    gpLoad(); if (!gpData.lastRound) gpData.lastRound = gpRound(); gpRender(); gpTimerTick();
    $$(".gp-side").forEach((b) => b.addEventListener("click", () => { gpSide = b.dataset.gpside; $$(".gp-side").forEach((x) => x.classList.toggle("on", x === b)); }));
    $$(".gp-ang").forEach((b) => b.addEventListener("click", () => { gpAngle = b.dataset.ang; $$(".gp-ang").forEach((x) => x.classList.toggle("sel", x === b)); }));
    gpEl.join.addEventListener("click", gpJoin);
    setInterval(gpTick, 1000);
    if (API.live) gpPoll();
  }

  /* ============================================================ boot */
  (function boot() {
    const y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear();
    for (let i = 0; i < 34; i++) { const s = document.createElement("i"); s.className = "star"; s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 60 + "%"; s.style.animationDuration = (3 + Math.random() * 4) + "s"; s.style.animationDelay = -Math.random() * 6 + "s"; el.stars.appendChild(s); }
    buildCountries();
    stats = loadStats(); renderStandings();
    renderReadout();
    // restore prior goat/country selection in the intro
    if (goat) $$(".goatpick").forEach((b) => b.classList.toggle("sel", b.dataset.goat === goat));
    if (country) renderGoat();
    // returning players skip the intro
    if (localStorage.getItem("goatfc:onboarded") && goat && country) el.intro.classList.remove("open");
    gpInit();
    setTimeout(() => connect(true), 300);
  })();
})();
