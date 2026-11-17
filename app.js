// 24/7 Books Admin — controls the whole app through Supabase (project "book").
// Pages: Home · Books (+ editor) · Stats · Readers · Money & offers · Notifications ·
//        Home screen · Ads · Team & activity. Only accounts in public.admins get in.
(() => {
  "use strict";
  const C = window.ADMIN_CONFIG;
  const DEMO = new URLSearchParams(location.search).has("demo") && typeof window.makeDemoClient === "function";
  const sb = DEMO ? window.makeDemoClient() : window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const ago = (d) => { if (!d) return "—"; const s = (Date.now() - new Date(d)) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " days ago"; };
  const when = (d) => new Date(d).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const day = (d) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const localInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
  const productName = (p) => ({ coins_100: "100 coins", coins_500: "500 coins", coins_1200: "1,200 coins", coins_3000: "3,000 coins",
    coins_starter: "Starter pack", vip_weekly: "VIP Weekly", vip_monthly: "VIP Monthly", vip_yearly: "VIP Yearly" }[p] || p);
  const slugify = (t) => String(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "book";

  function toast(text) { const t = $("#toast"); t.textContent = text; t.classList.remove("hidden"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add("hidden"), 3200); }
  function openModal(html, wide = false) { const m = $("#modal"), c = $("#modal-card"); c.className = "modal-card" + (wide ? " wide" : ""); c.innerHTML = html; m.classList.remove("hidden"); return c; }
  function closeModal() { $("#modal").classList.add("hidden"); }
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  async function logAction(action, detail = {}) { try { await sb.from("admin_log").insert({ action, detail }); } catch (_) {} }
  function setMsg(el, text, err = false) { if (!el) return; el.textContent = text || ""; el.classList.toggle("err", !!err); }
  const rpc = async (name, args) => { const { data, error } = await sb.rpc(name, args); if (error) throw error; return data; };

  // ---------- shared state ----------
  let stories = [], settings = {}, promos = [];
  const builtIns = () => Object.entries(C.builtIn).map(([id, b]) => ({ id, title: b.title, genre: b.genre, chapters: b.chapters, cover_url: b.cover, builtIn: true, published: true }));
  const allBooks = () => [...stories, ...builtIns().filter((b) => !stories.some((s) => s.id === b.id))];
  const bookName = (id) => allBooks().find((b) => b.id === id)?.title || id || "All books";
  const coverOf = (id) => allBooks().find((b) => b.id === id)?.cover_url;
  const S = (k, d) => (settings[k] === undefined ? d : settings[k]);

  async function loadStories() { const { data, error } = await sb.from("stories").select("*").order("sort", { ascending: true }); if (!error) stories = data || []; }
  async function loadSettings() { const { data } = await sb.from("app_settings").select("*"); settings = {}; (data || []).forEach((r) => (settings[r.key] = r.value)); }
  async function loadPromos() { const { data } = await sb.from("promotions").select("*").order("starts_at", { ascending: false }); promos = data || []; }
  async function saveSetting(key, value) {
    settings[key] = value;
    const { error } = await sb.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) { toast("Couldn't save: " + error.message); return false; }
    logAction("setting", { key, value }); return true;
  }
  const revenueOf = (purchases) => Object.entries(purchases || {}).reduce((a, [p, n]) => a + (C.prices[p] || 0) * n, 0);

  // ---------- sign in ----------
  async function start() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return showLogin();
    const { data: ok, error } = await sb.rpc("is_admin");
    if (error || !ok) { await sb.auth.signOut(); return showLogin("This account isn't an admin.", true); }
    const email = data.session.user.email || "";
    $("#who-email").textContent = email; $("#who-av").textContent = (email[0] || "A").toUpperCase();
    $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
    if (DEMO && !$(".demo-banner")) { const b = document.createElement("div"); b.className = "demo-banner"; b.textContent = "DEMO · example numbers · nothing here is real or saved"; document.body.prepend(b); }
    await Promise.all([loadStories(), loadSettings(), loadPromos()]);
    route();
  }
  function showLogin(msg = "", err = false) { $("#app").classList.add("hidden"); $("#login").classList.remove("hidden"); setMsg($("#login-msg"), msg, err); }
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#login-email").value.trim(), pw = $("#login-password").value;
    if (!pw) return setMsg($("#login-msg"), "Type your password.", true);
    setMsg($("#login-msg"), "Signing in…");
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) return setMsg($("#login-msg"), "Wrong email or password.", true);
    $("#login-password").value = ""; start();
  });
  $("#send-link").addEventListener("click", async () => {
    const email = $("#login-email").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg($("#login-msg"), "Type your email first.", true);
    setMsg($("#login-msg"), "Sending…");
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
    if (error) return setMsg($("#login-msg"), /sending|smtp/i.test(error.message) ? "Email sending isn't working right now. Use your password." : "Couldn't send: " + error.message, true);
    setMsg($("#login-msg"), ""); $("#sent-to").textContent = email; $("#step-email").classList.add("hidden"); $("#step-sent").classList.remove("hidden");
  });
  $("#use-other").addEventListener("click", () => { $("#step-sent").classList.add("hidden"); $("#step-email").classList.remove("hidden"); });
  $("#logout").addEventListener("click", async () => { await sb.auth.signOut(); showLogin(); });
  sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_OUT") showLogin(); });

  // ---------- router ----------
  const pages = { home, books, book, stats, readers, money: moneyPage, notify, homescreen, ads, team };
  function route() {
    if ($("#app").classList.contains("hidden")) return;
    const [name, arg] = (location.hash.slice(1) || "home").split("/");
    const fn = pages[name] || home;
    $$("#nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + (name === "book" ? "books" : name)));
    const main = $("#main"); main.innerHTML = '<div class="empty">Loading…</div>'; window.scrollTo(0, 0);
    Promise.resolve(fn(main, arg ? decodeURIComponent(arg) : undefined)).catch((err) => { main.innerHTML = `<div class="card"><div class="ct">Something went wrong</div><p class="muted">${esc(err.message || err)}</p></div>`; });
  }
  window.addEventListener("hashchange", route);
  const go = (h) => { if (location.hash === "#" + h) route(); else location.hash = h; };

  // =====================================================================
  // HOME
  // =====================================================================
  async function home(main) {
    const [wk, today, purchases, activity, pushes] = await Promise.all([
      rpc("admin_stats", { days: 7 }), rpc("admin_stats", { days: 1 }),
      rpc("admin_recent_purchases", { lim: 5 }).catch(() => []), rpc("admin_activity", { lim: 5 }).catch(() => []),
      rpc("admin_push_history", { lim: 10 }).catch(() => [])]);
    const now = Date.now();
    const upcoming = [
      ...promos.filter((p) => p.enabled && new Date(p.starts_at) > now).map((p) => ({ at: p.starts_at, html: `🎉 Offer starts: <b>${esc(p.title)}</b>` })),
      ...promos.filter((p) => p.enabled && new Date(p.starts_at) <= now && new Date(p.ends_at) > now).map((p) => ({ at: p.ends_at, html: `⏳ Offer ends: <b>${esc(p.title)}</b>` })),
      ...pushes.filter((m) => m.status === "scheduled").map((m) => ({ at: m.send_at, html: `🔔 Push: <b>${esc(m.title)}</b>` })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, 4);
    const topBook = (today.books || [])[0];
    const funnel = await rpc("admin_funnel", { book: topBook?.book || "moonless", days: 30 }).catch(() => []);
    // Biggest loss of readers between consecutive chapters, early in the book (where it matters most).
    const stopAt = (() => { const early = funnel.filter((r) => r.chapter <= 30); let worst = null, prev = null;
      for (const r of early) { if (prev && prev.readers >= 10) { const lost = prev.readers - r.readers; if (lost > 0 && (!worst || lost > worst.lost)) worst = { ch: r.chapter, lost }; } prev = r; } return worst; })();
    const todayMoney = revenueOf(today.purchases), packs = Object.entries(today.purchases || {}).filter(([p]) => !p.startsWith("vip")).reduce((a, [, n]) => a + n, 0);
    const vips = Object.entries(today.purchases || {}).filter(([p]) => p.startsWith("vip")).reduce((a, [, n]) => a + n, 0);
    const h = new Date().getHours();
    main.innerHTML = `
      <div class="top"><div><div class="hi">${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · Good ${h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"}</div><h1>Home</h1></div>
        <div class="acts"><a class="btn ghost" href="#notify">🔔 Notify readers</a><a class="btn gold" href="#book/new">＋ New book</a></div></div>
      <div class="row">
        <div class="card tonight" style="flex:1.3"><div class="moonmini"></div><div class="tl">TODAY</div>
          <div class="big">${fmt(today.active_today)} <small>people opened the app · ${fmt(today.readers)} read</small></div>
          <div class="lines">💰 <b>${money(todayMoney)}</b> from ${fmt(packs)} coin pack${packs === 1 ? "" : "s"}${vips ? ` and <b>${vips}</b> new VIP${vips === 1 ? "" : "s"}` : ""}<br>
          📖 Most read: <b>${esc(topBook ? bookName(topBook.book) : "—")}</b>${topBook ? ` · ${fmt(topBook.chapters_read)} chapters` : ""}<br>
          ${stopAt ? `⚠️ Most readers stop after <b>chapter ${stopAt.ch - 1}</b> of ${esc(bookName(topBook?.book || "moonless"))}` : "📊 Reading details appear as soon as readers use app 1.1"}</div>
          ${stopAt ? `<div class="tip" style="margin-top:12px">💡 Try a free <b>chapter ${stopAt.ch}</b> this weekend and notify those readers. <a href="#money">Create offer →</a></div>` : ""}</div>
        <div class="grid2" style="flex:1">
          ${kpi("Earned · 7 days", money(revenueOf(wk.purchases)), `${fmt(Object.values(wk.purchases || {}).reduce((a, n) => a + n, 0))} purchases`, true)}
          ${kpi("Readers · 7 days", fmt(wk.readers), `${fmt(wk.accounts)} accounts`)}
          ${kpi("Chapters read · 7 days", fmt(wk.chapters_read), `${fmt(Math.round(wk.chapters_read / 7))} a day`)}
          ${kpi("VIP members", fmt(wk.vip_members), `${fmt(wk.push_devices)} phones get pushes`, true)}</div></div>
      <div class="row">
        <div class="card" style="flex:1.6"><div class="ct">On the shelf <a href="#books">Manage books ›</a></div>
          <div class="shelf">${allBooks().map((b) => { const st = (wk.books || []).find((x) => x.book === b.id);
            return `<div class="bk" data-id="${esc(b.id)}">${b.cover_url ? `<img class="cv" src="${esc(b.cover_url)}" alt="">` : `<div class="cv"></div>`}
              ${b.builtIn ? "" : `<span class="badge tag ${b.published ? "ok" : ""}">${b.published ? "LIVE" : "DRAFT"}</span>`}
              <div class="t">${esc(b.title)}</div><div class="m">👁 ${fmt(st?.readers)} · 📖 ${fmt(st?.chapters_read)} this week</div></div>`; }).join("")}
            <div class="addbk" onclick="location.hash='book/new'"><b>＋</b>New book</div></div><div class="plank"></div></div>
        <div class="card"><div class="ct">Chapters read <span class="muted">7 days</span></div>${barChart(wk.daily)}</div></div>
      <div class="row">
        <div class="card"><div class="ct">Coming up <a href="#money">Offers ›</a></div><div class="feed">${upcoming.map((u) => `<div>📅 <b>${esc(when(u.at))}</b> · ${u.html}</div>`).join("") || '<div class="muted">Nothing scheduled. Plan an offer or a push.</div>'}</div></div>
        <div class="card"><div class="ct">Latest purchases <a href="#stats">Stats ›</a></div><div class="feed">${purchases.map((p) => `<div>${p.product_id?.startsWith("vip") ? "👑" : "🪙"} <b>${esc(productName(p.product_id))}</b> · ${esc(p.email || "reader")} · ${money(C.prices[p.product_id] || 0)} · ${ago(p.created_at)}</div>`).join("") || '<div class="muted">No purchases yet.</div>'}</div></div>
        <div class="card"><div class="ct">Team activity <a href="#team">Log ›</a></div><div class="feed">${activity.map((a) => `<div>${esc(describe(a))} · <span class="muted">${ago(a.at)}</span></div>`).join("") || '<div class="muted">No changes yet.</div>'}</div></div></div>`;
    $$(".bk", main).forEach((el) => el.addEventListener("click", () => go("book/" + el.dataset.id)));
  }
  function kpi(l, v, s, gold) { return `<div class="card kpi"><div class="l">${l}</div><div class="v ${gold ? "g" : ""}">${v}</div><div class="s">${s}</div></div>`; }
  function barChart(points) {
    if (!points?.length || points.every((p) => !p.n)) return '<div class="empty">No chapters read yet.<br><small>Reading numbers start with app update 1.1.</small></div>';
    const max = Math.max(...points.map((p) => p.n), 1);
    return `<div class="bars">${points.map((p) => `<i style="height:${Math.max(2, (p.n / max) * 100)}%" data-t="${esc(day(p.day))}: ${fmt(p.n)}"></i>`).join("")}</div>
      <div class="days"><span>${esc(day(points[0].day))}</span><span>peak ${fmt(max)}</span><span>${esc(day(points[points.length - 1].day))}</span></div>`;
  }
  function describe(a) {
    const who = (a.email || "Admin").split("@")[0], d = a.detail || {};
    switch (a.action) {
      case "setting": return `${who} set ${String(d.key).replace(/_/g, " ")} → ${typeof d.value === "object" ? "updated" : d.value}`;
      case "gift": return `${who} gifted ${d.coins ? d.coins + " coins" : "a chapter"}`;
      case "block": return `${who} blocked a reader`; case "unblock": return `${who} unblocked a reader`;
      case "publish": return `${who} published ${d.title}`; case "save_book": return `${who} saved ${d.title}`; case "delete_book": return `${who} deleted ${d.title}`;
      case "offer": return `${who} created offer “${d.title}”`; case "offer_toggle": return `${who} ${d.enabled ? "turned on" : "paused"} “${d.title}”`; case "offer_delete": return `${who} deleted offer “${d.title}”`;
      case "push": return `${who} ${d.scheduled ? "scheduled" : "sent"} push “${d.title}”`;
      case "add_admin": return `${who} added admin ${d.email}`; case "remove_admin": return `${who} removed an admin`;
      default: return `${who}: ${a.action}`;
    }
  }

  // =====================================================================
  // BOOKS
  // =====================================================================
  async function books(main) {
    await loadStories();
    const wk = await rpc("admin_stats", { days: 30 }).catch(() => ({ books: [] }));
    main.innerHTML = `<div class="top"><h1>Books</h1><div class="acts"><a class="btn gold" href="#book/new">＋ New book</a></div></div>
      <div class="card"><div class="ct">Your books <span class="muted">${stories.length} in the cloud · edit anything</span></div>
        <div class="table-wrap"><table><tr><th></th><th>Book</th><th>Status</th><th>Chapters</th><th>Free</th><th>Coins / chapter</th><th>Readers · 30 d</th><th>Featured</th><th></th></tr>
        ${stories.map((s) => { const st = (wk.books || []).find((x) => x.book === s.id);
          return `<tr class="click" data-id="${esc(s.id)}"><td>${s.cover_url ? `<img class="th" src="${esc(s.cover_url)}">` : ""}</td><td><b>${esc(s.title)}</b><br><small>${esc(s.genre)} · ${esc(s.author)}</small></td>
          <td><span class="tag ${s.published ? "ok" : ""}">${s.published ? "LIVE" : "DRAFT"}</span></td><td>${fmt(s.chapters)}</td>
          <td>${s.free_chapters ?? `<span class="muted">${S("free_chapters", 3)}</span>`}</td><td>${s.coins_per_chapter ?? `<span class="muted">${S("coins_per_chapter", 30)}</span>`}</td>
          <td>${fmt(st?.readers)}</td><td>${s.featured ? "⭐" : ""}</td><td><span class="link">Edit ›</span></td></tr>`; }).join("") || '<tr><td colspan="9" class="empty">No cloud books yet. Click “New book”.</td></tr>'}</table></div></div>
      <div class="card" style="margin-top:18px"><div class="ct">Built into the app <span class="muted">their numbers show everywhere; text changes need an app update</span></div>
        <div class="shelf">${builtIns().map((b) => `<div class="bk">${b.cover_url ? `<img class="cv" src="${esc(b.cover_url)}">` : `<div class="cv"></div>`}<div class="t">${esc(b.title)}</div><div class="m">${b.chapters} chapters · in the app</div></div>`).join("")}</div></div>`;
    $$("tr.click", main).forEach((tr) => tr.addEventListener("click", () => go("book/" + tr.dataset.id)));
  }

  // ---------- book editor ----------
  const ed = { id: null, isNew: true, coverUrl: null, coverFile: null, chapters: [], dirty: false };
  async function book(main, id) {
    if (id && C.builtIn[id] && !stories.some((s) => s.id === id)) { toast("This book is built into the app. Its numbers are in Stats."); return go("stats"); }
    const s = (id && id !== "new" && stories.find((x) => x.id === id)) || {};
    Object.assign(ed, { id: s.id || null, isNew: !s.id, coverUrl: s.cover_url || null, coverFile: null, chapters: [], dirty: false });
    main.innerHTML = `
      <div class="top"><div><div class="hi"><a href="#books">‹ All books</a></div><h1>${esc(s.title || "New book")}</h1></div>
        <div class="acts">${s.id ? '<button class="btn danger" id="del">Delete</button>' : ""}<button class="btn ghost" id="sv-draft">Save as draft</button><button class="btn" id="sv-pub">Publish</button><button class="btn gold" id="sv-notify">Publish &amp; notify 🔔</button></div></div>
      <p class="msg" id="ed-msg"></p>
      <div class="editor">
        <div><label class="drop ${s.cover_url ? "has" : ""}" id="drop"><img id="cov" src="${esc(s.cover_url || "")}" alt=""><span><b>⬆︎</b>Drop the cover<small>or click · portrait JPG/PNG</small></span><input id="cov-file" type="file" accept="image/*" hidden></label>
          <p class="muted" style="font-size:12px;margin-top:8px">We resize covers automatically for the app.</p></div>
        <div class="card">
          <label class="f">Title<input id="f-title" maxlength="80" value="${esc(s.title || "")}"></label>
          <div class="two"><label class="f">Author<input id="f-author" maxlength="60" value="${esc(s.author || "24/7 Originals")}"></label>
            <label class="f">Genre<select id="f-genre">${["Romance", "Fantasy", "Drama", "Thriller", "Mystery", "Horror", "Werewolf", "Billionaire", "Mafia", "Young Adult"].map((g) => `<option ${g === (s.genre || "Romance") ? "selected" : ""}>${g}</option>`).join("")}</select></label></div>
          <label class="f">Hook <small>(the one line under the title)</small><textarea id="f-hook" rows="2" maxlength="220">${esc(s.hook || "")}</textarea></label>
          <div class="three"><label class="f">Badge<select id="f-badge">${["", "NEW", "HOT", "TRENDING"].map((b) => `<option value="${b}" ${b === (s.badge || (s.id ? "" : "NEW")) ? "selected" : ""}>${b || "None"}</option>`).join("")}</select></label>
            <label class="f">Free chapters <small>(empty = ${S("free_chapters", 3)})</small><input id="f-free" type="number" min="0" max="50" value="${s.free_chapters ?? ""}"></label>
            <label class="f">Coins per chapter <small>(empty = ${S("coins_per_chapter", 30)})</small><input id="f-cost" type="number" min="0" max="500" value="${s.coins_per_chapter ?? ""}"></label></div>
          <div class="three"><label class="f">Colour 1<input id="f-c1" type="color" value="${/^#[0-9a-f]{6}$/i.test(s.color1 || "") ? s.color1 : "#2e1430"}"></label>
            <label class="f">Colour 2<input id="f-c2" type="color" value="${/^#[0-9a-f]{6}$/i.test(s.color2 || "") ? s.color2 : "#0a1c38"}"></label>
            <label class="f">Order <small>(lower = first)</small><input id="f-sort" type="number" value="${s.sort ?? (stories.length ? Math.min(...stories.map((x) => x.sort || 0)) - 1 : 0)}"></label></div>
          <div class="set"><div><b>Featured on the app's home carousel</b><small>Shows big at the top of Discover</small></div><button class="tog ${s.featured ? "on" : ""}" id="f-feat" type="button" aria-label="Featured"></button></div>
        </div>
        <div class="preview-col"><div class="muted center" style="font-size:12px;margin-bottom:8px">LIVE PREVIEW · as readers see it</div>
          <div class="phone"><div class="ps"><img class="hero" id="pv-hero" src="${esc(s.cover_url || "")}" alt=""><img class="pc" id="pv-cover" src="${esc(s.cover_url || "")}" alt="">
            <span class="pp" id="pv-pill"></span><div class="pt" id="pv-title"></div><div class="ph2" id="pv-hook"></div><div class="pb">📖 Read Chapter 1</div></div></div></div>
      </div>
      <div class="card" style="margin-top:18px"><div class="ct">Chapters <span class="muted" id="ch-count"></span></div>
        <div class="docx" id="docx"><b>Upload chapters from a Word file (.docx).</b> Every “Chapter 1”, “Chapter 2”… heading starts a new chapter; italics and bold are kept.
          <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;align-items:center"><label class="btn ghost small">Choose Word file<input id="docx-file" type="file" accept=".docx" hidden></label>
            <select id="docx-mode" style="width:auto"><option value="replace">Replace all chapters</option><option value="append">Add after the last chapter</option></select>
            <button class="btn ghost small" id="add-ch" type="button">＋ Write a chapter</button><span id="docx-res" class="muted"></span></div></div>
        <div class="chapter-list" id="ch-list"></div></div>`;
    const preview = () => {
      const t = $("#f-title").value || "Your title", b = $("#f-badge").value;
      $("#pv-title").textContent = t; $("#pv-hook").textContent = $("#f-hook").value || "Your one-line hook appears here.";
      $("#pv-pill").textContent = [b, $("#f-genre").value, ed.chapters.length ? ed.chapters.length + " ch" : ""].filter(Boolean).join(" · ");
    };
    ["f-title", "f-hook", "f-badge", "f-genre"].forEach((i) => $("#" + i).addEventListener("input", preview));
    $("#f-feat").addEventListener("click", (e) => e.currentTarget.classList.toggle("on"));
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
    drop.addEventListener("drop", (e) => { e.preventDefault(); pickCover(e.dataTransfer.files[0]); });
    $("#cov-file").addEventListener("change", (e) => pickCover(e.target.files[0]));
    const dz = $("#docx");
    ["dragenter", "dragover"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => dz.addEventListener(t, () => dz.classList.remove("over")));
    dz.addEventListener("drop", (e) => { e.preventDefault(); importDocx(e.dataTransfer.files[0]); });
    $("#docx-file").addEventListener("change", (e) => importDocx(e.target.files[0]));
    $("#add-ch").addEventListener("click", () => openChapter(ed.chapters.length, true));
    $("#sv-draft").addEventListener("click", () => saveBook(false, false));
    $("#sv-pub").addEventListener("click", () => saveBook(true, false));
    $("#sv-notify").addEventListener("click", () => saveBook(true, true));
    $("#del")?.addEventListener("click", deleteBook);
    if (s.id) {
      const { data } = await sb.from("chapters").select("index,title,paragraphs").eq("book_id", s.id).order("index");
      ed.chapters = data || [];
    }
    renderChapters(); preview();
    function pickCover(file) {
      if (!file || !/^image\//.test(file.type)) return toast("Please choose an image.");
      ed.coverFile = file; const r = new FileReader();
      r.onload = () => { $("#cov").src = r.result; $("#pv-cover").src = r.result; $("#pv-hero").src = r.result; drop.classList.add("has"); }; r.readAsDataURL(file);
    }
  }
  function renderChapters() {
    const free = Number($("#f-free")?.value || S("free_chapters", 3));
    $("#ch-count").textContent = ed.chapters.length ? `${fmt(ed.chapters.length)} chapters · first ${free} free${ed.dirty ? " · not saved yet" : ""}` : "";
    $("#ch-list").innerHTML = ed.chapters.map((c, i) => `<div class="ch" data-i="${i}"><div class="n">${i + 1}</div><div class="t">${esc(c.title)}</div>${i < free ? '<span class="tag gold">FREE</span>' : ""}<span class="w">${fmt(c.paragraphs.join(" ").split(/\s+/).filter(Boolean).length)} words</span></div>`).join("")
      || '<div class="empty">No chapters yet. Upload a Word file or write one.</div>';
    $$(".ch").forEach((r) => r.addEventListener("click", () => openChapter(Number(r.dataset.i))));
    const pill = $("#pv-pill"); if (pill) pill.textContent = [$("#f-badge").value, $("#f-genre").value, ed.chapters.length ? ed.chapters.length + " ch" : ""].filter(Boolean).join(" · ");
  }
  function openChapter(i, isNew = false) {
    const c = ed.chapters[i] || { title: `Chapter ${i + 1}`, paragraphs: [] };
    const m = openModal(`<div class="ct">${isNew ? "New chapter" : "Chapter " + (i + 1)} <button class="link" id="cm-x">Close</button></div>
      <label class="f">Title<input id="cm-t" value="${esc(c.title)}"></label>
      <label class="f">Text <small>(blank line between paragraphs · *italic* · **bold**)</small><textarea id="cm-b" rows="16">${esc(c.paragraphs.join("\n\n"))}</textarea></label>
      <div class="top" style="margin:0">${isNew ? "<span></span>" : '<button class="btn danger" id="cm-d">Delete chapter</button>'}<button class="btn gold" id="cm-s">Keep changes</button></div>`, true);
    $("#cm-x", m).onclick = closeModal;
    $("#cm-s", m).onclick = () => {
      const paras = $("#cm-b", m).value.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
      if (!paras.length) return toast("A chapter needs some text.");
      ed.chapters[i] = { index: i, title: $("#cm-t", m).value.trim() || `Chapter ${i + 1}`, paragraphs: paras };
      ed.dirty = true; closeModal(); renderChapters(); toast("Chapter kept. Press Save or Publish.");
    };
    $("#cm-d", m)?.addEventListener("click", () => {
      if (!confirm(`Delete chapter ${i + 1}? Later chapters move up.`)) return;
      ed.chapters.splice(i, 1); ed.chapters = ed.chapters.map((x, k) => ({ ...x, index: k })); ed.dirty = true; closeModal(); renderChapters();
    });
  }
  const NUMW = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred";
  const CH_RE = new RegExp(`^\\s*(?:chapter|ch\\.?)\\s+((?:\\d+)|(?:[ivxlcdm]+)|(?:(?:${NUMW})(?:[\\s-]+(?:${NUMW}))*))\\b\\s*[:.\\-–—]?\\s*(.*)$`, "i");
  function inline(node) { let o = ""; node.childNodes.forEach((n) => {
    if (n.nodeType === 3) o += n.textContent;
    else if (/^(STRONG|B)$/.test(n.nodeName)) { const t = inline(n); o += t.trim() ? `**${t}**` : t; }
    else if (/^(EM|I)$/.test(n.nodeName)) { const t = inline(n); o += t.trim() ? `*${t}*` : t; }
    else if (n.nodeName === "BR") o += " "; else o += inline(n); }); return o; }
  async function importDocx(file) {
    if (!file) return; if (!/\.docx$/i.test(file.name)) return toast("Please choose a Word .docx file.");
    const res = $("#docx-res"); res.textContent = "Reading " + file.name + "…";
    try {
      const { value } = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      const doc = new DOMParser().parseFromString(value, "text/html");
      const blocks = [...doc.body.children].map((el) => ({ tag: el.tagName, text: inline(el).replace(/\s+/g, " ").trim(), plain: el.textContent.replace(/\s+/g, " ").trim() })).filter((b) => b.plain);
      const out = []; let cur = null, skipped = 0, pend = false;
      for (const b of blocks) {
        const m = b.plain.length < 120 ? b.plain.match(CH_RE) : null;
        if (m) { cur = { title: (m[2] || "").replace(/^[\s:.\-–—]+/, "").trim(), paragraphs: [] }; pend = !cur.title; out.push(cur); continue; }
        if (/^\s*part\s+([0-9]+|[ivxlcdm]+|[a-z]+)\b/i.test(b.plain) && b.plain.length < 80) continue;
        if (!cur) { skipped++; continue; }
        if (pend && /^H[1-6]$/.test(b.tag) && b.plain.length < 90) { cur.title = b.plain; pend = false; continue; }
        pend = false; cur.paragraphs.push(b.text);
      }
      const good = out.filter((c) => c.paragraphs.length);
      if (!good.length) { res.textContent = "No “Chapter 1, Chapter 2…” headings found."; return; }
      const append = $("#docx-mode").value === "append", st = append ? ed.chapters.length : 0;
      const mapped = good.map((c, i) => ({ index: st + i, title: c.title || `Chapter ${st + i + 1}`, paragraphs: c.paragraphs }));
      ed.chapters = append ? ed.chapters.concat(mapped) : mapped; ed.dirty = true; renderChapters();
      res.innerHTML = `<b style="color:var(--ok)">✓ ${fmt(good.length)} chapters ${append ? "added" : "found"}</b>${skipped ? ` · ${skipped} lines before Chapter 1 skipped` : ""} · press Save or Publish`;
    } catch (err) { res.textContent = "Couldn't read that file: " + err.message; }
  }
  async function resized(file) {
    const img = await createImageBitmap(file), k = Math.min(1, 900 / img.width, 1350 / img.height);
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return await new Promise((r) => c.toBlob(r, "image/jpeg", 0.86));
  }
  async function saveBook(published, notify) {
    const msg = $("#ed-msg"), title = $("#f-title").value.trim(), hook = $("#f-hook").value.trim();
    if (!title) return setMsg(msg, "Please add a title.", true);
    if (!hook) return setMsg(msg, "Please add the one-line hook.", true);
    if (published && !ed.chapters.length) return setMsg(msg, "Add chapters before publishing.", true);
    if (published && !ed.coverUrl && !ed.coverFile) return setMsg(msg, "Add a cover before publishing.", true);
    $$(".top .acts .btn").forEach((b) => (b.disabled = true));
    try {
      let id = ed.id;
      if (!id) { id = slugify(title); const taken = new Set([...stories.map((s) => s.id), ...Object.keys(C.builtIn)]); let n = 2; const base = id; while (taken.has(id)) id = `${base}-${n++}`; }
      if (ed.coverFile) {
        setMsg(msg, "Uploading cover…"); const path = `${id}/cover-${Date.now()}.jpg`;
        const up = await sb.storage.from("covers").upload(path, await resized(ed.coverFile), { contentType: "image/jpeg", upsert: true });
        if (up.error) throw up.error; ed.coverUrl = sb.storage.from("covers").getPublicUrl(path).data.publicUrl; ed.coverFile = null;
      }
      const num = (v) => (v === "" || v == null ? null : Number(v));
      const row = { id, title, author: $("#f-author").value.trim() || "24/7 Originals", genre: $("#f-genre").value, hook, chapters: ed.chapters.length,
        badge: $("#f-badge").value || null, cover_url: ed.coverUrl, hero_url: ed.coverUrl, color1: $("#f-c1").value, color2: $("#f-c2").value,
        sort: Number($("#f-sort").value) || 0, published, featured: $("#f-feat").classList.contains("on"),
        free_chapters: num($("#f-free").value), coins_per_chapter: num($("#f-cost").value), updated_at: new Date().toISOString() };
      if (ed.isNew) { row.rating = 0; row.views = "New"; }
      setMsg(msg, "Saving book…"); const r = await sb.from("stories").upsert(row); if (r.error) throw r.error;
      if (ed.dirty) {
        const del = await sb.from("chapters").delete().eq("book_id", id); if (del.error) throw del.error;
        for (let i = 0; i < ed.chapters.length; i += 50) {
          const ins = await sb.from("chapters").insert(ed.chapters.slice(i, i + 50).map((c, k) => ({ book_id: id, index: i + k, title: c.title, paragraphs: c.paragraphs })));
          if (ins.error) throw ins.error; setMsg(msg, `Saving chapters… ${Math.min(i + 50, ed.chapters.length)} / ${ed.chapters.length}`);
        }
        ed.dirty = false;
      }
      const was = ed.isNew; Object.assign(ed, { id, isNew: false }); await loadStories();
      logAction(published ? "publish" : "save_book", { id, title });
      setMsg(msg, published ? "✓ Live in the app. Readers see it next time they open 24/7 Books." : "✓ Saved as draft (hidden from readers).");
      if (notify) { const sent = await sendPush({ title: `New book: ${title} 📖`, body: hook, book_id: id, audience: { kind: "everyone" } }); setMsg(msg, sent.ok ? `✓ Live and sent to ${fmt(sent.sent)} phones.` : `✓ Live in the app. Notification: ${sent.error}`, !sent.ok); }
      if (was) history.replaceState(null, "", "#book/" + encodeURIComponent(id));
      renderChapters();
    } catch (err) { setMsg(msg, "Couldn't save: " + (err.message || err), true); }
    finally { $$(".top .acts .btn").forEach((b) => (b.disabled = false)); }
  }
  async function deleteBook() {
    const t = $("#f-title").value;
    if (!confirm(`Delete “${t}” and all its chapters? Readers will no longer see it. This can't be undone.`)) return;
    const a = await sb.from("chapters").delete().eq("book_id", ed.id); const b = a.error ? a : await sb.from("stories").delete().eq("id", ed.id);
    if (b.error) return setMsg($("#ed-msg"), "Couldn't delete: " + b.error.message, true);
    logAction("delete_book", { id: ed.id, title: t }); await loadStories(); toast("Book deleted."); go("books");
  }

  // =====================================================================
  // STATS
  // =====================================================================
  let statDays = 30, funnelBook = "moonless";
  async function stats(main) {
    const st = await rpc("admin_stats", { days: statDays }), prev = await rpc("admin_stats", { days: statDays * 2 }).catch(() => null);
    const rev = revenueOf(st.purchases), revPrev = prev ? revenueOf(prev.purchases) - rev : 0;
    const delta = (a, b) => (b > 0 ? `<span class="${a >= b ? "up" : "down"}">${a >= b ? "▲" : "▼"} ${Math.abs(Math.round(((a - b) / b) * 100))}%</span> vs before` : "");
    const prodRows = Object.entries(st.purchases || {}).sort((a, b) => (C.prices[b[0]] || 0) * b[1] - (C.prices[a[0]] || 0) * a[1]);
    main.innerHTML = `<div class="top"><h1>Stats</h1><div class="pills" id="range">${[7, 30, 90].map((d) => `<button class="pill ${d === statDays ? "on" : ""}" data-d="${d}">${d} days</button>`).join("")}</div></div>
      <div class="grid4" style="margin-bottom:18px">
        ${kpi("Earned (before Apple's share)", money(rev), delta(rev, revPrev), true)}${kpi("Readers", fmt(st.readers), `${fmt(st.accounts)} accounts · ${fmt(st.active_today)} today`)}
        ${kpi("Chapters read", fmt(st.chapters_read), `${fmt(Math.round(st.chapters_read / statDays))} a day`)}${kpi("Unlocks", fmt((st.coin_unlocks || 0) + (st.free_unlocks || 0) + (st.ad_unlocks || 0)), `${fmt(st.coin_unlocks)} coins · ${fmt(st.ad_unlocks)} video · ${fmt(st.free_unlocks)} free`)}</div>
      <div class="row"><div class="card" style="flex:1.5"><div class="ct">Chapters read per day</div>${barChart(st.daily)}</div>
        <div class="card"><div class="ct">Money by product <span class="muted">Apple-verified</span></div><div class="table-wrap"><table><tr><th>Product</th><th>Sold</th><th>Earned</th></tr>
          ${prodRows.map(([p, n]) => `<tr><td>${esc(productName(p))}</td><td>${fmt(n)}</td><td>${money((C.prices[p] || 0) * n)}</td></tr>`).join("") || '<tr><td colspan="3" class="empty">No purchases in this period.</td></tr>'}</table></div>
          <p class="muted" style="font-size:12px;margin:10px 0 0">${fmt(st.paywall_views)} people opened the VIP screen · ${fmt(st.vip_members)} VIP now</p></div></div>
      <div class="row"><div class="card" style="flex:1.5"><div class="ct">Books</div><div class="table-wrap"><table><tr><th></th><th>Book</th><th>Readers</th><th>Chapters read</th><th>Per reader</th><th>Coin unlocks</th><th>Free/video unlocks</th></tr>
          ${(st.books || []).map((b) => `<tr><td>${coverOf(b.book) ? `<img class="th" src="${esc(coverOf(b.book))}">` : ""}</td><td><b>${esc(bookName(b.book))}</b></td><td>${fmt(b.readers)}</td><td>${fmt(b.chapters_read)}</td><td>${b.readers ? (b.chapters_read / b.readers).toFixed(1) : "—"}</td><td>${fmt(b.coin_unlocks)}</td><td>${fmt(b.free_unlocks)}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">No reading yet in this period.</td></tr>'}</table></div></div>
        <div class="card"><div class="ct">Where readers stop <select id="fb" style="width:auto;padding:6px 10px;font-size:13px">${allBooks().map((b) => `<option value="${esc(b.id)}" ${b.id === funnelBook ? "selected" : ""}>${esc(b.title)}</option>`).join("")}</select></div><div id="funnel"></div></div></div>`;
    $$("#range .pill", main).forEach((p) => p.addEventListener("click", () => { statDays = Number(p.dataset.d); route(); }));
    $("#fb", main).addEventListener("change", (e) => { funnelBook = e.target.value; drawFunnel(); }); drawFunnel();
  }
  async function drawFunnel() {
    const box = $("#funnel"); if (!box) return;
    const data = await rpc("admin_funnel", { book: funnelBook, days: 90 }).catch(() => []);
    if (!data.length) { box.innerHTML = '<div class="empty">No reads recorded for this book yet.</div>'; return; }
    const free = stories.find((s) => s.id === funnelBook)?.free_chapters ?? S("free_chapters", 3);
    const first = data.find((r) => r.chapter === 1)?.readers || Math.max(...data.map((r) => r.readers));
    const last = Math.max(...data.map((r) => r.chapter)), reached = (c) => Math.max(0, ...data.filter((r) => r.chapter >= c).map((r) => r.readers));
    const marks = [...new Set([1, free, free + 1, 5, 10, 20, 50, 100, 200, last])].filter((c) => c >= 1 && c <= last).sort((a, b) => a - b);
    box.innerHTML = marks.map((c) => { const n = reached(c), pct = first ? Math.round((n / first) * 100) : 0;
      return `<div class="fr"><span>${c === free ? `Ch ${c} · last free` : c === free + 1 ? `Ch ${c} · first paid` : `Chapter ${c}`}</span><div class="b"><i style="width:${Math.min(100, pct)}%"></i></div><b>${pct}%</b><em>${fmt(n)}</em></div>`; }).join("")
      + `<div class="tip" style="margin-top:12px">💡 ${Math.round((reached(free + 1) / first) * 100 || 0)}% keep reading after the first paid chapter. A weekend offer on chapter ${free + 1} often lifts this.</div>`;
  }

  // =====================================================================
  // READERS
  // =====================================================================
  let readerList = [], selReader = null, readerQ = "";
  async function readers(main) {
    main.innerHTML = `<div class="top"><div><h1>Readers</h1><div class="hi">Signed-in readers (guests have no account)</div></div>
      <div class="acts"><input id="rq" placeholder="🔍 Search email…" style="width:300px" value="${esc(readerQ)}"><button class="btn ghost" id="rx">⤓ Export</button></div></div>
      <div class="row" style="align-items:flex-start"><div class="card" style="flex:1.5;padding:8px 14px"><div class="table-wrap" id="rtable"><div class="empty">Loading…</div></div></div>
      <div class="card" id="rcard"><div class="empty">Click a reader to see coins, purchases and reading, and to gift coins or restore a chapter.</div></div></div>`;
    let t; $("#rq", main).addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { readerQ = e.target.value.trim(); loadReaders(); }, 300); });
    $("#rx", main).addEventListener("click", exportReaders);
    await loadReaders();
  }
  const spentOf = (r) => revenueOf(r.purchases);
  async function loadReaders() {
    readerList = await rpc("admin_readers", { q: readerQ, lim: 200 });
    const box = $("#rtable"); if (!box) return;
    box.innerHTML = `<table><tr><th>Reader</th><th>Coins</th><th>Spent</th><th>Chapters</th><th>Last seen</th><th></th></tr>
      ${readerList.map((r, i) => `<tr class="click ${selReader === r.id ? "sel" : ""}" data-i="${i}"><td><span class="av2">${esc((r.email || "?")[0].toUpperCase())}</span>${esc(r.email || "Apple account")}</td>
        <td>${fmt(r.coins)}</td><td>${money(spentOf(r))}</td><td>${fmt(r.chapters_read)}</td><td>${ago(r.last_seen)}</td>
        <td>${r.blocked ? '<span class="tag bad">blocked</span>' : r.is_vip ? '<span class="tag gold">VIP</span>' : spentOf(r) ? '<span class="tag">buyer</span>' : '<span class="tag">reader</span>'}</td></tr>`).join("")
      || '<tr><td colspan="6" class="empty">No readers found.</td></tr>'}</table>`;
    $$("tr.click", box).forEach((tr) => tr.addEventListener("click", () => showReader(readerList[Number(tr.dataset.i)])));
    if (selReader) { const r = readerList.find((x) => x.id === selReader); if (r) showReader(r); }
  }
  function showReader(r) {
    selReader = r.id; $$("#rtable tr.click").forEach((tr) => tr.classList.toggle("sel", readerList[Number(tr.dataset.i)]?.id === r.id));
    const reading = Object.entries(r.last_read || {}).map(([b, i]) => `${esc(bookName(b))}, chapter ${Number(i) + 1}`);
    const buys = Object.entries(r.purchases || {}).map(([p, n]) => `${n}× ${esc(productName(p))}`);
    $("#rcard").innerHTML = `<div class="ct">${esc(r.email || "Apple account")} <span class="muted">since ${day(r.created_at)}</span></div>
      <div class="three" style="margin-bottom:14px">${[["coins", fmt(r.coins)], ["spent", money(spentOf(r))], ["chapters", fmt(r.chapters_read)]].map(([l, v]) => `<div class="card kpi" style="padding:12px;text-align:center"><div class="v" style="font-size:24px">${v}</div><div class="s">${l}</div></div>`).join("")}</div>
      <div class="feed"><div>${r.is_vip ? "👑 <b>VIP member</b>" : "Not VIP"}</div><div>🛒 ${buys.join(" · ") || "No purchases"}${r.last_purchase ? ` · last ${ago(r.last_purchase)}` : ""}</div><div>📖 ${reading.join(" · ") || "No reading saved"}</div><div>Last seen ${ago(r.last_seen)}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn gold" id="g-coins">🎁 Gift coins</button><button class="btn ghost" id="g-ch">↺ Restore a chapter</button>
        <button class="btn ${r.blocked ? "ghost" : "danger"}" id="g-block">${r.blocked ? "Unblock" : "⛔ Block"}</button></div>
      <p class="muted" style="font-size:12px;margin-top:10px">Gifts reach the reader the next time they open the app.</p>`;
    $("#g-coins").onclick = () => {
      const m = openModal(`<div class="ct">Gift coins to ${esc(r.email)}</div><label class="f">Coins<input id="gc" type="number" min="1" max="100000" value="100"></label>
        <label class="f">Note <small>(only you see this)</small><input id="gn" placeholder="e.g. refund for missing chapter"></label>
        <div class="top" style="margin:0"><button class="btn ghost" id="gx">Cancel</button><button class="btn gold" id="gs">Send gift</button></div>`);
      $("#gx", m).onclick = closeModal;
      $("#gs", m).onclick = async () => { const n = Number($("#gc", m).value); if (!(n > 0)) return toast("Enter a number of coins.");
        try { await rpc("admin_gift", { uid: r.id, coins: n, unlock_key: null, note: $("#gn", m).value || null }); closeModal(); toast(`🎁 ${fmt(n)} coins sent. They arrive when ${r.email} opens the app.`); } catch (e) { toast(e.message); } };
    };
    $("#g-ch").onclick = () => {
      const m = openModal(`<div class="ct">Restore a chapter for ${esc(r.email)}</div>
        <div class="two"><label class="f">Book<select id="rb">${allBooks().map((b) => `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join("")}</select></label><label class="f">Chapter number<input id="rc" type="number" min="1" value="4"></label></div>
        <div class="top" style="margin:0"><button class="btn ghost" id="rx2">Cancel</button><button class="btn gold" id="rs">Restore</button></div>`);
      $("#rx2", m).onclick = closeModal;
      $("#rs", m).onclick = async () => { const b = $("#rb", m).value, c = Number($("#rc", m).value); if (!(c >= 1)) return toast("Enter a chapter number.");
        try { await rpc("admin_gift", { uid: r.id, coins: 0, unlock_key: `${b}-${c - 1}`, note: "restore chapter" }); closeModal(); toast(`Chapter ${c} of ${bookName(b)} restored.`); } catch (e) { toast(e.message); } };
    };
    $("#g-block").onclick = async () => {
      if (!r.blocked && !confirm(`Block ${r.email}? They won't be able to read.`)) return;
      try { await rpc("admin_set_blocked", { uid: r.id, is_blocked: !r.blocked }); toast(r.blocked ? "Unblocked." : "Blocked."); await loadReaders(); } catch (e) { toast(e.message); }
    };
  }
  function exportReaders() {
    const rows = [["email", "coins", "spent_usd", "vip", "chapters_read", "last_seen", "blocked"], ...readerList.map((r) => [r.email, r.coins, spentOf(r).toFixed(2), r.is_vip, r.chapters_read, r.last_seen || "", r.blocked])];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `24-7-books-readers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  // =====================================================================
  // MONEY & OFFERS
  // =====================================================================
  const MONEY = [["coins_per_chapter", "Coins per chapter", "default · each book can override", 30, 0, 500, 5],
    ["free_chapters", "Free chapters per book", "before coins are needed", 3, 0, 20, 1], ["free_unlock_hours", "Free unlock every", "hours", 4, 1, 48, 1],
    ["daily_reward", "Daily reward", "coins for opening the app each day", 15, 0, 200, 5], ["streak_reward", "Reading streak reward", "coins per day of streak", 5, 0, 100, 1],
    ["daily_goal_reward", "Daily goal reward", "coins for reading 3 chapters a day", 20, 0, 200, 5], ["rewarded_ad_coins", "Video-ad reward", "coins per rewarded video", 20, 0, 200, 5],
    ["welcome_coins", "Welcome coins", "for new readers", 30, 0, 500, 5]];
  function stepper(key, label, sub, def, min, max, stepBy) {
    return `<div class="set"><div><b>${label}</b><small>${sub}</small></div><div class="step" data-k="${key}" data-min="${min}" data-max="${max}" data-s="${stepBy}">
      <button type="button" data-d="-1">−</button><em>${fmt(S(key, def))}</em><button type="button" data-d="1">＋</button></div></div>`;
  }
  function wireSteppers(root) {
    $$(".step", root).forEach((st) => $$("button", st).forEach((b) => b.addEventListener("click", async () => {
      const k = st.dataset.k, cur = Number(settings[k] ?? Number(st.querySelector("em").textContent.replace(/,/g, "")));
      const v = Math.max(Number(st.dataset.min), Math.min(Number(st.dataset.max), cur + Number(b.dataset.d) * Number(st.dataset.s)));
      st.querySelector("em").textContent = fmt(v); clearTimeout(st._t);
      st._t = setTimeout(async () => { if (await saveSetting(k, v)) { const s = $("#saved"); if (s) { s.textContent = "✓ Saved · live in the app within a minute"; } } }, 450);
    })));
  }
  function toggle(key, label, sub, def = true) { const on = S(key, def) === true; return `<div class="set"><div><b>${label}</b><small>${sub}</small></div><button class="tog ${on ? "on" : ""}" data-k="${key}" type="button" aria-label="${label}"></button></div>`; }
  function wireToggles(root) { $$(".tog[data-k]", root).forEach((t) => t.addEventListener("click", async () => { const v = !t.classList.contains("on"); t.classList.toggle("on", v); if (await saveSetting(t.dataset.k, v)) toast(`${v ? "On" : "Off"} · live in the app within a minute`); })); }
  const KIND = { free_chapter: "Free chapter", double_rewards: "Double rewards", unlock_discount: "Cheaper chapters" };
  async function moneyPage(main) {
    await Promise.all([loadSettings(), loadPromos()]);
    const now = Date.now(), state = (p) => !p.enabled ? ["PAUSED", ""] : new Date(p.ends_at) <= now ? ["ENDED", ""] : new Date(p.starts_at) > now ? ["SCHEDULED", "blue"] : ["LIVE", "ok"];
    main.innerHTML = `<div class="top"><div><h1>Money &amp; offers</h1><div class="hi">Changes reach the app within a minute (app 1.1 and later)</div></div><div class="acts"><button class="btn gold" id="new-offer">＋ New offer</button></div></div>
      <div class="row" style="align-items:flex-start"><div class="card"><div class="ct">Coins &amp; rewards</div>${MONEY.map((m) => stepper(...m)).join("")}<p class="msg" id="saved"></p>
        <p class="muted" style="font-size:12px;margin:6px 0 0">Coin pack and VIP prices are set in App Store Connect (Apple's rule).</p></div>
        <div class="card"><div class="ct">Offers</div>${promos.map((p) => { const [s, c] = state(p);
          return `<div class="promo ${p.enabled ? "" : "off"}"><div class="grow"><div class="pt">${esc(p.title)}</div><div class="pd">${KIND[p.kind]}${p.params?.chapter ? " · chapter " + p.params.chapter : ""}${p.params?.coins != null ? " · " + p.params.coins + " coins" : ""} · ${esc(p.book_id ? bookName(p.book_id) : "All books")}<br>${esc(when(p.starts_at))} → ${esc(when(p.ends_at))}</div></div>
            <span class="tag ${c}">${s}</span><button class="tog ${p.enabled ? "on" : ""}" data-p="${p.id}" type="button" aria-label="On/off"></button><button class="link" data-del="${p.id}">Delete</button></div>`; }).join("") || '<div class="empty">No offers yet. Try “Chapter 4 free this weekend”.</div>'}</div></div>`;
    wireSteppers(main);
    $("#new-offer", main).addEventListener("click", newOffer);
    $$("[data-p]", main).forEach((t) => t.addEventListener("click", async () => { const p = promos.find((x) => x.id === t.dataset.p), v = !p.enabled;
      const { error } = await sb.from("promotions").update({ enabled: v }).eq("id", p.id); if (error) return toast(error.message); logAction("offer_toggle", { title: p.title, enabled: v }); route(); }));
    $$("[data-del]", main).forEach((b) => b.addEventListener("click", async () => { const p = promos.find((x) => x.id === b.dataset.del); if (!confirm(`Delete offer “${p.title}”?`)) return;
      const { error } = await sb.from("promotions").delete().eq("id", p.id); if (error) return toast(error.message); logAction("offer_delete", { title: p.title }); route(); }));
  }
  function newOffer() {
    const fri = new Date(); fri.setDate(fri.getDate() + ((5 - fri.getDay() + 7) % 7 || 7)); fri.setHours(18, 0, 0, 0);
    const sun = new Date(fri); sun.setDate(sun.getDate() + 2); sun.setHours(23, 59, 0, 0);
    const m = openModal(`<div class="ct">New offer</div>
      <label class="f">Type<select id="o-k"><option value="free_chapter">Free chapter (e.g. chapter 4 free)</option><option value="unlock_discount">Cheaper chapters (fewer coins)</option><option value="double_rewards">Double rewards (daily, streak, video)</option></select></label>
      <label class="f">Title <small>(shown in the app)</small><input id="o-t" value="Chapter 4 free this weekend 🎉"></label>
      <div class="two"><label class="f">Book<select id="o-b"><option value="">All books</option>${allBooks().map((b) => `<option value="${esc(b.id)}" ${b.id === "moonless" ? "selected" : ""}>${esc(b.title)}</option>`).join("")}</select></label>
        <label class="f" id="o-px">Chapter number<input id="o-p" type="number" min="1" value="4"></label></div>
      <div class="two"><label class="f">Starts<input id="o-s" type="datetime-local" value="${localInput(fri)}"></label><label class="f">Ends<input id="o-e" type="datetime-local" value="${localInput(sun)}"></label></div>
      <div class="top" style="margin:0"><button class="btn ghost" id="o-x">Cancel</button><button class="btn gold" id="o-save">Create offer</button></div>`);
    const kindSel = $("#o-k", m), px = $("#o-px", m);
    kindSel.onchange = () => { const k = kindSel.value; px.style.visibility = k === "double_rewards" ? "hidden" : "visible";
      px.firstChild.textContent = k === "unlock_discount" ? "Coins per chapter during offer" : "Chapter number"; $("#o-p", m).value = k === "unlock_discount" ? 15 : 4;
      $("#o-t", m).value = k === "free_chapter" ? "Chapter 4 free this weekend 🎉" : k === "unlock_discount" ? "Half-price chapters 🔥" : "Double rewards weekend ✨"; };
    $("#o-x", m).onclick = closeModal;
    $("#o-save", m).onclick = async () => {
      const k = kindSel.value, n = Number($("#o-p", m).value), s = new Date($("#o-s", m).value), e = new Date($("#o-e", m).value);
      if (!(e > s)) return toast("The end must be after the start.");
      const params = k === "free_chapter" ? { chapter: n } : k === "unlock_discount" ? { coins: n } : {};
      const row = { title: $("#o-t", m).value.trim() || KIND[k], kind: k, book_id: $("#o-b", m).value || null, params, starts_at: s.toISOString(), ends_at: e.toISOString(), enabled: true };
      const { error } = await sb.from("promotions").insert(row); if (error) return toast(error.message);
      logAction("offer", { title: row.title }); closeModal(); toast("Offer created."); route();
    };
  }

  // =====================================================================
  // NOTIFICATIONS
  // =====================================================================
  let aud = { kind: "everyone" };
  async function notify(main) {
    const history = await rpc("admin_push_history", { lim: 30 }).catch(() => []);
    const AUD = [["everyone", "Everyone"], ["book", "Readers of a book"], ["inactive", "Stopped 3+ days"], ["never_bought", "Never bought"], ["vip", "VIP"]];
    main.innerHTML = `<div class="top"><div><h1>Notifications</h1><div class="hi">Send now or schedule · see how many opened</div></div></div>
      <div class="row" style="align-items:flex-start"><div class="card" style="flex:1.2">
        <div class="ct">Who <span class="muted" id="aud-n"></span></div>
        <div class="pills" id="aud">${AUD.map(([k, l]) => `<button class="pill ${aud.kind === k ? "on" : ""}" data-k="${k}">${l}</button>`).join("")}</div>
        <div id="aud-book" style="margin-top:10px;${aud.kind === "book" ? "" : "display:none"}"><select id="n-ab">${allBooks().map((b) => `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join("")}</select></div>
        <div style="margin-top:16px"><label class="f">Title<input id="n-t" maxlength="60" placeholder="New chapter: Moonless 15 🌕"></label>
        <label class="f">Message<textarea id="n-b" rows="3" maxlength="180" placeholder="Wren finally hears the call. Tap to keep reading."></textarea></label>
        <div class="two"><label class="f">Open this book when tapped<select id="n-bk"><option value="">Just open the app</option>${allBooks().map((b) => `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join("")}</select></label>
          <label class="f">When<select id="n-w"><option value="now">Send now</option><option value="later">Schedule…</option></select></label></div>
        <label class="f" id="n-atw" style="display:none">Send at<input id="n-at" type="datetime-local" value="${localInput(Date.now() + 3600e3)}"></label></div>
        <div class="top" style="margin:6px 0 0"><span class="muted" style="font-size:12px">Tip: 1–2 pushes a week keeps readers coming back.</span><button class="btn gold" id="n-send">Send</button></div><p class="msg" id="n-msg"></p></div>
      <div class="card"><div class="ct">Preview on the lock screen</div><div class="lock"><div class="npush"><div class="ic"></div><div><b id="pv-t">New chapter: Moonless 15 🌕</b><p id="pv-b">Wren finally hears the call. Tap to keep reading.</p></div></div></div></div></div>
      <div class="card"><div class="ct">History</div><div class="table-wrap"><table><tr><th>When</th><th>Message</th><th>Who</th><th>Status</th><th>Sent</th><th>Opened</th><th></th></tr>
        ${history.map((h) => `<tr><td>${esc(when(h.send_at))}</td><td><b>${esc(h.title)}</b><br><small>${esc(h.body)}</small></td><td>${esc(audLabel(h.audience))}</td>
          <td><span class="tag ${h.status === "sent" ? "ok" : h.status === "failed" ? "bad" : h.status === "scheduled" ? "blue" : ""}">${esc(h.status)}</span>${h.error ? `<br><small class="muted">${esc(h.error).slice(0, 60)}</small>` : ""}</td>
          <td>${fmt(h.sent)}</td><td>${h.sent ? `${fmt(h.opened)} · ${Math.round((h.opened / h.sent) * 100)}%` : fmt(h.opened)}</td>
          <td>${h.status === "scheduled" ? `<button class="link" data-cancel="${h.id}">Cancel</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">No notifications yet.</td></tr>'}</table></div></div>`;
    const refreshSize = async () => { const a = currentAud(); $("#aud-n").textContent = "…"; const n = await rpc("admin_audience_size", { audience: a }).catch(() => null); $("#aud-n").textContent = n == null ? "" : `${fmt(n)} phones`; };
    $$("#aud .pill", main).forEach((p) => p.addEventListener("click", () => { aud = { kind: p.dataset.k }; $$("#aud .pill").forEach((x) => x.classList.toggle("on", x === p)); $("#aud-book").style.display = aud.kind === "book" ? "" : "none"; refreshSize(); }));
    $("#n-ab", main).addEventListener("change", refreshSize);
    $("#n-w", main).addEventListener("change", (e) => { $("#n-atw").style.display = e.target.value === "later" ? "" : "none"; $("#n-send").textContent = e.target.value === "later" ? "Schedule" : "Send"; });
    ["n-t", "n-b"].forEach((i) => $("#" + i, main).addEventListener("input", () => { $("#pv-t").textContent = $("#n-t").value || "Title"; $("#pv-b").textContent = $("#n-b").value || "Message"; }));
    $("#n-send", main).addEventListener("click", async () => {
      const title = $("#n-t").value.trim(), body = $("#n-b").value.trim(); if (!title || !body) return setMsg($("#n-msg"), "Add a title and a message.", true);
      const later = $("#n-w").value === "later", at = later ? new Date($("#n-at").value) : new Date();
      if (later && !(at > new Date())) return setMsg($("#n-msg"), "Pick a time in the future.", true);
      if (!confirm(`${later ? "Schedule" : "Send"} “${title}” to ${$("#aud-n").textContent || "these readers"}?`)) return;
      setMsg($("#n-msg"), later ? "Scheduling…" : "Sending…");
      const r = await sendPush({ title, body, book_id: $("#n-bk").value || null, audience: currentAud(), send_at: at.toISOString() }, later);
      setMsg($("#n-msg"), r.ok ? (later ? `✓ Scheduled for ${when(at)}.` : `✓ Sent to ${fmt(r.sent)} phones.`) : r.error, !r.ok); setTimeout(route, 1500);
    });
    $$("[data-cancel]", main).forEach((b) => b.addEventListener("click", async () => { await sb.from("push_messages").update({ status: "cancelled" }).eq("id", b.dataset.cancel); route(); }));
    refreshSize();
  }
  function currentAud() { return aud.kind === "book" ? { kind: "book", book: $("#n-ab")?.value } : { kind: aud.kind }; }
  function audLabel(a) { a = a || {}; return { everyone: "Everyone", inactive: "Stopped 3+ days", never_bought: "Never bought", vip: "VIP", book: "Readers of " + bookName(a.book) }[a.kind] || "Everyone"; }
  async function sendPush(msg, scheduled = false) {
    const { data, error } = await sb.from("push_messages").insert({ title: msg.title, body: msg.body, book_id: msg.book_id || null, audience: msg.audience || { kind: "everyone" }, send_at: msg.send_at || new Date().toISOString(), status: "scheduled" }).select().single();
    if (error) return { ok: false, error: error.message };
    logAction("push", { title: msg.title, scheduled });
    if (scheduled) return { ok: true, sent: 0 };
    const r = await sb.functions.invoke("send-push", { body: { message_id: data.id } });
    if (r.error) { let d = r.error.message; try { d = (await r.error.context.text()) || d; } catch (_) {}
      if (/not found|404|Function not found/i.test(d)) d = "The push sender isn't switched on yet (needs the Apple push key in Supabase). Saved in history; it will go once it's on.";
      return { ok: false, error: d }; }
    return { ok: true, sent: r.data?.sent || 0 };
  }

  // =====================================================================
  // HOME SCREEN (what readers see first)
  // =====================================================================
  async function homescreen(main) {
    await Promise.all([loadStories(), loadSettings()]);
    const ann = S("announcement", { text: "", link: "", until: null }) || {};
    main.innerHTML = `<div class="top"><div><h1>Home screen</h1><div class="hi">What readers see first in the app</div></div></div>
      <div class="row" style="align-items:flex-start"><div class="card"><div class="ct">Featured books <span class="muted">big carousel on Discover</span></div>
        ${stories.length ? stories.map((s, i) => `<div class="set"><div style="display:flex;gap:12px;align-items:center">${s.cover_url ? `<img src="${esc(s.cover_url)}" style="width:34px;height:50px;object-fit:cover;border-radius:5px">` : ""}<div><b>${esc(s.title)}</b><small>${s.published ? "Live" : "Draft"} · order ${s.sort ?? 0}</small></div></div>
          <div style="display:flex;gap:8px;align-items:center"><button class="btn ghost small" data-up="${i}" ${i === 0 ? "disabled" : ""}>↑</button><button class="btn ghost small" data-down="${i}" ${i === stories.length - 1 ? "disabled" : ""}>↓</button>
          <button class="tog ${s.featured ? "on" : ""}" data-f="${esc(s.id)}" type="button" aria-label="Featured"></button></div></div>`).join("") : '<div class="empty">Add books first; then choose which are featured.</div>'}
        <p class="muted" style="font-size:12px;margin-top:8px">↑ ↓ changes the order books appear in the app. Built-in books follow after.</p></div>
      <div class="card"><div class="ct">Announcement banner</div>
        <label class="f">Text <small>(empty = no banner)</small><input id="a-t" maxlength="90" value="${esc(ann.text || "")}" placeholder="New: Moonless chapters every night at 9 pm 🌕"></label>
        <label class="f">Link <small>(optional)</small><input id="a-l" value="${esc(ann.link || "")}" placeholder="https://…"></label>
        <label class="f">Show until <small>(optional)</small><input id="a-u" type="datetime-local" value="${ann.until ? localInput(ann.until) : ""}"></label>
        <div class="top" style="margin:0"><button class="btn ghost" id="a-clear">Remove banner</button><button class="btn gold" id="a-save">Save banner</button></div></div></div>`;
    $$("[data-f]", main).forEach((t) => t.addEventListener("click", async () => { const v = !t.classList.contains("on"); t.classList.toggle("on", v);
      const { error } = await sb.from("stories").update({ featured: v }).eq("id", t.dataset.f); if (error) return toast(error.message); toast(v ? "Featured" : "Not featured"); logAction("setting", { key: "featured " + t.dataset.f, value: v }); }));
    const swap = async (i, j) => { const a = stories[i], b = stories[j]; const sa = a.sort ?? i, sbv = b.sort ?? j;
      await sb.from("stories").update({ sort: sbv === sa ? sa + (j > i ? 1 : -1) : sbv }).eq("id", a.id); await sb.from("stories").update({ sort: sa }).eq("id", b.id); route(); };
    $$("[data-up]", main).forEach((b) => b.addEventListener("click", () => swap(Number(b.dataset.up), Number(b.dataset.up) - 1)));
    $$("[data-down]", main).forEach((b) => b.addEventListener("click", () => swap(Number(b.dataset.down), Number(b.dataset.down) + 1)));
    $("#a-save", main).addEventListener("click", async () => { const u = $("#a-u").value; if (await saveSetting("announcement", { text: $("#a-t").value.trim(), link: $("#a-l").value.trim(), until: u ? new Date(u).toISOString() : null })) toast("Banner saved · live within a minute"); });
    $("#a-clear", main).addEventListener("click", async () => { if (await saveSetting("announcement", { text: "", link: "", until: null })) { toast("Banner removed"); route(); } });
  }

  // =====================================================================
  // ADS
  // =====================================================================
  async function ads(main) {
    await loadSettings();
    main.innerHTML = `<div class="top"><div><h1>Ads</h1><div class="hi">VIP members never see ads · changes are live within a minute</div></div></div>
      <div class="row" style="align-items:flex-start"><div class="card"><div class="ct">Where ads show</div>
        ${toggle("ads_feed", "Banner in the For You feed", "small ad while swiping books")}${toggle("ads_between_chapters", "Full-screen ad between chapters", "only after the free chapters")}
        ${toggle("ads_discover_tile", "Book-shaped ad in Discover", "looks like a book tile, marked “Ad”")}${toggle("ads_rewarded", "Watch a video for a free chapter", "readers choose this; best earner")}</div>
      <div class="card"><div class="ct">How often</div>${stepper("chapters_per_interstitial", "Full-screen ad every", "chapters", 3, 1, 20, 1)}${stepper("swipes_per_interstitial", "Feed ad every", "swipes", 6, 2, 30, 1)}<p class="msg" id="saved"></p>
        <div class="tip" style="margin-top:8px">💡 Fewer ads keep readers reading longer; the video-for-chapter option usually earns the most without annoying anyone.</div></div></div>`;
    wireToggles(main); wireSteppers(main);
  }

  // =====================================================================
  // TEAM & ACTIVITY
  // =====================================================================
  async function team(main) {
    const [members, log] = await Promise.all([rpc("admin_team"), rpc("admin_activity", { lim: 60 })]);
    const me = (await sb.auth.getSession()).data.session?.user?.id;
    main.innerHTML = `<div class="top"><div><h1>Team &amp; activity</h1><div class="hi">Who can open this admin, and every change made</div></div></div>
      <div class="row" style="align-items:flex-start"><div class="card"><div class="ct">Admins</div>
        ${members.map((m) => `<div class="set"><div style="display:flex;gap:10px;align-items:center"><span class="av2">${esc((m.email || "?")[0].toUpperCase())}</span><div><b>${esc(m.email)}</b><small>added ${day(m.added_at)} · last sign-in ${ago(m.last_sign_in)}</small></div></div>
          ${m.id === me ? '<span class="tag gold">You</span>' : `<button class="btn danger small" data-rm="${m.id}">Remove</button>`}</div>`).join("")}
        <div style="display:flex;gap:8px;margin-top:14px"><input id="t-e" placeholder="helper@email.com"><button class="btn gold" id="t-add">Add admin</button></div>
        <p class="muted" style="font-size:12px;margin-top:8px">The person needs an account in the app's Supabase first (Authentication → Users). Admins can change everything here.</p></div>
      <div class="card" style="flex:1.3"><div class="ct">Activity log</div><div class="feed">${log.map((a) => `<div>${esc(describe(a))} · <span class="muted">${esc(when(a.at))}</span></div>`).join("") || '<div class="muted">No changes yet.</div>'}</div></div></div>`;
    $("#t-add", main).addEventListener("click", async () => { const e = $("#t-e").value.trim(); if (!e) return;
      const r = await rpc("admin_add_admin", { new_email: e }).catch((x) => x.message);
      toast(r === "ok" ? "Admin added." : r === "no_account" ? "No account with that email yet." : r); route(); });
    $$("[data-rm]", main).forEach((b) => b.addEventListener("click", async () => { if (!confirm("Remove this admin?")) return; const r = await rpc("admin_remove_admin", { uid: b.dataset.rm }).catch((x) => x.message); toast(r === "ok" ? "Removed." : r); route(); }));
  }

  start();
})();
