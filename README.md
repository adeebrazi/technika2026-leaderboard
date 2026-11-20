# Technika 2026 Live Leaderboard & Winner Console

A standalone, real-time festival leaderboard and winner management console for **Technika 2026**, built with Neo-Brutalist design and powered by **Supabase Realtime**.

Part of the **Technika 6.0** multi-project ecosystem alongside:
- `Dashboard`: Official Festival & Event Coordinator Management System
- `Main Website`: Public Festival Portal
- `Leaderboard`: Live Projector Display & Winner Management Console

---

## 🚀 Key Features

- **Split Public Leaderboard (`index.html`)**:
  - Live **Boys (`♂`)** & **Girls (`♀`)** Top 10 rankings.
  - Overall **University / Institution Championship** rankings.
  - Medal podiums (🥇 Gold, 🥈 Silver, 🥉 Bronze) with dynamic badge counters.
  - Instant live filtering by competition category, university, or participant name.
  - Real-time Supabase Postgres changes subscription + auto 15s refresh for projector stages.

- **Admin Winner Console (`admin.html`)**:
  - Direct web portal to award **1st Place (10 pts)** and **2nd Place (7 pts)** per event.
  - Autocomplete search by participant name, registration ID, or college.
  - Live podium visualization with one-click revocation / editing.

---

## 🛠️ Quick Start

### 1. Run with Vite (Recommended)
```bash
cd "z:\Technika 6.0\Leaderboard"
npm install
npm run dev
```
The server will start at `http://localhost:3001`!
- Public Leaderboard: `http://localhost:3001/`
- Winner Console: `http://localhost:3001/admin.html`

### 2. Run with Python
```bash
cd "z:\Technika 6.0\Leaderboard"
python -m http.server 3001
```

### 3. Build for Production
```bash
npm run build
```
The optimized multi-page output is placed in `./dist`.

---

## 🌐 Deployment
This project is 100% static-compatible. Pre-configured with `vercel.json`:
- **Vercel**: Deploy directory `./Leaderboard` directly.
- **Custom Domain**: e.g., `https://leaderboard.technika2026.online`
