# Autonomous Cafe Audio Management System

A 100% self-hosted, intranet-friendly web music player for a cafe: local file storage,
PostgreSQL, JWT access control, drag-and-drop playlist ordering, range-streaming playback
and a Telegram ingest bot.

**Zero third-party runtime services.** No Firebase, no Supabase, no S3, no CDN. Everything
(database, audio files, auth, UI) runs on your own VPS. If the outbound link to Telegram
disappears, the bot degrades gracefully and the cafe player keeps working locally.

---

## 1. Stack (as delivered)

| Spec requirement | Implementation in this repo |
| --- | --- |
| React + Tailwind dark cafe UI | React 19 via Next.js App Router (`src/app`, `src/components`), Tailwind v4 (`src/app/globals.css`) |
| `@hello-pangea/dnd` drag & drop | `src/components/playlist-board.tsx` |
| `lucide-react` icons | used across all components |
| HTML5 audio engine | `src/hooks/use-audio-player.ts` (single `Audio` element, Fisher–Yates shuffle, repeat one/all) |
| Node.js backend + Express routes | Next.js **route handlers** (`src/app/api/**`) — same REST contracts, same Node runtime, one process to deploy |
| Prisma ORM | **Drizzle ORM** (`src/db/schema.ts`) — identical models (User, Category, Song, SystemConfig) + `TelegramWhitelist` |
| PostgreSQL (self-hosted) | `DATABASE_URL` in `.env`, pooled `pg` client (`src/db/index.ts`) |
| Multer local disk storage | `src/lib/storage.ts` + `src/app/api/songs/upload/route.ts` (streamed `FormData` → `./uploads/songs`) |
| Static serving with HTTP 206 | `src/app/api/stream/[id]/route.ts` (full `Range` parsing: `bytes=a-b`, `a-`, `-suffix`, 416, HEAD) |
| JWT auth (HttpOnly cookie *or* Bearer) | `src/lib/auth.ts` (`jose` HS256 + `bcryptjs` hashing) |
| Telegraf.js bot | `src/server/telegram/bot.ts`, long-poll worker `src/server/telegram/launch.ts`, webhook `src/app/api/telegram/webhook/route.ts` |
| `music-metadata` tag/duration extraction | `src/lib/audio-meta.ts` (with dependency-free WAV/MP3 header fallback, never throws) |

---

## 2. Data model (`src/db/schema.ts`)

* **users** — `id uuid pk`, `username unique`, `password` (bcrypt), `role` enum `ADMIN|GUEST`, `created_at`
* **categories** — `id uuid pk`, `name`, `slug unique`, `description`, `accent`, `order`, `created_at`
* **songs** — `id uuid pk`, `title`, `artist` (default `Unknown Artist`), `file_path` (relative to `uploads/`),
  `mime_type`, `size_bytes`, `duration` (seconds), `order`, `source` `WEB|TELEGRAM|SEED`, `uploaded_by`,
  `category_id → categories.id ON DELETE CASCADE`, `created_at`
* **system_config** — fixed `id = 1`, `allow_guest_upload bool`, `cafe_name`, `updated_at`
* **telegram_whitelist** — `id uuid pk`, `telegram_id unique`, `label`, `created_at`

`src/db/bootstrap.ts` applies idempotent DDL (`CREATE TABLE IF NOT EXISTS`, enum guards) and seeds
default accounts, four playlists and six royalty-free ambient demo tracks on first boot — so a fresh
VPS install is playable immediately, offline.

---

## 3. API contracts

| Method & path | Auth | Description |
| --- | --- | --- |
| `POST /api/auth/login` | public | `{ token, user: { id, username, role } }` + HttpOnly `cafe_session` cookie |
| `GET /api/auth/me` | public | current session (or `null`) |
| `POST /api/auth/logout` | public | clears the cookie |
| `GET /api/categories` | public | `Array<Category>` with `songCount` / `totalDuration` |
| `POST /api/categories` | ADMIN | create playlist (auto unique slug) |
| `PUT /api/categories` | ADMIN | `{ categoryOrders: [{ id, order }] }` |
| `PATCH /api/categories/:id` | ADMIN | rename / edit description / accent |
| `DELETE /api/categories/:id` | ADMIN | cascade-deletes songs **and** their files on disk |
| `GET /api/songs?categoryId=…` | public | ordered by `order ASC` (`&stats=1` adds library totals **and** `categoryStats` for the requested playlist) |
| `POST /api/songs/upload` | ADMIN, or GUEST when `allowGuestUpload` | multipart: `file`, `categoryId`, `title?`, `artist?`, `duration?` |
| `PUT /api/songs/reorder` | ADMIN | `{ categoryId, songOrders: [{ id, order }] }` (single transaction) |
| `PATCH /api/songs/:id` | ADMIN | rename / move to another playlist |
| `DELETE /api/songs/:id` | ADMIN | `{ success: true }` + removes the local file |
| `GET /api/config` | public | `{ allowGuestUpload, cafeName, updatedAt }` |
| `PATCH /api/config` | ADMIN | `{ allowGuestUpload?, cafeName? }` |
| `GET /api/stream/:id` | public | audio bytes, `Accept-Ranges: bytes`, `206 Partial Content`, `416` on bad range |
| `GET/POST/DELETE /api/telegram` | ADMIN | bot reachability probe + whitelist CRUD |
| `GET/POST /api/telegram/runtime` | ADMIN | start/stop the bot from the UI (`{ action: "start" \| "stop" }`) — the in-app `npm run bot` |
| `POST /api/telegram/webhook` | Telegram | webhook transport (optional secret token header) |
| `GET /api/health` | public | DB, storage, telegram and library status |

