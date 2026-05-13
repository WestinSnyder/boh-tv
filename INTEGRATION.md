# BOH Score Screen — Integration & Deployment Guide

A complete reference for dropping the BOH Score Screen into an existing Node.js/Express website, configuring it, and running it on a Raspberry Pi TV display.

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [How It Works](#2-how-it-works)
3. [Prerequisites](#3-prerequisites)
4. [Step 1 — Copy the `boh/` folder to your server](#4-step-1--copy-the-boh-folder-to-your-server)
5. [Step 2 — Install the Express dependency](#5-step-2--install-the-express-dependency)
6. [Step 3 — Mount the module in your app](#6-step-3--mount-the-module-in-your-app)
7. [Step 4 — Verify the routes](#7-step-4--verify-the-routes)
8. [Step 5 — Protect the admin page](#8-step-5--protect-the-admin-page)
9. [Step 6 — Set up the Raspberry Pi display](#9-step-6--set-up-the-raspberry-pi-display)
10. [Using the Admin Page](#10-using-the-admin-page)
11. [Data Reference](#11-data-reference)
12. [Changing the Mount Path](#12-changing-the-mount-path)
13. [Standalone Docker Option](#13-standalone-docker-option)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What This Is

The BOH Score Screen is a **self-contained Express module** (`boh/`) that adds two pages to your existing website:

- **`/boh/display`** — A fullscreen metrics dashboard meant to run in a browser on a TV. It auto-refreshes every 30 seconds with no user interaction required.
- **`/boh/admin`** — A staff-facing form where managers update the metrics shown on the display.

All data is stored in a single JSON file (`boh/boh-data.json`) on your server. There is no database.

---

## 2. How It Works

```
Your existing Node.js site
    └── app.use('/boh', require('./boh'))
            ├── GET  /boh/display      → serves the TV display page
            ├── GET  /boh/admin        → serves the admin update form
            ├── GET  /boh/api/data     → returns boh-data.json as JSON
            └── POST /boh/api/data     → overwrites boh-data.json

Raspberry Pi (in the break room, pointed at a TV)
    └── Chromium browser → https://yourdomain.com/boh/display
            └── polls /boh/api/data every 30 seconds and re-renders
```

When a manager fills in the admin form and clicks **Upload and Save**, the browser POSTs the new data to `/boh/api/data`. The next time the TV display polls (within 30 seconds), it fetches the updated data and re-renders automatically. No page reload, no manual intervention.

---

## 3. Prerequisites

- Your website runs **Node.js** with **Express 4.x** already installed.
- You have SSH or file-transfer access to your server (FTP, SFTP, rsync, git deploy, etc.).
- The Raspberry Pi has Raspberry Pi OS (or any Debian-based Linux) installed and is on the same network as your domain, or pointed at the live URL.

---

## 4. Step 1 — Copy the `boh/` folder to your server

The only folder you need to deploy is `boh/`. Copy it into the root of your existing website project — the same directory that contains your main `app.js` (or `server.js`, `index.js`, etc.).

Your server directory should look something like this after copying:

```
your-website/
├── app.js            ← your existing entry point
├── package.json
├── boh/              ← drop this folder in here
│   ├── index.js
│   ├── boh-data.json
│   └── public/
│       ├── display.html
│       └── admin.html
└── ... (rest of your site)
```

**Important:** The `boh/boh-data.json` file must be **writable** by the Node.js process. On Linux servers, check that the user running your Node process has write permission to that file:

```bash
chmod 664 boh/boh-data.json
```

---

## 5. Step 2 — Install the Express dependency

The `boh/` module only needs `express`, which your site almost certainly already has. Confirm it is in your `package.json` dependencies:

```json
"dependencies": {
  "express": "^4.18.2"
}
```

If it is not there, install it:

```bash
npm install express
```

No other packages are needed. There is no build step — the HTML/CSS/JS files are served as-is.

---

## 6. Step 3 — Mount the module in your app

Open your main Express entry file (`app.js`, `server.js`, or `index.js`) and add **one line** to mount the BOH module:

```js
app.use('/boh', require('./boh'));
```

**Where to put it:** Add it anywhere after your middleware setup (body parsers, session, auth) but before your 404/error handlers. Example:

```js
const express = require('express');
const app = express();

// ... your existing middleware ...
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ... your existing routes ...

// ↓ Add this line
app.use('/boh', require('./boh'));

// ... your existing 404 / error handlers ...
app.listen(3000);
```

That's the entire integration. Restart your server and the routes are live.

---

## 7. Step 4 — Verify the routes

After restarting your server, confirm all four routes respond correctly:

| URL | Expected result |
|-----|-----------------|
| `https://yourdomain.com/boh/display` | Fullscreen TV display page loads |
| `https://yourdomain.com/boh/admin` | Admin form loads, pre-filled with current data |
| `https://yourdomain.com/boh/api/data` (GET) | Returns raw JSON from `boh-data.json` |
| `https://yourdomain.com/boh/api/data` (POST) | Used by the admin form internally |

If the display page shows `—` in every cell, the API fetch is working but the data file is empty or malformed — see [Troubleshooting](#14-troubleshooting).

---

## 8. Step 5 — Protect the admin page

The POST endpoint (`/boh/api/data`) has **no authentication of its own** by design — it relies on your site's existing auth layer. Before going live, make sure `/boh/admin` (and ideally `/boh/api/data`) is behind whatever login or IP restriction your site already uses.

If your site has no auth and you need to add basic protection quickly, here is a minimal Express middleware approach to add before the `app.use('/boh', ...)` line:

```js
// Basic username/password gate for all /boh routes
app.use('/boh', (req, res, next) => {
  // Allow unauthenticated access to the display page and the read API
  if (req.path === '/display' || (req.path === '/api/data' && req.method === 'GET')) {
    return next();
  }
  // Check session or simple basic auth here
  if (!req.session?.isStaff) {
    return res.redirect('/login');
  }
  next();
});

app.use('/boh', require('./boh'));
```

The exact implementation depends on your auth system. The key point: **the display page and GET /api/data can stay public** (the Raspberry Pi needs them without credentials). Only the admin page and POST endpoint need protection.

---

## 9. Step 6 — Set up the Raspberry Pi display

### Hardware

- Raspberry Pi 4 (2 GB RAM or more recommended)
- HDMI cable to TV (use the micro-HDMI port closest to the USB-C power port for 4K/60Hz)
- Raspberry Pi OS (Bookworm or Bullseye desktop recommended)

### Point Chromium at the display URL

Run this command to launch Chromium in full-screen kiosk mode:

```bash
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --app=https://yourdomain.com/boh/display
```

Replace `https://yourdomain.com/boh/display` with your actual URL.

### Auto-start on boot

Create the autostart directory and a `.desktop` launcher file:

```bash
mkdir -p ~/.config/autostart
nano ~/.config/autostart/boh-display.desktop
```

Paste the following content (replace the URL):

```ini
[Desktop Entry]
Type=Application
Name=BOH Display
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --app=https://yourdomain.com/boh/display
X-GNOME-Autostart-enabled=true
```

Save and close. On the next reboot, Chromium will launch automatically into the display.

### Disable screen blanking (prevent the TV from going to sleep)

Add these lines to `~/.config/autostart/disable-blanking.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Disable Blanking
Exec=xset s off -dpms
```

Or run once and it will persist:

```bash
xset s off -dpms
```

### Optional: hide the mouse cursor

Install `unclutter` to hide the cursor after a few seconds of inactivity:

```bash
sudo apt install unclutter
```

Add to autostart:

```ini
[Desktop Entry]
Type=Application
Name=Hide Cursor
Exec=unclutter -idle 1 -root
```

---

## 10. Using the Admin Page

Navigate to `https://yourdomain.com/boh/admin` on any browser (phone, tablet, or computer).

The form mirrors the layout of the TV display so every field maps visually to its position on screen.

### Fields

**Focus Item** — The current training or attention item. Enter a short name (displayed large) and an optional description.

**Monthly Focus** — A single word or short phrase shown large in the top-right cell (e.g., `TIME`, `SPEED`, `QUALITY`). Optional description below it.

**CEM Metrics (1 and 2)** — Customer Experience Metrics. The metric label (e.g., "Taste", "Temperature") was set when the data was first created and displays as the card header — only Goal and Actual scores are editable here. Actual scores display **green** when above goal and **red** when below.

**ERQA Opportunities** — Employee Recognition / Quality Assurance focus area. Enter a title and a body description.

**Food Cost / Food Waste** — Each section has two parts:
- *Cycling rows* — up to as many rows as you want. They scroll up on the TV display (conveyor-belt style) when there are more than 2. Click **+ Add Row** to add one, click the `▶` arrow to expand and edit it, click `✕` to remove it.
- *Pinned row* — always visible at the bottom, labeled "Total Cost" or "Total Waste" (label is fixed). Edit the price and month.

Prices are entered **without** the `$` sign in the input (the `$` prefix is shown automatically). They are stored with the `$` included in the data file.

### Submit buttons

- **Upload and Save** — Sends the data to the server AND downloads a dated `.txt` snapshot file (`boh-metrics-YYYY-MM-DD.txt`) to your device for records.
- **Upload and Don't Save** — Sends the data to the server only, no download.

Both buttons are disabled during the upload to prevent double-submits. A status message appears confirming success or failure. The TV display will pick up the new data within 30 seconds.

---

## 11. Data Reference

The data is stored in `boh/boh-data.json`. You can edit it directly in a text editor if needed — changes take effect on the next poll cycle (up to 30 seconds). The file must remain valid JSON.

```json
{
  "monthlyFocus": "TIME",
  "monthlyFocusDesc": "Optional subtitle under the focus word",
  "focusItem": {
    "name": "Pickles!",
    "description": "How do you place perfect pickles?"
  },
  "cem": {
    "metric1": { "label": "Taste",       "goal": 80, "actual": 82 },
    "metric2": { "label": "Temperature", "goal": 80, "actual": 76 }
  },
  "erqa": {
    "title": "Fry Temperatures",
    "body": "Don't let them sit more than 2 minutes in the chute!"
  },
  "foodWaste": {
    "cycling": [
      { "item": "Filets",  "price": "$657.10", "month": "March" },
      { "item": "Nuggets", "price": "$312.40", "month": "March" }
    ],
    "pinned": { "item": "Total Waste", "price": "$8,332", "month": "February" }
  },
  "foodCost": {
    "cycling": [
      { "item": "Nuggets", "price": "$784.60", "month": "March" }
    ],
    "pinned": { "item": "Total Cost", "price": "$3729.80", "month": "February" }
  },
  "quote": "\"Showing genuine care by engaging in moments that enrich and restore those we serve.\""
}
```

**Notes:**
- `goal` and `actual` in the CEM section are **numbers**, not strings.
- All prices in `foodWaste` and `foodCost` are **strings with a `$` prefix** (e.g., `"$657.10"`).
- The `quote` field can contain escaped quote characters (`\"`) for quoted text.
- The `cycling` array can have zero or more entries. With 0–2 entries there is no scroll animation; with 3+ entries the display scrolls them.

---

## 12. Changing the Mount Path

If you want the module at a different URL path (e.g., `/scores` instead of `/boh`), change two things:

**1. The mount line in your app:**

```js
app.use('/scores', require('./boh'));
```

**2. The `API_URL` constant in both HTML files:**

In `boh/public/display.html` (line ~364):
```js
const API_URL = '/scores/api/data';
```

In `boh/public/admin.html` (line ~499):
```js
const API_URL = '/scores/api/data';
```

Both pages use this constant for all fetch calls, so updating it in each file is sufficient.

---

## 13. Standalone Docker Option

If you want to run the BOH Score Screen as a **completely standalone server** (not integrated into an existing site), a `Dockerfile` and `docker-compose.yml` are included.

```bash
# Start with Docker Compose (recommended — keeps data across restarts)
docker compose up -d

# The server runs on port 3000:
# http://localhost:3000/boh/display
# http://localhost:3000/boh/admin
```

The `docker-compose.yml` bind-mounts `boh/boh-data.json` from your host into the container, so data is preserved across container restarts and updates. **Without this bind-mount, all data resets when the container restarts.**

To update the app after making changes to the code:

```bash
docker compose down
docker compose up -d --build
```

---

## 14. Troubleshooting

**Display shows `—` in all cells**

The page loaded but the API fetch failed or returned empty data. Check:
1. Visit `https://yourdomain.com/boh/api/data` directly — it should return JSON.
2. If it returns a 404, the module is not mounted or is mounted at a different path.
3. If it returns a 500, Node.js cannot read `boh-data.json` — check the file exists and is readable.
4. If the JSON is `{}` or `null`, populate the file with the example data from [Section 11](#11-data-reference).

**Admin form loads but submit fails**

1. Open the browser console (F12 → Console) — look for the error message.
2. A 404 on POST means the route isn't mounted. A 500 means Node.js cannot write `boh-data.json` — check file write permissions (`chmod 664 boh/boh-data.json`).
3. If your server runs behind a reverse proxy (nginx, Apache), confirm it forwards POST request bodies. Express's `express.json()` middleware (included in `boh/index.js`) handles the parsing.

**Raspberry Pi display goes blank / screen sleeps**

Run `xset s off -dpms` on the Pi (see [Section 9](#9-step-6--set-up-the-raspberry-pi-display)). If using a TV instead of a monitor, also check the TV's own sleep/CEC settings.

**Chromium shows a "restore pages" banner on reboot**

Add `--disable-session-crashed-bubble` and `--disable-restore-session-state` to the Chromium launch flags. The `--noerrdialogs` flag also suppresses most banners.

**Font or layout looks wrong on the TV**

The display uses viewport-relative units (`vh`, `vw`) and is designed for a 16:9 screen at 1080p or higher. If the TV is set to a non-standard resolution or the browser zoom is not at 100%, reset it: in Chromium kiosk mode, add `--force-device-scale-factor=1` to the launch flags.

**Data file gets corrupted**

The POST handler writes the entire file atomically (`fs.writeFileSync`). If a write was interrupted (power outage mid-POST), the file may contain partial JSON. Restore from a snapshot (downloaded via "Upload and Save") or re-enter the data via the admin form after replacing `boh-data.json` with the example template from [Section 11](#11-data-reference).

**Changes from admin aren't appearing on the display after 30 seconds**

Confirm the POST succeeded (check for the green success toast on the admin page). Then visit `/boh/api/data` directly to confirm the data was actually updated on the server. If the data updated but the display still shows old data, hard-refresh the display page once (`Ctrl+Shift+R`) — the polling timer resets on each page load.
