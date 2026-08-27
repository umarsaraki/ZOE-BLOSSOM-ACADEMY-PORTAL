# Zoe Blossom Academy

Single-page portal: one HTML file (public/index.html) containing Login,
Admin Panel, Teacher Dashboard, and Student Dashboard. It talks to a
real Node.js backend (server.js) backed by a real SQLite database
(db.js), so data is saved permanently and is the same for every user
on every device — not just stored in one browser.

## Files

- public/index.html — the entire front end: Login + Admin + Teacher +
  Student, all in one file. Uses fetch() to call the API in server.js.
- server.js — Express server. Serves index.html and exposes /api/*
  endpoints for login, logout, and admin actions.
- db.js — SQLite database connection and table setup.
- public/logo.jpg — school crest (shown on login and in every sidebar).
- public/building.jpg — school building photo (login background).
- .env.example — copy to .env and fill in your own values.
- .gitignore — excludes node_modules, .env, and the database files.
- package.json — dependencies and start scripts.

## Setup on your VPS

1. Install Node.js (18+) on the VPS.
2. Upload this whole folder.
3. Run: npm install
4. Copy .env.example to .env and set:
   - SESSION_SECRET (any long random string)
   - ADMIN_REG_NO (the admin login you want, e.g. ADMIN-001)
   - ADMIN_PASSWORD (the admin password you want)
5. Run: npm start
   (the admin account is created automatically on first start, from
   the ADMIN_REG_NO / ADMIN_PASSWORD values in your .env)
6. Visit your domain or http://your-vps-ip:3000 and sign in with the
   admin Registration Number and Password from step 4.

For production, keep it running after you close the terminal with pm2:
   npm install -g pm2
   pm2 start server.js --name zoeblossom
   pm2 save

## How it works

- Admin logs in → adds Students and Teachers from the Admin Panel
  (each gets their own Registration Number and Password).
- A Student logs in with their Registration Number/Password → sees
  the Student Dashboard automatically.
- A Teacher logs in → sees the Teacher Dashboard automatically.
- All of this data is stored in data/zoeblossom.db on the server, so
  it is visible to everyone from any device, and survives server
  restarts.