Every handler is wrapped in `withErrorHandling` (`src/lib/http.ts`) → structured
`{ error, code }` JSON with the right HTTP status; no unhandled promise rejections.

---

## 4. Access control

| Capability | ADMIN | GUEST (signed in) | Anonymous |
| --- | --- | --- | --- |
| Play / browse | ✅ | ✅ | ✅ |
| Upload | ✅ always | ✅ only if `SystemConfig.allowGuestUpload` | ❌ |
| Reorder, delete, manage playlists, toggle switches | ✅ | ❌ | ❌ |

Default seeded accounts (override with `ADMIN_*` / `GUEST_*` env vars before first boot):

* `admin` / `cafe1404` — ADMIN
* `barista` / `guest1404` — GUEST

---

## 5. Running it

```bash
npm install
cp .env .env.local          # optional; .env already contains working defaults
npm run build && npm start  # production (http://localhost:3000)
npm run dev                 # development
```

Environment (`.env`):

```ini
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
JWT_SECRET=change-me
UPLOAD_DIR=./uploads
MAX_UPLOAD_BYTES=62914560
ADMIN_USERNAME=admin
ADMIN_PASSWORD=cafe1404
GUEST_USERNAME=barista
GUEST_PASSWORD=guest1404
TELEGRAM_BOT_TOKEN=            # empty = bot disabled, web app unaffected
TELEGRAM_BOT_USERNAME=CafeMusicSyncBot
TELEGRAM_API_ROOT=https://api.telegram.org
TELEGRAM_WEBHOOK_SECRET=
```

Schema is applied automatically at runtime; to sync manually use `npx drizzle-kit push`.
Regenerate the bundled demo tracks with `node scripts/generate-seed-audio.mjs`.

---

## 6. Telegram bot — setup and daily use

The bot is **optional**. With `TELEGRAM_BOT_TOKEN` empty the web app is fully functional;
the admin panel simply reports "bot disabled".

### 6.1 One-time setup

1. **Create the bot.** In Telegram, message [@BotFather](https://t.me/BotFather) →
   `/newbot` → choose a display name → choose a username ending in `bot`
   (e.g. `CafeMusicSyncBot`). BotFather replies with a token like
   `8123456789:AAH2v...`.
2. **Put the token in `.env`:**
   ```ini
   TELEGRAM_BOT_TOKEN=8123456789:AAH2v...
   TELEGRAM_BOT_USERNAME=CafeMusicSyncBot
   ```
3. **Start the bot.** Two options:

   **a) From the website (recommended — no terminal needed).**
   Sign in as admin → **مدیریت / Admin** → *ربات همگام‌سازی تلگرام* → press
   **«اتصال ربات تلگرام»**. The bot starts inside the running web server and the
   panel shows a green banner on success, or a red one if the network is down.

   **b) From a terminal**, as a separate long-poll worker:
   ```bash
   npm run bot
   ```
   You should see `[telegram] launching long-poll worker as @CafeMusicSyncBot`.

   > Use **one** of the two at a time: Telegram allows a single `getUpdates`
   > consumer per token.
4. **Whitelist your staff.** Each person opens the bot and sends `/whoami`; the bot replies
   with their numeric Telegram ID. In the web app: sign in as admin → **Admin** →
   *Telegram sync bot* → paste the ID + a label → **Whitelist**.
   (Alternatively flip **Allow guest uploads** on, and anyone who can reach the bot may add
   music.)

Run it as a service so it survives reboots:

```ini
# /etc/systemd/system/cafe-bot.service
[Unit]
Description=Cafe Music Telegram Bot
After=network.target postgresql.service
[Service]
WorkingDirectory=/opt/cafe-audio
ExecStart=/usr/bin/npm run bot
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
```

### 6.2 Daily use

