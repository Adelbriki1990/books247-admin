# 24/7 Books Admin

**Live:** https://books-admin.mim-smart.com/ (also https://adelbriki1990.github.io/books247-admin/)  ·  demo: add `?demo`

A separate web app for managing 24/7 Books: add books and covers, upload chapters
from Word, publish to the iPhone app, see reading and money numbers, and send pushes.

- Plain HTML/CSS/JS — no build step. Host the folder anywhere (GitHub Pages, Netlify…).
- Talks only to the Supabase project `dkdahvuuzplqcwoenyda` (same as the app).
- Only accounts listed in `public.admins` can sign in or change anything
  (rules in `9isati/supabase/migrations/0003_admin.sql`).

Run locally: `python3 -m http.server 5180` in this folder, open http://127.0.0.1:5180

Add an admin (Supabase → SQL Editor):
    insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
