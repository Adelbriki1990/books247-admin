// Demo mode (open index.html?demo): example data only, never touches the real database.
window.makeDemoClient = function () {
  const days = (n) => Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() - (n - 1 - i) * 86400000);
    return { day: d.toISOString().slice(0, 10), n: Math.round(150 + i * 9 + 40 * Math.sin(i / 2.3)) };
  });
  const stories = [
    { id: "silver-collar", title: "The Silver Collar", author: "24/7 Originals", genre: "Fantasy", hook: "She wore his collar to survive the court. Now the court wants her dead.", chapters: 42, rating: 0, views: "New", badge: "NEW", cover_url: "img/SaltAshCover.jpg", hero_url: null, color1: "#2e1430", color2: "#0a1c38", sort: 0, published: true },
    { id: "city-of-paper", title: "City of Paper", author: "24/7 Originals", genre: "Drama", hook: "Three days left in the corner office.", chapters: 18, rating: 0, views: "New", badge: "HOT", cover_url: "img/PaperKingdomCover.jpg", hero_url: null, color1: "#3a1410", color2: "#0a1c38", sort: 1, published: true },
    { id: "last-stop", title: "Last Stop", author: "24/7 Originals", genre: "Romance", hook: "Sixty seconds before the doors close.", chapters: 12, rating: 0, views: "New", badge: null, cover_url: "img/LastTrainCover.jpg", hero_url: null, color1: "#2e1430", color2: "#0a1c38", sort: 2, published: false },
  ];
  const chapterTitles = ["The Auction", "Iron and Silk", "The Second Bell", "Teeth", "A Quiet Knife", "The Queen's Hound", "Ash on the Stairs", "What the River Kept"];
  const chapters = chapterTitles.map((t, i) => ({ index: i, title: t, paragraphs: Array(18 + (i % 5) * 4).fill("The court never slept, and neither did she. *Not tonight.*") }));
  const result = (data) => Promise.resolve({ data, error: null });
  const query = (rows) => {
    const q = { _rows: rows,
      select() { return q; }, order() { return q; }, eq() { return q; }, in() { return q; },
      upsert() { return result(null); }, insert() { return result(null); }, delete() { return q; },
      then(res, rej) { return result(q._rows).then(res, rej); } };
    return q;
  };
  return {
    auth: {
      getSession: () => result({ session: { user: { email: "demo · example data" } } }),
      signOut: () => result(null), onAuthStateChange() {},
      signInWithOtp: () => result(null), signInWithPassword: () => result(null),
    },
    rpc(name, args) {
      if (name === "is_admin") return result(true);
      if (name === "admin_stats") {
        const n = Math.max(1, args.days);
        const daily = days(n);
        const read = daily.reduce((a, d) => a + d.n, 0);
        return result({
          accounts: 412, readers: Math.round(1284 * Math.min(1, n / 30) + 60), active_today: 342, chapters_read: read,
          purchases: { coins_100: 21, coins_500: 18, coins_1200: 9, coins_3000: 4, coins_starter: 9, vip_monthly: 19, vip_yearly: 12, vip_weekly: 7 },
          vip_members: 38, ad_unlocks: 611, free_unlocks: 488, coin_unlocks: 702, paywall_views: 930, push_devices: 806,
          daily,
          books: [
            { book: "moonless", chapters_read: Math.round(read * 0.72), readers: 1102, coin_unlocks: 520, free_unlocks: 640 },
            { book: "silver-collar", chapters_read: Math.round(read * 0.16), readers: 284, coin_unlocks: 120, free_unlocks: 260 },
            { book: "last-train-home", chapters_read: Math.round(read * 0.07), readers: 161, coin_unlocks: 41, free_unlocks: 120 },
            { book: "city-of-paper", chapters_read: Math.round(read * 0.05), readers: 96, coin_unlocks: 21, free_unlocks: 79 },
          ],
        });
      }
      if (name === "admin_funnel") {
        const pts = [1, 2, 3, 4, 5, 8, 10, 15, 20, 30, 50, 80, 120, 200, 338];
        const v = [1102, 930, 782, 419, 380, 330, 264, 210, 175, 140, 99, 70, 48, 30, 12];
        return result(pts.map((c, i) => ({ chapter: c, readers: v[i] })));
      }
      return result(null);
    },
    from(table) { return query(table === "stories" ? stories : table === "chapters" ? chapters : []); },
    storage: { from: () => ({ upload: () => result(null), getPublicUrl: () => ({ data: { publicUrl: "img/MoonlessCover.jpg" } }) }) },
    functions: { invoke: () => result({ sent: 806 }) },
  };
};