1. Open a chat with your bot (or add it to a staff group).
2. **Send or forward an audio file** — an MP3 from your phone, a forwarded track from
   another chat, MP3/M4A/WAV/FLAC/OGG all work. Files sent as *documents* are accepted too.
3. The bot replies **"Which playlist should it join?"** with one button per category
   (Chill, Study, …) read live from PostgreSQL.
4. **Tap a button.** The bot downloads the file through the Telegram API, writes it into
   `uploads/songs/`, reads title/artist/duration with `music-metadata`, appends it at
   `max(order)+1` in that playlist and edits its message to:
   ```
   ✅ Added to the cafe player.
   🎵 Velvet Hour — Night Service
   🗂 Playlist: Chill (position #7)
   ⏱ Duration: 3:41
   ```
5. Refresh the web player (or switch tabs) — the track is there and playable.

Commands: `/start` · `/help` · `/list` (show playlists) · `/whoami` (show your Telegram ID
and whether you have upload access).

### 6.3 Webhook instead of polling

If your VPS is reachable from the internet over HTTPS, skip `npm run bot` and register:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://your-domain/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

### 6.4 If Telegram is blocked (intranet cut-off)

The worker logs `launch failed … retrying in Ns` and keeps retrying with exponential
backoff (5 s → 2 min); the admin panel shows *"Telegram unreachable … Local playback and
uploads keep working."* Nothing in the cafe player degrades — playback, uploads, reordering
and streaming are entirely local. Set `TELEGRAM_API_ROOT` if you proxy the API through a
reachable mirror.

---

## 7. Player features

One-click **«پخش تصادفی»** in the header (randomises the visible playlist and the play
queue for this browser only — nothing is written to the database, so guests can use it
and other people's ordering is untouched) · play/pause · next/prev (prev restarts the
track in the first 3 s) · continuously updating
seek bar with scrub preview · volume slider + mute · Fisher–Yates shuffle bag (no repeats
until the bag is exhausted) · repeat off/all/one · buffering + error states · keyboard
transport (`Space`, `←/→` ±5 s, `Shift+←/→` track skip, `M` mute) · drag-and-drop reordering
for admins with optimistic UI and automatic rollback if the server rejects the change.

---

## 9. What changed in this revision

| # | Request | Where |
| --- | --- | --- |
| 1 | `.env.local` must not be tracked by Git | `.gitignore` (+ `git rm --cached`). **The previously committed bot token is in Git history — revoke it in @BotFather.** |
| 2 | Header shuffle button | `src/components/cafe-app.tsx` (`handleShuffleAll`), reuses the existing `fisherYates` helper. Client-side only. |
| 3 | Start the Telegram bot from the UI instead of `npm run bot` | `src/server/telegram/runtime.ts` + `POST /api/telegram/runtime` + the button/banner in `src/components/admin-panel.tsx` |
| 4 | Warn users who send music before the bot is connected | Standby long-poll listener in `src/server/telegram/runtime.ts`, armed at boot by `src/instrumentation.ts` |
| 5 | Upload dialog was unscrollable behind the player dock | `src/components/player-dock.tsx` publishes `--player-dock-height`; `Modal` in `src/components/ui.tsx` reserves it as bottom padding |
| 6 | Interface language | Web UI is **English** (`src/lib/i18n.ts`, `lang="en"`), while the **Telegram bot stays Persian** (`src/server/telegram/bot.ts` + the standby reply in `src/server/telegram/runtime.ts`) |
| 7 | No changes to the existing look & feel | Only strings, direction and the two additive controls changed. Layout, spacing, colours and component structure are untouched; numbers/media controls stay LTR on purpose. |

### Notes

* **Language split:** the website is English; the Telegram bot deliberately replies in
  Persian. UI copy lives in `src/lib/i18n.ts`; bot copy lives in `src/server/telegram/`
  and is intentionally not part of that dictionary.
* **Shuffle is not reverted any more.** The 5 s background poll used to compare the
  *library-wide* song count against the *current playlist's* length; with more than one
  non-empty playlist that was permanently true, so the list was refetched every 5 s and
  the shuffled order was overwritten by the stored DB order. `GET /api/songs?stats=1`
  now also returns `categoryStats` (scoped to the requested playlist), the client
  compares like with like, and the poll additionally skips refetching while the user is
  viewing a locally shuffled order.
* **Telegram API root:** `TELEGRAM_API_ROOT` is now honoured everywhere. It defaults to
  the project's Cloudflare Worker mirror because `api.telegram.org` is filtered on some
  networks; set it to `https://api.telegram.org` on an unfiltered one. The previous
  hard-coded value contained a trailing space, which broke request URLs.
* **Fonts:** unchanged from the original (`Inter` + system stack), resolved locally with
  no network fetch so the app stays fully offline-capable.
