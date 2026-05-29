# Tabak LLC — VA Intake Team Dashboard

A full-stack team performance dashboard for the **Veterans Benefits** division at Tabak LLC.

Built with **Next.js 16**, **SQLite**, and **NextAuth.js**.

---

## Features

- 🔐 **Authentication** — Master (admin) and Regular (view-only) roles
- 📊 **Dashboard** — KPI summary cards, leaderboard, 4 interactive charts
- ✏️ **Daily Entry** — Log per-agent metrics each day (master only)
- 📥 **Excel Import** — Upload EOD Report.xlsx to load historical data
- 👥 **User Management** — Add users, reset passwords, toggle access

## Key Metrics Tracked

| Metric | Description |
|---|---|
| **CAPD** | Calls Attempted Per Day (target: 40/day) |
| **Signed Retainers** | Clients who signed — primary KPI |
| **Unsigned Retainers** | Pending conversions |
| **Conversion Rate** | Signed ÷ Total Cases |
| **CRH** | Client Refused Help |
| **Case Rejected** | Cases that could not proceed |

## Tech Stack

- [Next.js 16](https://nextjs.org/) — React framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — Local SQLite database
- [NextAuth.js v4](https://next-auth.js.org/) — Authentication
- [Recharts](https://recharts.org/) — Data visualization
- [xlsx](https://sheetjs.com/) — Excel import

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Seed the database (first time only)

```bash
npm run seed
```

This creates the SQLite database, all tables, and default users.

### 3. Start the server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Default Login Credentials

> ⚠️ Change these after first login via User Management.

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Master (full access) |
| `daniel` | `tabak2025` | Regular (view only) |
| `adriana` | `tabak2025` | Regular |
| `oliver` | `tabak2025` | Regular |
| `alejandra` | `tabak2025` | Regular |
| `omar` | `tabak2025` | Regular |

---

## Importing Historical Data

1. Log in as `admin`
2. Go to **Import Excel** in the sidebar
3. Upload your `EOD Report.xlsx` file
4. The app reads the **Acumulado** sheet and imports all records

---

## Project Structure

```
├── app/
│   ├── api/          # API routes (auth, performance, users, import)
│   ├── dashboard/    # Main dashboard page
│   ├── entry/        # Daily data entry (master only)
│   ├── import/       # Excel import page (master only)
│   ├── login/        # Login page
│   └── users/        # User management (master only)
├── components/
│   ├── charts/       # Recharts components
│   ├── Leaderboard   # Agent ranking table
│   ├── Navigation    # Sidebar
│   └── SummaryCards  # KPI metric cards
├── lib/
│   ├── auth.ts       # NextAuth configuration
│   └── db.ts         # SQLite connection
└── scripts/
    └── seed.js       # Database seeder
```

---

*Tabak LLC · Veterans Benefits Division*
