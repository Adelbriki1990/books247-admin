// Demo mode (open the admin with ?demo): example data in memory, never touches the real database.
window.makeDemoClient = function () {
  const now = Date.now(), D = 86400000;
  const iso = (ms) => new Date(ms).toISOString();
  const db = {
    stories: [
      { id: "silver-collar", title: "The Silver Collar", author: "24/7 Originals", genre: "Fantasy", hook: "She wore his collar to survive the court. Now the court wants her dead.", chapters: 8, rating: 0, views: "New", badge: "NEW", cover_url: "img/SaltAshCover.jpg", hero_url: "img/SaltAshCover.jpg", color1: "#2e1430", color2: "#0a1c38", sort: 0, published: true, featured: true, free_chapters: null, coins_per_chapter: 25 },
      { id: "city-of-paper", title: "City of Paper", author: "24/7 Originals", genre: "Drama", hook: "Three days left in the corner office.", chapters: 18, rating: 0, views: "New", badge: "HOT", cover_url: "img/PaperKingdomCover.jpg", hero_url: null, color1: "#3a1410", color2: "#0a1c38", sort: 1, published: true, featured: false, free_chapters: 4, coins_per_chapter: null },
      { id: "last-stop", title: "Last Stop", author: "24/7 Originals", genre: "Romance", hook: "Sixty seconds before the doors close.", chapters: 12, rating: 0, views: "New", badge: null, cover_url: "img/LastTrainCover.jpg", hero_url: null, color1: "#2e1430", color2: "#0a1c38", sort: 2, published: false, featured: false, free_chapters: null, coins_per_chapter: null },
    ],
    chapters: ["The Auction", "Iron and Silk", "The Second Bell", "Teeth", "A Quiet Knife", "The Queen's Hound", "Ash on the Stairs", "What the River Kept"]
      .map((t, i) => ({ book_id: "silver-collar", index: i, title: t, paragraphs: Array(16 + (i % 5) * 4).fill("The court never slept, and neither did she. *Not tonight.*") })),
    app_settings: Object.entries({ coins_per_chapter: 30, free_chapters: 3, free_unlock_hours: 4, daily_reward: 15, streak_reward: 5, daily_goal_reward: 20, rewarded_ad_coins: 20, welcome_coins: 30,
      ads_feed: true, ads_between_chapters: true, ads_discover_tile: true, ads_rewarded: true, chapters_per_interstitial: 3, swipes_per_interstitial: 6,
      announcement: { text: "New Moonless chapters every night at 9 pm 🌕", link: "", until: null } }).map(([key, value]) => ({ key, value })),
    promotions: [
      { id: "p1", title: "Chapter 4 free this weekend 🎉", kind: "free_chapter", book_id: "moonless", params: { chapter: 4 }, starts_at: iso(now - D), ends_at: iso(now + 2 * D), enabled: true },
      { id: "p2", title: "Double rewards weekend ✨", kind: "double_rewards", book_id: null, params: {}, starts_at: iso(now + 8 * D), ends_at: iso(now + 10 * D), enabled: true },
    ],
    push_messages: [], admin_log: [], stories_extra: [],
  };
  const daily = (n) => Array.from({ length: n }, (_, i) => ({ day: iso(now - (n - 1 - i) * D).slice(0, 10), n: Math.round(150 + i * 9 + 40 * Math.sin(i / 2.3)) }));
  const readersList = [
    { id: "u1", email: "sara.m@example.com", created_at: iso(now - 20 * D), last_seen: iso(now - 120e3), coins: 40, is_vip: true, chapters_read: 612, blocked: false, last_read: { moonless: 60 }, purchases: { vip_yearly: 1 }, last_purchase: iso(now - 120e3) },
    { id: "u2", email: "omar.k@example.com", created_at: iso(now - 15 * D), last_seen: iso(now - 3600e3), coins: 240, is_vip: false, chapters_read: 87, blocked: false, last_read: { "silver-collar": 8 }, purchases: { coins_1200: 1, coins_100: 2 }, last_purchase: iso(now - 3 * D) },
    { id: "u3", email: "lina@example.com", created_at: iso(now - 5 * D), last_seen: iso(now - 3 * D), coins: 15, is_vip: false, chapters_read: 12, blocked: false, last_read: { moonless: 4 }, purchases: {}, last_purchase: null },
    { id: "u4", email: "hamad@example.com", created_at: iso(now - 9 * D), last_seen: iso(now - 8 * D), coins: 0, is_vip: false, chapters_read: 3, blocked: true, last_read: {}, purchases: {}, last_purchase: null },
  ];
  const ok = (data) => Promise.resolve({ data, error: null });
  function query(table) {
    const rows = db[table] || (db[table] = []);
    const st = { filters: [], op: "select", payload: null, single: false };
    const apply = () => {
      let out = rows.filter((r) => st.filters.every(([k, v]) => r[k] === v));
      if (st.op === "insert") { const add = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r) => ({ id: "m" + Math.random().toString(36).slice(2, 8), created_at: iso(Date.now()), sent: 0, opened: 0, ...r })); rows.push(...add); out = add; }
      if (st.op === "upsert") { const list = Array.isArray(st.payload) ? st.payload : [st.payload]; list.forEach((r) => { const key = r.id !== undefined ? "id" : "key"; const i = rows.findIndex((x) => x[key] === r[key]); if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push(r); }); out = list; }
      if (st.op === "update") { out.forEach((r) => Object.assign(r, st.payload)); }
      if (st.op === "delete") { out.forEach((r) => rows.splice(rows.indexOf(r), 1)); }
      return { data: st.single ? out[0] : out, error: null };
    };
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; }, in() { return q; },
      eq(k, v) { st.filters.push([k, v]); return q; },
      insert(p) { st.op = "insert"; st.payload = p; return q; }, upsert(p) { st.op = "upsert"; st.payload = p; return q; },
      update(p) { st.op = "update"; st.payload = p; return q; }, delete() { st.op = "delete"; return q; }, single() { st.single = true; return q; },
      then(res, rej) { return Promise.resolve(apply()).then(res, rej); },
    };
    return q;
  }
  const rpcs = {
    is_admin: () => true,
    admin_stats: ({ days }) => { const n = Math.max(1, days), d = daily(n), read = d.reduce((a, x) => a + x.n, 0), k = Math.min(1, n / 30);
      return { accounts: 412, readers: Math.round(1284 * k + 60), active_today: 342, chapters_read: read,
        purchases: Object.fromEntries(Object.entries({ coins_100: 21, coins_500: 18, coins_1200: 9, coins_3000: 4, coins_starter: 9, vip_monthly: 6, vip_yearly: 3, vip_weekly: 2 }).map(([p, v]) => [p, Math.max(n === 1 ? 0 : 1, Math.round(v * k))])),
        vip_members: 38, ad_unlocks: Math.round(611 * k), free_unlocks: Math.round(488 * k), coin_unlocks: Math.round(702 * k), paywall_views: Math.round(930 * k), push_devices: 806, daily: d,
        books: [{ book: "moonless", chapters_read: Math.round(read * 0.72), readers: Math.round(1102 * k), coin_unlocks: 520, free_unlocks: 640 },
          { book: "silver-collar", chapters_read: Math.round(read * 0.16), readers: Math.round(284 * k), coin_unlocks: 120, free_unlocks: 260 },
          { book: "last-train-home", chapters_read: Math.round(read * 0.07), readers: Math.round(161 * k), coin_unlocks: 41, free_unlocks: 120 },
          { book: "city-of-paper", chapters_read: Math.round(read * 0.05), readers: Math.round(96 * k), coin_unlocks: 21, free_unlocks: 79 }] }; },
    admin_funnel: () => [1, 2, 3, 4, 5, 8, 10, 15, 20, 30, 50, 80, 120, 200, 338].map((c, i) => ({ chapter: c, readers: [1102, 930, 782, 419, 380, 330, 264, 210, 175, 140, 99, 70, 48, 30, 12][i] })),
    admin_recent_purchases: () => [{ created_at: iso(now - 120e3), product_id: "vip_yearly", email: "sara.m@example.com" }, { created_at: iso(now - 3600e3), product_id: "coins_1200", email: "omar.k@example.com" }, { created_at: iso(now - 3 * 3600e3), product_id: "coins_starter", email: "lina@example.com" }],
    admin_activity: () => [{ at: iso(now - 600e3), action: "publish", detail: { title: "The Silver Collar" }, email: "adel@example.com" }, { at: iso(now - 7200e3), action: "setting", detail: { key: "daily_reward", value: 15 }, email: "adel@example.com" }, { at: iso(now - D), action: "gift", detail: { coins: 100 }, email: "adel@example.com" }],
    admin_push_history: () => [...db.push_messages.map((m) => ({ ...m, opened: 0 })), { id: "h1", title: "Your free chapter is ready 🎁", body: "Open any locked chapter for free.", audience: { kind: "everyone" }, send_at: iso(now - 2 * D), status: "sent", sent: 790, opened: 324 }],
    admin_audience_size: ({ audience }) => ({ everyone: 806, book: 318, inactive: 211, never_bought: 640, vip: 38 }[audience?.kind] ?? 0),
    admin_readers: ({ q }) => readersList.filter((r) => !q || r.email.includes(q)),
    admin_gift: () => null, admin_set_blocked: ({ uid, is_blocked }) => { const r = readersList.find((x) => x.id === uid); if (r) r.blocked = is_blocked; return null; },
    admin_team: () => [{ id: "me", email: "adel@example.com", added_at: iso(now - 2 * D), last_sign_in: iso(now - 600e3) }],
    admin_add_admin: () => "no_account", admin_remove_admin: () => "ok",
  };
  return {
    auth: { getSession: () => ok({ session: { user: { id: "me", email: "demo@example.com" } } }), signOut: () => ok(null), onAuthStateChange() {},
      signInWithOtp: () => ok(null), signInWithPassword: () => ok(null) },
    rpc: (name, args) => ok(rpcs[name] ? rpcs[name](args || {}) : null),
    from: (t) => query(t),
    storage: { from: () => ({ upload: () => ok(null), getPublicUrl: () => ({ data: { publicUrl: "img/SaltAshCover.jpg" } }) }) },
    functions: { invoke: () => ok({ sent: 806 }) },
  };
};
