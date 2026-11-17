// 24/7 Books Admin — a separate web app on the same Supabase project as the iPhone app.
// Books/chapters live in `stories` / `chapters`, covers in Storage bucket `covers`,
// numbers come from `admin_stats` / `admin_funnel` (admins only, see 0003_admin.sql).
(() => {
  "use strict";
  const C = window.ADMIN_CONFIG;
  // Demo mode (?demo): example numbers, never touches the real database.
  const DEMO = new URLSearchParams(location.search).has("demo") && typeof window.makeDemoClient === "function";
  const sb = DEMO ? window.makeDemoClient() : window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);
  if (DEMO) document.addEventListener("DOMContentLoaded", () => {
    const b = document.createElement("div"); b.className = "demo-banner";
    b.textContent = "DEMO · example numbers · nothing here is real or saved";
    document.body.prepend(b);
  });
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  let stories = [];          // rows from `stories`
  let days = 30;
  let lastStats = null;

  // ---------- small helpers ----------
  function toast(text) {
    const t = $("#toast"); t.textContent = text; t.classList.remove("hidden");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.add("hidden"), 3200);
  }
  function setMsg(el, text, isErr = false) { el.textContent = text || ""; el.classList.toggle("err", !!isErr); }
  function show(view) {
    $$(".view").forEach((v) => v.classList.add("hidden"));
    $("#view-" + view).classList.remove("hidden");
    $$(".side nav a").forEach((a) => a.classList.toggle("on", a.dataset.view === (view === "editor" ? "books" : view)));
    window.scrollTo(0, 0);
  }
  function bookName(id) {
    const s = stories.find((x) => x.id === id);
    if (s) return s.title;
    return C.builtIn[id]?.title || id || "—";
  }
  function slugify(t) {
    return String(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "book";
  }

  // ---------- sign in ----------
  async function start() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return showLogin();
    const { data: ok, error } = await sb.rpc("is_admin");
    if (error || !ok) {
      await sb.auth.signOut();
      return showLogin("This account isn't an admin yet. Ask for it to be added to the admins list.", true);
    }
    $("#who-email").textContent = data.session.user.email || "";
    $("#login").classList.add("hidden");
    $("#app").classList.remove("hidden");
    await loadStories();
    show("dashboard");
    loadDashboard();
    if (DEMO) {   // demo: ?demo&view=books|editor|notify opens that page directly
      const v = new URLSearchParams(location.search).get("view");
      if (v === "books") { show("books"); renderBooks(); }
      if (v === "editor") openEditor(stories[0]?.id || null);
      if (v === "notify") { show("notify"); renderNotify(); }
    }
  }
  function showLogin(msg = "", err = false) {
    $("#app").classList.add("hidden");
    $("#login").classList.remove("hidden");
    setMsg($("#login-msg"), msg, err);
  }
  // One-time sign-in link by email (only existing accounts; admins are checked after).
  $("#send-link").addEventListener("click", async () => {
    const email = $("#login-email").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg($("#login-msg"), "Type your email first.", true);
    $("#send-link").disabled = true; setMsg($("#login-msg"), "Sending…");
    const { error } = await sb.auth.signInWithOtp({
      email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
    });
    $("#send-link").disabled = false;
    if (error) return setMsg($("#login-msg"), /signups not allowed|not found/i.test(error.message) ? "No admin account with that email." : /rate limit|too many/i.test(error.message) ? "Email limit reached (Supabase free email sends ~2 per hour). Please try again in an hour." : /seconds/i.test(error.message) ? "Please wait a minute before asking for another link." : "Couldn't send: " + error.message, true);
    setMsg($("#login-msg"), "");
    $("#sent-to").textContent = email;
    $("#step-email").classList.add("hidden");
    $("#step-sent").classList.remove("hidden");
  });
  $("#use-other").addEventListener("click", () => {
    $("#step-sent").classList.add("hidden");
    $("#step-email").classList.remove("hidden");
    $("#login-email").focus();
  });
  $("#login-email").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#send-link").click(); } });

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!$("#login-password").value) return setMsg($("#login-msg"), "Type your password, or use the email link.", true);
    setMsg($("#login-msg"), "Signing in…");
    const { error } = await sb.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-password").value });
    if (error) return setMsg($("#login-msg"), "Wrong email or password.", true);
    $("#login-password").value = "";
    start();
  });
  $("#logout").addEventListener("click", async () => { await sb.auth.signOut(); showLogin(); });

  $$(".side nav a").forEach((a) => a.addEventListener("click", () => {
    const v = a.dataset.view; show(v);
    if (v === "dashboard") loadDashboard();
    if (v === "books") renderBooks();
    if (v === "notify") renderNotify();
  }));

  // ---------- dashboard ----------
  $$("#range .pill").forEach((p) => p.addEventListener("click", () => {
    $$("#range .pill").forEach((x) => x.classList.toggle("on", x === p));
    days = Number(p.dataset.days); loadDashboard();
  }));

  async function loadDashboard() {
    $("#kpis").innerHTML = '<div class="kpi"><div class="kl">Loading…</div></div>';
    const { data, error } = await sb.rpc("admin_stats", { days });
    if (error) { $("#kpis").innerHTML = `<div class="kpi"><div class="kl">Couldn't load numbers</div><div class="ks">${esc(error.message)}</div></div>`; return; }
    lastStats = data;
    const purchases = data.purchases || {};
    let revenue = 0, coinBuys = 0, vipBuys = 0;
    for (const [pid, n] of Object.entries(purchases)) {
      revenue += (C.prices[pid] || 0) * n;
      if (pid.startsWith("vip_")) vipBuys += n; else coinBuys += n;
    }
    const kpi = (l, v, s, gold) => `<div class="kpi"><div class="kl">${l}</div><div class="kv ${gold ? "gold" : ""}">${v}</div><div class="ks">${s}</div></div>`;
    const span = days === 1 ? "today" : `last ${days} days`;
    $("#kpis").innerHTML =
      kpi("Readers", fmt(data.readers), `${fmt(data.accounts)} accounts`) +
      kpi("Active today", fmt(data.active_today), "opened the app today") +
      kpi("Chapters read", fmt(data.chapters_read), days > 1 ? `${fmt(Math.round(data.chapters_read / days))} a day` : span) +
      kpi("Revenue (est.)", money(revenue), `${fmt(coinBuys)} coin packs · ${fmt(vipBuys)} VIP`, true) +
      kpi("VIP members", fmt(data.vip_members), "active now", true) +
      kpi("Unlocks", fmt((data.coin_unlocks || 0) + (data.free_unlocks || 0) + (data.ad_unlocks || 0)),
        `${fmt(data.coin_unlocks)} coins · ${fmt(data.ad_unlocks)} ads · ${fmt(data.free_unlocks)} free`);
    renderChart(data.daily || []);
    renderBooksTable(data.books || []);
    renderFunnelPicker(data.books || []);
  }

  function renderChart(points) {
    const el = $("#chart");
    if (!points.length || points.every((p) => !p.n)) { el.innerHTML = '<div class="empty">No chapters read yet in this period.<br><small>Reading numbers start with the app update that records chapter reads.</small></div>'; return; }
    const W = 760, H = 200, max = Math.max(...points.map((p) => p.n), 1);
    const x = (i) => (points.length === 1 ? W / 2 : (i * W) / (points.length - 1));
    const y = (v) => H - (v / max) * (H - 14) - 4;
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join(" ");
    const grid = [0, 1, 2, 3].map((k) => `<line x1="0" x2="${W}" y1="${(k * H) / 3}" y2="${(k * H) / 3}" stroke="#ffffff12"/>`).join("");
    const dots = points.length <= 31 ? points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.n)}" r="3" fill="#e9c46a"><title>${p.day}: ${p.n}</title></circle>`).join("") : "";
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Chapters read per day">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2b85a" stop-opacity=".45"/><stop offset="1" stop-color="#e2b85a" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${line} L${W},${H} L0,${H} Z" fill="url(#g)"/><path d="${line}" fill="none" stroke="#e9c46a" stroke-width="2.5" vector-effect="non-scaling-stroke"/>${dots}</svg>
      <div class="between muted small"><span>${esc(points[0].day)}</span><span>peak ${fmt(max)} a day</span><span>${esc(points[points.length - 1].day)}</span></div>`;
  }

  function coverFor(id) {
    const s = stories.find((x) => x.id === id);
    const url = s?.cover_url || C.builtIn[id]?.cover;
    return url ? `<img src="${esc(url)}" alt="">` : '<div class="ph"></div>';
  }
  function renderBooksTable(rows) {
    const t = $("#books-table");
    if (!rows.length) { t.innerHTML = '<tr><td class="empty">No reading activity in this period yet.</td></tr>'; return; }
    t.innerHTML = `<tr><th></th><th>Book</th><th>Readers</th><th>Chapters read</th><th>Avg. per reader</th><th>Coin unlocks</th><th>Free/ad unlocks</th></tr>` +
      rows.map((b) => `<tr><td>${coverFor(b.book)}</td><td><b>${esc(bookName(b.book))}</b><br><small>${esc(b.book)}</small></td>
        <td>${fmt(b.readers)}</td><td>${fmt(b.chapters_read)}</td><td>${b.readers ? (b.chapters_read / b.readers).toFixed(1) : "—"}</td>
        <td>${fmt(b.coin_unlocks)}</td><td>${fmt(b.free_unlocks)}</td></tr>`).join("");
  }

  function renderFunnelPicker(rows) {
    const sel = $("#funnel-book");
    const ids = [...new Set([...rows.map((r) => r.book), "moonless", ...stories.map((s) => s.id)])].filter(Boolean);
    const keep = sel.value;
    sel.innerHTML = ids.map((id) => `<option value="${esc(id)}">${esc(bookName(id))}</option>`).join("");
    if (ids.includes(keep)) sel.value = keep;
    loadFunnel();
  }
  $("#funnel-book").addEventListener("change", loadFunnel);
  async function loadFunnel() {
    const book = $("#funnel-book").value, box = $("#funnel");
    if (!book) { box.innerHTML = ""; return; }
    const { data, error } = await sb.rpc("admin_funnel", { book, days: 90 });
    if (error) { box.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
    if (!data?.length) { box.innerHTML = '<div class="empty">No reads recorded for this book yet.</div>'; return; }
    const byCh = new Map(data.map((r) => [r.chapter, r.readers]));
    const first = byCh.get(1) || Math.max(...data.map((r) => r.readers));
    const last = Math.max(...data.map((r) => r.chapter));
    const marks = [...new Set([1, C.freeChapters, C.freeChapters + 1, 5, 10, 20, 50, 100, 200, last])].filter((c) => c >= 1 && c <= last).sort((a, b) => a - b);
    // readers who reached chapter c = most readers seen at c or any later chapter
    const reached = (c) => Math.max(0, ...data.filter((r) => r.chapter >= c).map((r) => r.readers));
    box.innerHTML = marks.map((c) => {
      const n = reached(c), pct = first ? Math.round((n / first) * 100) : 0;
      const label = c === C.freeChapters ? `Ch ${c} · last free` : c === C.freeChapters + 1 ? `Ch ${c} · locked` : `Chapter ${c}`;
      return `<div class="fr"><span>${label}</span><div class="fb"><i style="width:${Math.min(100, pct)}%"></i></div><b>${pct}%</b><em>${fmt(n)}</em></div>`;
    }).join("") + (byCh.size ? `<div class="msg">${Math.round((reached(C.freeChapters + 1) / first) * 100 || 0)}% keep reading after the first locked chapter</div>` : "");
  }

  // ---------- books ----------
  async function loadStories() {
    const { data, error } = await sb.from("stories").select("*").order("sort", { ascending: true });
    if (error) { toast("Couldn't load books: " + error.message); return; }
    stories = data || [];
  }
  function renderBooks() {
    const grid = $("#book-grid");
    grid.innerHTML = stories.length ? stories.map((s) => `
      <div class="bk" data-id="${esc(s.id)}">
        ${s.cover_url ? `<img class="cv" src="${esc(s.cover_url)}" alt="">` : `<div class="cv" style="background:linear-gradient(160deg,${esc(s.color1 || "#2e1430")},${esc(s.color2 || "#0a1c38")})"></div>`}
        <b>${esc(s.title)}</b><span class="st ${s.published ? "live" : "draft"}">${s.published ? "Live" : "Draft"}</span>
        <small class="muted">${fmt(s.chapters)} chapters · ${esc(s.genre)}</small></div>`).join("")
      : '<div class="empty">No books added here yet. Click “New book” to add your first one.</div>';
    $$("#book-grid .bk").forEach((b) => b.addEventListener("click", () => openEditor(b.dataset.id)));
    $("#builtin-list").innerHTML = Object.values(C.builtIn).map((b) => `<span>${esc(b.title)} · ${b.chapters} ch</span>`).join("");
  }
  $("#new-book").addEventListener("click", () => openEditor(null));
  $("#editor-back").addEventListener("click", async () => { await loadStories(); show("books"); renderBooks(); });

  // ---------- editor ----------
  const ed = { id: null, isNew: true, coverUrl: null, coverFile: null, chapters: [], chaptersDirty: false };

  async function openEditor(id) {
    setMsg($("#editor-msg"), "");
    $("#docx-result").textContent = ""; $("#docx-file").value = "";
    Object.assign(ed, { id, isNew: !id, coverUrl: null, coverFile: null, chapters: [], chaptersDirty: false });
    const s = stories.find((x) => x.id === id) || {};
    $("#editor-title").textContent = id ? s.title : "New book";
    $("#f-title").value = s.title || "";
    $("#f-author").value = s.author || "24/7 Originals";
    $("#f-genre").value = s.genre || "Romance";
    $("#f-badge").value = s.badge || (id ? "" : "NEW");
    $("#f-hook").value = s.hook || "";
    $("#f-color1").value = /^#[0-9a-f]{6}$/i.test(s.color1 || "") ? s.color1 : "#2e1430";
    $("#f-color2").value = /^#[0-9a-f]{6}$/i.test(s.color2 || "") ? s.color2 : "#0a1c38";
    $("#f-sort").value = s.sort ?? (stories.length ? Math.min(...stories.map((x) => x.sort || 0)) - 1 : 0);
    $("#f-published").value = String(!!s.published);
    $("#delete-book").classList.toggle("hidden", !id);
    setCover(s.cover_url || null);
    show("editor");
    if (id) {
      const { data, error } = await sb.from("chapters").select("index,title,paragraphs").eq("book_id", id).order("index");
      if (error) setMsg($("#editor-msg"), "Couldn't load chapters: " + error.message, true);
      ed.chapters = data || [];
    }
    renderChapters();
  }

  function setCover(url) {
    ed.coverUrl = url;
    const drop = $("#cover-drop");
    $("#cover-preview").src = url || "";
    drop.classList.toggle("has", !!url);
  }
  $("#cover-file").addEventListener("change", (e) => pickCover(e.target.files[0]));
  const drop = $("#cover-drop");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); pickCover(e.dataTransfer.files[0]); });
  function pickCover(file) {
    if (!file || !/^image\//.test(file.type)) return toast("Please choose a JPG or PNG image.");
    ed.coverFile = file;
    const r = new FileReader(); r.onload = () => { $("#cover-preview").src = r.result; drop.classList.add("has"); }; r.readAsDataURL(file);
  }
  // Resize to at most 900×1350 JPEG so covers load fast in the app.
  async function resizedCover(file) {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 900 / img.width, 1350 / img.height);
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, "image/jpeg", 0.86));
  }

  function renderChapters() {
    const list = $("#chapter-list");
    $("#chapter-count").textContent = ed.chapters.length ? `${fmt(ed.chapters.length)} chapters · first ${C.freeChapters} free` : "";
    list.innerHTML = ed.chapters.map((ch, i) => {
      const words = ch.paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
      return `<div class="ch" data-i="${i}"><div class="n">${i + 1}</div><div class="t">${esc(ch.title)}</div>
        ${i < C.freeChapters ? '<span class="free">FREE</span>' : ""}<span class="w">${fmt(words)} words</span></div>`;
    }).join("") || '<div class="empty">No chapters yet — upload a Word file above.</div>';
    $$("#chapter-list .ch").forEach((row) => row.addEventListener("click", () => openChapter(Number(row.dataset.i))));
  }

  // Word (.docx) → chapters. "Chapter 1 / Chapter One / CHAPTER I: Title" headings
  // start a chapter; italics/bold become *…* / **…** which the app renders.
  $("#docx-file").addEventListener("change", (e) => importDocx(e.target.files[0]));
  const ddrop = $("#docx-drop");
  ["dragenter", "dragover"].forEach((t) => ddrop.addEventListener(t, (e) => { e.preventDefault(); ddrop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => ddrop.addEventListener(t, () => ddrop.classList.remove("over")));
  ddrop.addEventListener("drop", (e) => { e.preventDefault(); importDocx(e.dataTransfer.files[0]); });

  const NUM_WORDS = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred";
  const CH_RE = new RegExp(`^\\s*(?:chapter|ch\\.?)\\s+((?:\\d+)|(?:[ivxlcdm]+)|(?:(?:${NUM_WORDS})(?:[\\s-]+(?:${NUM_WORDS}))*))\\b\\s*[:.\\-–—]?\\s*(.*)$`, "i");
  function inlineText(node) {
    let out = "";
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += n.textContent;
      else if (n.nodeName === "STRONG" || n.nodeName === "B") { const t = inlineText(n); out += t.trim() ? `**${t}**` : t; }
      else if (n.nodeName === "EM" || n.nodeName === "I") { const t = inlineText(n); out += t.trim() ? `*${t}*` : t; }
      else if (n.nodeName === "BR") out += " ";
      else out += inlineText(n);
    });
    return out;
  }
  async function importDocx(file) {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) return toast("Please choose a Word .docx file.");
    $("#docx-result").textContent = "Reading " + file.name + "…";
    try {
      const { value: html } = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      const doc = new DOMParser().parseFromString(html, "text/html");
      const blocks = [...doc.body.children].map((el) => ({ tag: el.tagName, text: inlineText(el).replace(/\s+/g, " ").trim(), plain: el.textContent.replace(/\s+/g, " ").trim() })).filter((b) => b.plain);
      const chapters = []; let cur = null, skipped = 0, pendingTitle = false;
      for (const b of blocks) {
        const m = b.plain.length < 120 ? b.plain.match(CH_RE) : null;
        if (m) {
          cur = { title: (m[2] || "").replace(/^[\s:.\-–—]+/, "").trim(), paragraphs: [] };
          pendingTitle = !cur.title; chapters.push(cur); continue;
        }
        if (/^\s*part\s+([0-9]+|[ivxlcdm]+|[a-z]+)\b/i.test(b.plain) && b.plain.length < 80) continue; // part headings
        if (!cur) { skipped++; continue; }                         // title page, contents, notes
        if (pendingTitle && /^H[1-6]$/.test(b.tag) && b.plain.length < 90) { cur.title = b.plain; pendingTitle = false; continue; }
        pendingTitle = false;
        cur.paragraphs.push(b.text);
      }
      const good = chapters.filter((c) => c.paragraphs.length);
      if (!good.length) { $("#docx-result").textContent = "No “Chapter 1, Chapter 2…” headings found. Put each chapter under a heading like “Chapter 1: Title”."; return; }
      const append = $("#docx-mode").value === "append";
      const start = append ? ed.chapters.length : 0;
      const mapped = good.map((c, i) => ({ index: start + i, title: c.title || `Chapter ${start + i + 1}`, paragraphs: c.paragraphs }));
      ed.chapters = append ? ed.chapters.concat(mapped) : mapped;
      ed.chaptersDirty = true;
      renderChapters();
      $("#docx-result").innerHTML = `<span class="gold">✓ ${fmt(good.length)} chapters ${append ? "added" : "found"}</span> in ${esc(file.name)}${skipped ? ` · ${skipped} lines before Chapter 1 skipped (title page/contents)` : ""}. Not saved yet — press Save or Publish.`;
    } catch (err) {
      $("#docx-result").textContent = "Couldn't read that file: " + err.message;
    }
  }

  // Chapter modal
  let editing = -1;
  function openChapter(i) {
    editing = i; const ch = ed.chapters[i];
    $("#cm-heading").textContent = `Chapter ${i + 1}`;
    $("#cm-title").value = ch.title;
    $("#cm-text").value = ch.paragraphs.join("\n\n");
    $("#chapter-modal").classList.remove("hidden");
  }
  $("#cm-close").addEventListener("click", () => $("#chapter-modal").classList.add("hidden"));
  $("#cm-save").addEventListener("click", () => {
    const paras = $("#cm-text").value.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    if (!paras.length) return toast("A chapter needs some text.");
    ed.chapters[editing] = { ...ed.chapters[editing], title: $("#cm-title").value.trim() || `Chapter ${editing + 1}`, paragraphs: paras };
    ed.chaptersDirty = true; renderChapters(); $("#chapter-modal").classList.add("hidden");
    toast("Chapter changed — press Save or Publish to keep it.");
  });
  $("#cm-delete").addEventListener("click", () => {
    if (!confirm(`Delete chapter ${editing + 1}? Later chapters move up by one.`)) return;
    ed.chapters.splice(editing, 1); ed.chapters = ed.chapters.map((c, i) => ({ ...c, index: i }));
    ed.chaptersDirty = true; renderChapters(); $("#chapter-modal").classList.add("hidden");
  });

  // Save / publish
  $("#save-draft").addEventListener("click", () => save(false, false));
  $("#publish").addEventListener("click", () => save(true, false));
  $("#publish-notify").addEventListener("click", () => save(true, true));

  async function save(published, notify) {
    const msg = $("#editor-msg");
    const title = $("#f-title").value.trim(), hook = $("#f-hook").value.trim();
    if (!title) return setMsg(msg, "Please add a title.", true);
    if (!hook) return setMsg(msg, "Please add the one-line hook.", true);
    if (published && !ed.chapters.length) return setMsg(msg, "Add chapters before publishing.", true);
    if (published && !ed.coverUrl && !ed.coverFile) return setMsg(msg, "Add a cover before publishing.", true);
    $$("#view-editor .acts .btn").forEach((b) => (b.disabled = true));
    try {
      let id = ed.id;
      if (!id) {
        id = slugify(title);
        const taken = new Set([...stories.map((s) => s.id), ...Object.keys(C.builtIn)]);
        let n = 2, base = id; while (taken.has(id)) id = `${base}-${n++}`;
      }
      if (ed.coverFile) {
        setMsg(msg, "Uploading cover…");
        const blob = await resizedCover(ed.coverFile);
        const path = `${id}/cover-${Date.now()}.jpg`;
        const up = await sb.storage.from("covers").upload(path, blob, { contentType: "image/jpeg", upsert: true });
        if (up.error) throw up.error;
        setCover(sb.storage.from("covers").getPublicUrl(path).data.publicUrl);
        ed.coverFile = null;
      }
      setMsg(msg, "Saving book…");
      const row = {
        id, title, author: $("#f-author").value.trim() || "24/7 Originals", genre: $("#f-genre").value, hook,
        chapters: ed.chapters.length, badge: $("#f-badge").value || null, cover_url: ed.coverUrl, hero_url: ed.coverUrl,
        color1: $("#f-color1").value, color2: $("#f-color2").value, sort: Number($("#f-sort").value) || 0,
        published, updated_at: new Date().toISOString(),
      };
      if (ed.isNew) { row.rating = 0; row.views = "New"; }
      const r = await sb.from("stories").upsert(row);
      if (r.error) throw r.error;
      if (ed.chaptersDirty) {
        setMsg(msg, "Saving chapters…");
        const del = await sb.from("chapters").delete().eq("book_id", id);
        if (del.error) throw del.error;
        for (let i = 0; i < ed.chapters.length; i += 50) {
          const batch = ed.chapters.slice(i, i + 50).map((c, k) => ({ book_id: id, index: i + k, title: c.title, paragraphs: c.paragraphs }));
          const ins = await sb.from("chapters").insert(batch);
          if (ins.error) throw ins.error;
          setMsg(msg, `Saving chapters… ${Math.min(i + 50, ed.chapters.length)} / ${ed.chapters.length}`);
        }
        ed.chaptersDirty = false;
      }
      Object.assign(ed, { id, isNew: false });
      $("#f-published").value = String(published);
      $("#delete-book").classList.remove("hidden");
      $("#editor-title").textContent = title;
      await loadStories();
      setMsg(msg, published ? "✓ Live in the app. Readers see it next time they open 24/7 Books." : "✓ Saved as draft (hidden from readers).");
      if (notify) {
        const sent = await sendPush(`New book: ${title} 📖`, hook, id);
        setMsg(msg, sent.ok ? `✓ Live in the app and sent to ${fmt(sent.sent)} readers.` : `✓ Live in the app. Notification not sent: ${sent.error}`, !sent.ok);
      }
    } catch (err) {
      setMsg(msg, "Couldn't save: " + (err.message || err), true);
    } finally {
      $$("#view-editor .acts .btn").forEach((b) => (b.disabled = false));
    }
  }

  $("#delete-book").addEventListener("click", async () => {
    if (!ed.id) return;
    if (!confirm(`Delete “${$("#f-title").value}” and all its chapters? Readers will no longer see it. This can't be undone.`)) return;
    const a = await sb.from("chapters").delete().eq("book_id", ed.id);
    const b = a.error ? a : await sb.from("stories").delete().eq("id", ed.id);
    if (b.error) return setMsg($("#editor-msg"), "Couldn't delete: " + b.error.message, true);
    await loadStories(); show("books"); renderBooks(); toast("Book deleted.");
  });

  // ---------- notifications ----------
  async function sendPush(title, body, bookId) {
    const { data, error } = await sb.functions.invoke("send-push", { body: { title, body, bookId } });
    if (error) {
      let detail = error.message;
      try { detail = (await error.context.text()) || detail; } catch (_) {}
      return { ok: false, error: detail };
    }
    return { ok: true, sent: data?.sent || 0 };
  }
  function renderNotify() {
    $("#push-devices").textContent = lastStats ? `${fmt(lastStats.push_devices)} phones can receive notifications.` : "";
    $("#n-book").innerHTML = `<option value="">— Just open the app —</option>` +
      [...Object.entries(C.builtIn).map(([id, b]) => [id, b.title]), ...stories.filter((s) => s.published).map((s) => [s.id, s.title])]
        .map(([id, t]) => `<option value="${esc(id)}">${esc(t)}</option>`).join("");
  }
  $("#n-send").addEventListener("click", async () => {
    const title = $("#n-title").value.trim(), body = $("#n-body").value.trim();
    if (!title || !body) return setMsg($("#n-msg"), "Add a title and a message.", true);
    if (!confirm(`Send “${title}” to all readers now?`)) return;
    $("#n-send").disabled = true; setMsg($("#n-msg"), "Sending…");
    const r = await sendPush(title, body, $("#n-book").value || undefined);
    $("#n-send").disabled = false;
    setMsg($("#n-msg"), r.ok ? `✓ Sent to ${fmt(r.sent)} phones.` : "Not sent: " + r.error, !r.ok);
  });

  sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_OUT") showLogin(); });
  start();
})();
