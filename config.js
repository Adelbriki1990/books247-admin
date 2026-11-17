// 24/7 Books Admin — connection settings.
// The "anon" key is the public key the iPhone app also uses; it is safe in a web page.
// Everything private is protected by Supabase rules: only accounts in the admins table
// can change books or read the numbers.
window.ADMIN_CONFIG = {
  supabaseUrl: "https://dkdahvuuzplqcwoenyda.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrZGFodnV1enBscWN3b2VueWRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjYwOTAsImV4cCI6MjEwNzY0MjA5MH0.503bmSNhRjExhCCp4HWJeq9C8DSttEiayyjQVf4WE38",
  // Prices in USD, used to estimate revenue from verified purchases (before Apple's cut).
  prices: {
    coins_100: 0.99, coins_500: 3.99, coins_1200: 7.99, coins_3000: 17.99, coins_starter: 0.99,
    vip_weekly: 4.99, vip_monthly: 12.99, vip_yearly: 59.99
  },
  // Books built into the app (not editable here, but their numbers show on the dashboard).
  builtIn: {
    "moonless": { title: "Moonless", genre: "Fantasy", chapters: 338 },
    "echo-chamber": { title: "The Echo Chamber", genre: "Drama", chapters: 5 },
    "last-train-home": { title: "The Last Train Home", genre: "Romance", chapters: 8 },
    "paper-kingdom": { title: "Paper Kingdom", genre: "Drama", chapters: 8 },
    "salt-and-ash": { title: "Salt and Ash", genre: "Fantasy", chapters: 8 },
    "midnight-shift": { title: "The Midnight Shift", genre: "Thriller", chapters: 8 }
  },
  freeChapters: 3
};
