# Roamly — Complete Project Blueprint

**One app that plans your whole trip and connects you to everything you need to take it.**

*Version 2.1 · 13 Nov 2026 · Owner: A. V. Vignesh Chowdary · Status: decisions locked, Phase 0 in progress*

> **v2.1 changes (13 Nov 2026).** The UI was started with v0 in Next.js + TypeScript, and the internship brief allows both, so the stack moved from Vite + Express + plain JS to **Next.js App Router + TypeScript**. Wherever later sections say Express, `server/` or `src/`, read: Next.js route handlers in `app/api/*`, server-only code in `lib/server/`, client code in `components/`, `hooks/` and `lib/`. **Submission scope** (see the brief): core planner + every stretch goal (blocks, streaming, refine loop, save/reload, polish), local storage first, then Supabase. Trains, explore, package and checkout screens are kept out of the submission until their phase, because they currently show sample data.

---

## 0. Locked decisions

| Topic | Decision |
|---|---|
| App name | **Roamly** |
| Frontend | **Next.js 16 (App Router) + React 19 + TypeScript**, Tailwind CSS + shadcn/Base UI components, functional components + hooks only |
| Backend | Next.js **route handlers** under `app/api/*`; server-only code in `lib/server/` (never imported by client components) |
| Primary AI | **Groq** (fast, free tier) |
| Backup AI | **Gemini** (automatic fallback on rate limit/outage) |
| No-key mode | **Mock provider**, so `npm install && npm start` always works |
| Optional AI | OpenRouter, Ollama (local) through the same provider interface |
| State | `useReducer` + context, with an undo/redo history wrapper |
| Drag & drop | @dnd-kit (touch + mouse + keyboard) |
| Maps | Leaflet + OpenStreetMap tiles (no key) |
| PWA | Web app manifest + a small service worker (Next.js) |
| Device storage | IndexedDB (`idb` library) behind a `TripStore` interface; localStorage only for small settings |
| Cloud | Supabase free tier (Postgres + auth + row-level security) as a second `TripStore` implementation, added after local storage works |
| Checkout | **Simulated by default**, clearly labelled DEMO. **Razorpay test mode** switches on automatically when test keys are present |
| Hosting | **Vercel** (free tier, native Next.js support) |
| Tests | Vitest (unit + server), Playwright (E2E, Phase 10), GitHub Actions CI |
| Repo | Public GitHub repo, one commit per meaningful change, a tag per phase |
| Submission tags | `v1.0-core` (end of Phase 3) and `v2.0-full` (all finished phases) |

---

## 1. Vision

A user describes a trip in plain words. Roamly asks a few smart questions, researches the destination with real data, and builds a complete travel package: a day-by-day plan, how to get there (train, flight, bus or road), where to stay, how to move around locally, and what it costs. Everything stays editable, works offline once saved, and installs on a phone like a native app.

**Positioning:** "MakeMyTrip + a personal travel expert, powered by AI." India first (Vande Bharat, scenic railways, ₹ budgets, Indian booking sites), designed to go global.

**Demo principle:** use free APIs and real data wherever possible. Where real booking isn't possible for free, deep-link to the real site with details prefilled, and use a clearly labelled demo checkout. Never imitate a real company's site, and never invent live prices or timings.

---

## 2. Who it's for

| Persona | Needs |
|---|---|
| Student / backpacker | Cheapest route, trains and buses, hostels, budget tracking |
| Family | Relaxed pace, kid-friendly stops, safe stays, fewer transfers |
| Friends group | Shared plan, voting on stops, splitting costs |
| Rail enthusiast | Vande Bharat, scenic routes, the journey as the experience |
| Road tripper | Route, fuel and food stops, drive times, tolls |
| Explorer / local-style | Hidden spots, street food, local transport |
| Premium traveller | Best hotels, flights, cabs, minimal effort |

---

## 3. Complete feature list

### 3.1 Smart intake
- Free-form trip box (the brief's required input), with example prompts, a character counter, Ctrl/Cmd+Enter to submit, and voice input (Web Speech API, where supported).
- The intake agent extracts what's already known (destination, dates, days, travellers, budget, origin, mode) and returns **only the missing questions** as chips, sliders, date pickers or short text.
- Possible questions: start city, dates or flexible month, number of days, travellers (adults/kids/seniors), budget (total or per person), travel mode (train/flight/bus/own car/"suggest best"), stay type, food preference (veg/non-veg/Jain), accessibility needs.
- "Skip, just plan it" uses smart defaults.
- A saved traveller profile pre-fills future trips.

### 3.2 Travel style & preferences
- **Style:** 📸 Tourist · 🏘️ Like a local · 🧭 Explorer · 🌴 Relaxed · 👨‍👩‍👧 Family · 💰 Backpacker · ✨ Luxury · 🚆 Rail journey · 🚗 Road trip.
- **Pace:** relaxed (3–4 stops/day), balanced (4–5) or packed (5–7).
- **Interests:** food, history, nature, beaches, temples, nightlife, shopping, adventure, photography, wildlife.
- The style changes both what RAG retrieves and how the planner writes, e.g. "local" means markets, street food, buses and autos.

### 3.3 AI planner
- **Streamed plan:** days appear one by one.
- Each day has a title, theme, stops (time, duration, category, description, tip, coordinates), meals and the night's stay area.
- **Trip details blocks:** budget breakdown, weather for the dates, best time to visit, packing list, local tips, safety notes and useful phrases.
- A **"Why this plan"** box gives short reasons for the transport, stay and ordering choices.
- Weather-aware (outdoor stops on dry days) and opening-hours-aware where data exists.

### 3.4 AI editing
- **Refine with a sentence:** "make day 2 relaxed", "avoid flights", "add the Konkan rail route", "cheaper hotels".
- Quick chips: Cheaper · More relaxed · More food · Kid-friendly · Fewer transfers.
- **Regenerate one day**, with an optional note.
- **Swap a stop:** 3 AI alternatives to choose from.
- **Fill a gap:** add a stop between two others.
- **Fix my plan:** checks for too much travel, closed places and tight timings, then suggests patches the user can accept or reject.
- **Compare two versions:** budget vs comfort side by side; pick one.

### 3.5 Manual editing
- Expand and collapse days and stops.
- Drag and drop to reorder (touch, mouse, keyboard) with ↑/↓ buttons as a fallback; move a stop to another day.
- Remove stops or days, add custom stops, edit stop text inline.
- **Undo/redo** for every change, AI edits included (Ctrl+Z / Ctrl+Shift+Z, with toolbar buttons).
- Mark stops as done, with a progress bar per day.

### 3.6 🚆 Trains
- **Vande Bharat explorer:** browse by route or city with train number, timings, run days, duration, classes and an indicative fare range.
- **Scenic rail collection:** Konkan Railway, Nilgiri Mountain Railway, Darjeeling Himalayan Railway, Kalka–Shimla, Kangra Valley, the Araku Valley line and others. Each has highlights, best season and "add to trip".
- The AI picks trains that fit the plan's timing and adds them as transport stops.
- "Book on IRCTC" deep link. Every train record carries a "last verified" date and a "verify timings on IRCTC" label.
- Live running status and PNR status only if a reliable free API exists at build time.

### 3.7 ✈️ Flights
- Search from the origin for the trip dates, with cheapest, fastest and best tabs.
- Source: a free sandbox flight API if one is available at build time; otherwise prefilled deep links to Google Flights, Skyscanner and MakeMyTrip.

### 3.8 🚌 Buses
- Suggested intercity routes and typical durations, with prefilled deep links to redBus, AbhiBus and state transport sites.

### 3.9 🏨 Stays
- Real places from OpenStreetMap near each night's area (hotels, guesthouses, hostels, homestays).
- Budget, mid-range and premium tiers, each with an AI note on why it fits.
- Map pin, distance to the day's stops, and Booking.com / MakeMyTrip / Agoda / Google Hotels links.
- Prices are always shown as "estimate, check live price".

### 3.10 🚕 Local transport & cabs
- Distance and time between stops, with a suggested mode (walk, auto, metro, bus, cab).
- Uber and Ola deep links with pickup and drop prefilled where the URL scheme allows, plus an estimated fare range.
- Local passes and metro tips from RAG.

### 3.11 🚗 Road trips
- Full route on a map with legs, distance and drive time per day; daily drive time capped by pace.
- Food, fuel and rest stops and scenic viewpoints along the route.
- Fuel cost (mileage and fuel price as inputs) and a toll estimate where data exists.

### 3.12 Transport optimizer
- Compares train, flight, bus and road for each leg on cost, time, comfort, scenery and CO₂.
- Recommends one with a reason, e.g. "Vande Bharat + cab: ₹2.1k, 7h, scenic — recommended for Rail style".

### 3.13 🧳 Package, cart & checkout (demo)
- **Package screen:** transport, stays, day plan, local transport and the total per person on one page.
- **Cart:** trains, flights, buses, stays and cabs, plus traveller details.
- **Checkout:** simulated confirmation with a `RMLY-XXXXXX` reference, or Razorpay test mode if keys are set. Always shows a **DEMO / Test mode** banner; no real money.
- Each item also has a "Book on site" link for real booking.
- **Trip wallet:** tickets, references and documents, available offline.

### 3.14 Maps
- Leaflet map: the day route, pins colour-coded by category, hotels and transport legs.
- "Open in Google Maps" for each stop and for the whole day route.
- Tiles cached for viewed areas where the tile policy allows; the plan itself always works offline.

### 3.15 Sharing & export
- Native share sheet, copy as text, and a WhatsApp-friendly summary.
- Print/PDF with a clean print stylesheet; calendar export (.ics).
- Public read-only share link (Phase 9).

### 3.16 My Trips, profile & accounts
- My Trips: autosave, search, duplicate, delete, archive.
- Traveller profile: home city, food preference, budget level, accessibility.
- Optional sign-in and cloud sync (Phase 9).

### 3.17 PWA / app experience
- Installable with an icon, splash screen and standalone mode; an "Update available, reload" prompt.
- Offline: saved trips, wallet, packing list and the emergency card work; AI buttons are disabled with the reason "You're offline".
- Push reminders, e.g. "Your train leaves in 3 hours" (Phase 10).

### 3.18 Extras
1. **Emergency & safety card:** nearest hospitals, police and pharmacies (OSM), helplines, and safety tips including solo-women-traveller tips. Works offline.
2. **Permits & documents:** Inner Line Permit reminders (parts of North-East India), park entry and ID requirements.
3. **Festivals & events** during the dates.
4. **Accessibility filters:** senior-friendly, wheelchair-friendly, low-walking.
5. **Live budget tracker:** log real spends against the plan.
6. **Phrasebook:** a few local-language phrases per destination.
7. **Eco score:** CO₂ comparison across travel modes.
8. **Crowd & timing hints:** best time of day for popular spots.
9. **Templates gallery:** "Weekend from Hyderabad", "Monsoon in Kerala", "Best Vande Bharat trips".
10. **Dev panel:** tokens, cost, latency and cache hits per request, plus the chaos switches (§12.4).

### 3.19 UI/UX
- Mobile-first: bottom navigation on phones (Plan · Trips · Explore · Wallet · Profile); sidebar plus map split view on desktop (≥ 1024 px).
- Light and dark themes (auto or manual); motion that respects `prefers-reduced-motion`; skeleton loaders.
- WCAG AA contrast, full keyboard paths, visible focus rings, screen-reader labels and live regions for streaming status.
- Toasts with Undo; designed empty, loading and error states on every screen.

---

## 4. Design system

| Token | Value |
|---|---|
| Brand primary | Teal `#0F766E` (dark mode `#2DD4BF`) |
| Accent | Saffron `#F59E0B` |
| Danger / success | `#DC2626` / `#16A34A` |
| Neutrals | Slate scale |
| Font | Inter (system fallback); 14/16/18/22/28/36 scale |
| Radius | 8 px (controls), 16 px (cards), 24 px (sheets) |
| Spacing | 4 px base: 4, 8, 12, 16, 24, 32, 48 |
| Category colours | sight teal · food orange · activity violet · transport blue · stay pink · other slate |

Core components: Button, IconButton, Chip, Card, Sheet (bottom sheet on mobile, modal on desktop), Toast, Skeleton, Badge, Tabs, Stepper, EmptyState, ErrorCard, OfflineBanner, InstallPrompt.

---

## 5. AI system design

### 5.1 Pipeline
```
User text
  │
  ▼
① Intake agent (small model)         → known fields + missing questions (JSON)
  │  user answers chips
  ▼
② Research layer (NO LLM)             → Wikivoyage · OSM places & hotels · weather · routes · trains
  │  rank + trim to top facts
  ▼
③ Transport optimizer (rules + small model) → best option per leg, with reasons
  ▼
④ Planner agent (strong model, streamed NDJSON) → day plan grounded in fact IDs
  ▼
⑤ Validator (code)                    → schema check, salvage, geo/hours sanity, warnings
  ▼
UI → user edits → ⑥ Editor agents (small model): refine · day · swap · fill gap · fix plan
```

### 5.2 RAG sources
| Source | What we take | Cache |
|---|---|---|
| Wikivoyage (MediaWiki API) | See, Do, Eat, Sleep, Get around, Stay safe sections | 7 days per destination |
| OSM Overpass | Attractions, restaurants, hotels with coordinates, tags, opening hours | 3 days per area |
| Nominatim | Geocoding destination and origin | 30 days |
| Open-Meteo | Forecast, or climate averages if the dates are far away | 6 hours |
| OSRM / OpenRouteService | Road legs, distance, duration | 30 days per coordinate pair |
| `data/trains/*.json` (ours) | Vande Bharat + scenic routes | In repo, versioned |

**Retrieval:** filter by destination, then by style and interest tags, then rank with BM25 (keywords; free, fast). Embeddings come later (Phase 10). Each fact has a short ID (`P12`, `W3`). The prompt includes the **top 8–15 facts**, and the model must reference place IDs. Unknown IDs get a "not verified" badge.

**Cache:** in-memory LRU plus a JSON file cache on disk in Phase 4; Supabase table in Phase 9.

### 5.3 Model routing
| Task | Groq model class | Gemini fallback |
|---|---|---|
| Intake, swap, single-day edit, fill gap | Small/fast (e.g. Llama 3.1 8B instant) | Flash-Lite class |
| Full plan, whole-trip refine, fix plan | Strong (e.g. Llama 3.3 70B versatile) | Flash class |
| Search, routes, prices, maps, links | **No LLM** | — |

Exact model IDs live in `.env` so they can change without code changes. Confirm the current free models when building.

### 5.4 Credit saving
1. APIs search; the AI only chooses and explains.
2. Shareable data (guides, places, routes) is cached across all users.
3. Partial edits send only the affected day or stop plus a compact trip summary (under ~600 tokens).
4. Compact prompts: facts as one-liners, fixed JSON keys, no prose instructions repeated.
5. Output caps: stops per day by pace; description ≤ 200 characters; tip ≤ 120.
6. Plan cache: the same (destination, days, style, budget band, month) reuses a cached skeleton.
7. One repair retry at most; then fail cleanly.
8. Tokens and estimated cost are logged per request and shown in the dev panel.

### 5.5 Contracts
All live in `shared/contracts/`, each exporting `normalizeX(data) → { value, warnings }` or throwing `ModelOutputError`.

- **intake** → `{ known: { destination?, origin?, startDate?, days?, travellers?, budget?, mode?, style? }, questions: [{ id, label, type: "chips"|"multi"|"date"|"number"|"text", options?: string[], default? }] }`
- **plan stream (NDJSON, one object per line):**
  - `{"type":"meta","title","destination","summary","why":[...]}`
  - `{"type":"day","title","stayArea","stops":[{name,time,duration,category,description,tip,placeId?}]}` — one line per day
  - `{"type":"transport","legs":[{from,to,mode,choiceId?,reason}]}`
  - `{"type":"stays","nights":[{dayIndexes,area,options:[{placeId?,name,tier,why}]}]}`
  - `{"type":"info","budget":{currency,perPerson,breakdown:[{label,amount}]},"packing":[],"tips":[],"safety":[],"phrases":[]}`
- **refine** → full plan object (same fields, non-streamed)
- **day** → `{ title, stayArea, stops: [...] }`
- **alternatives** → `{ alternatives: [stop, stop, stop] }`
- **fixPlan** → `{ issues: [{ id, severity, message, patch: { op, dayIndex, stopIndex?, stop? } }] }`

### 5.6 Streaming design
- The server streams the model's tokens through a **brace-depth JSON object scanner** (tracks strings and escapes). It handles NDJSON, pretty-printed JSON split across lines, and chatter between objects.
- Each completed object is validated on its own; a bad line becomes a warning, not a crash.
- If the model ignores NDJSON and returns one big `{ days: [...] }` object, the server detects it and expands it into the same events.
- Server → client events (NDJSON over HTTP, `Content-Type: application/x-ndjson`):
  `meta · day(index) · transport · stays · info · warning(message) · retry(reason) · error(code,message,retryable,requestId) · done(warnings, usage)`

### 5.7 Failure handling matrix
| Problem | What happens | Mock trigger |
|---|---|---|
| Malformed JSON | Lenient extraction (fences, scanner) → one repair retry → error card with Retry | `[malformed]` |
| Wrong shape | Accept common variants; drop broken items with warnings; error only if nothing is usable | `[wrong-shape]` |
| Empty response | Failure → repair retry → error | `[empty]` |
| Slow | "Taking longer than usual…" at 8 s; idle timeout 20 s; total cap 90 s; Cancel | `[slow]` |
| Provider failure | Typed error; automatic fallback to Gemini once; then error with Retry | `[fail]` |
| Rate limited | Fallback provider, or "Busy, try again in N s" | `[ratelimit]` |
| Stream cut off | Keep received days, "Plan incomplete · Continue" resumes from the last day | `[cutoff]` |
| Stale response | Request ID + AbortController; old events ignored; unit-tested | rapid re-submit |
| AI edit vs user edit | Edits locked during whole-trip AI edits; partial edits target IDs and are dropped if the target no longer exists | — |
| Invented places | Cross-checked against RAG IDs → "not verified" badge | `[unverified]` |
| Prompt injection in user text | Treated as data; output still must pass the schema | `[inject]` |
| Corrupt saved trip | Re-validated on load; quarantined with a message | dev panel |
| Component crash | Error boundary per feature area with "Reload this section" | dev panel |
| Offline | AI actions disabled with a reason; saved data still works | airplane mode |

---

## 6. Backend API

| Method & path | Purpose | Response |
|---|---|---|
| `GET /api/health` | Status, provider in use, mock mode flag | JSON |
| `POST /api/intake` | `{ text }` → known fields + questions | JSON |
| `POST /api/plan/stream` | `{ text, answers, style, pace, interests, resumeFrom? }` | NDJSON events |
| `POST /api/refine` | `{ trip (compact), instruction }` | plan JSON |
| `POST /api/day` | `{ tripSummary, dayIndex, day, note? }` | day JSON |
| `POST /api/alternatives` | `{ tripSummary, dayIndex, stop }` | 3 stops |
| `POST /api/fix` | `{ trip (compact) }` | issues + patches |
| `GET /api/places?lat&lng&kind` | OSM POIs and hotels (cached) | JSON |
| `GET /api/route?coords` | Road route legs (cached) | JSON |
| `GET /api/weather?lat&lng&start&end` | Forecast or climate (cached) | JSON |
| `GET /api/trains?from&to&type` | Our dataset search | JSON |
| `GET /api/flights?from&to&date` | Sandbox API or deep links only | JSON |
| `POST /api/checkout` | Simulated or Razorpay test order | JSON |

**Error format (every non-stream endpoint):** `{ error: { code, message, retryable, requestId } }`.
Codes: `INVALID_INPUT · RATE_LIMITED · COST_CAP · TIMEOUT · UPSTREAM_ERROR · BAD_MODEL_OUTPUT · EMPTY_OUTPUT · CONFIG_ERROR · NOT_FOUND · OFFLINE`.

### 6.1 Environment variables (`.env.example`)
```
NODE_ENV=development
PORT=8787
LLM_PROVIDER=groq            # groq | gemini | openrouter | ollama | mock
LLM_FALLBACK=gemini          # or none
GROQ_API_KEY=
GROQ_MODEL_FAST=llama-3.1-8b-instant
GROQ_MODEL_STRONG=llama-3.3-70b-versatile
GEMINI_API_KEY=
GEMINI_MODEL_FAST=
GEMINI_MODEL_STRONG=
OPENROUTER_API_KEY=
OLLAMA_URL=http://localhost:11434
LLM_TIMEOUT_MS=30000
STREAM_IDLE_TIMEOUT_MS=20000
STREAM_TOTAL_TIMEOUT_MS=90000
RATE_LIMIT_PER_MIN=20
DAILY_COST_CAP_USD=1.00
ORS_API_KEY=                 # OpenRouteService (optional; OSRM used if empty)
NOMINATIM_CONTACT_EMAIL=     # required by the Nominatim usage policy
RAZORPAY_KEY_ID=             # test keys only; empty = simulated checkout
RAZORPAY_KEY_SECRET=
SUPABASE_URL=                # Phase 9
SUPABASE_ANON_KEY=
FEATURE_FLAGS=trains,stays,maps   # enabled modules
```
With no AI keys at all, the server runs in mock mode automatically and logs a clear notice.

---

## 7. Architecture

```
Browser (React PWA)
  ├─ features/* UI ── tripReducer + history (undo/redo) ── IndexedDB (trips, wallet, profile)
  ├─ api client (fetch, NDJSON reader, AbortController, request-ID stale guard)
  ├─ error boundaries per feature · feature flags · dev panel
  └─ service worker (app shell, static data, cached map tiles)
        │  same-origin /api/*
        ▼
Express server
  ├─ middleware/  requestId · securityHeaders · cors · bodyLimit · rateLimit · costCap · errorMapper · logger
  ├─ routes/      health · intake · plan · refine · day · alternatives · fix · places · route · weather · trains · flights · checkout
  ├─ ai/          providers/{groq,gemini,openrouter,ollama,mock} · router (fast/strong + fallback) · prompts · repair · usage
  ├─ rag/         wikivoyage · overpass · nominatim · weather · routing · trains · ranker(BM25) · cache(LRU+disk)
  └─ static       serves dist/ in production
shared/           contracts + jsonScanner + limits — imported by server AND client
data/             trains/vande-bharat.json · trains/scenic.json · deeplinks.js (URL templates + domain allowlist)
```

### 7.1 Folder structure
```
roamly/
├─ server/
│  ├─ index.js · app.js · config.js
│  ├─ middleware/ · routes/ · ai/ · rag/
├─ shared/
│  ├─ contracts/ (intake.js, plan.js, day.js, alternatives.js, fix.js)
│  ├─ jsonScanner.js · limits.js · errors.js
├─ data/ (trains/, deeplinks.js)
├─ src/
│  ├─ main.jsx · App.jsx
│  ├─ app/ (Layout, BottomNav, Router, providers)
│  ├─ features/
│  │  ├─ intake/ · planner/ · editing/ · trips/ · transport/ · trains/
│  │  ├─ stays/ · map/ · package/ · wallet/ · profile/ · extras/ · devpanel/
│  ├─ components/ (UI kit)
│  ├─ hooks/ (useStream, useAiAction, useOnline, useInstallPrompt, useTheme, useHotkeys)
│  ├─ state/ (tripReducer.js, history.js, selectors.js, tripModel.js)
│  ├─ lib/ (api.js, db.js, ids.js, format.js, deeplinks.js)
│  └─ styles/ (tokens.css, base.css, print.css)
├─ public/ (icons, manifest assets)
├─ tests/ (shared/, server/, state/, e2e/)
├─ docs/ (BLUEPRINT.md, ARCHITECTURE.md, AI-USAGE.md, RELIABILITY.md, DEMO-SCRIPT.md)
├─ .github/workflows/ci.yml
├─ CLAUDE.md · README.md · .env.example
```

### 7.2 Client data model
```js
/** @typedef {{ id, name, time, duration, category, description, tip, placeId?, lat?, lng?, verified, done, custom? }} Stop */
/** @typedef {{ id, date?, title, stayArea, stops: Stop[] }} Day */
Trip {
  id, schemaVersion, createdAt, updatedAt,
  input:   { text, answers, style, pace, interests },
  meta:    { title, destination, summary, why[], startDate?, travellers, budget },
  days:    Day[],
  transport: [{ id, from, to, mode, option, reason, links[] }],
  stays:   [{ id, dayIndexes[], area, options: [{ id, placeId?, name, tier, lat?, lng?, estPrice?, why, links[] }], chosenId? }],
  info:    { budget, weather[], packing[], tips[], safety[], phrases[] },
  warnings: string[],
  cart: [], wallet: [], spends: []
}
```
`schemaVersion` with migration functions, so old saved trips keep loading after updates.

### 7.3 State & undo
- `tripReducer` handles: `LOAD · STREAM_* · REPLACE_TRIP · REPLACE_DAY · REPLACE_STOP · ADD_STOP · REMOVE_STOP · REMOVE_DAY · MOVE_STOP · MOVE_STOP_TO_DAY · EDIT_STOP · TOGGLE_DONE · APPLY_PATCHES · SET_STAY · CART_*`.
- `withHistory(reducer)` keeps `past/present/future` (max 50 entries) for undoable actions; streaming actions are not undoable.
- UI-only state (expanded or collapsed) stays in components, not in the trip.

### 7.4 Request lifecycle (stale guard)
```
submit → id = ++requestId; controller?.abort(); controller = new AbortController()
       → for each event: if (id !== requestIdRef.current) ignore
       → on unmount/cancel: abort → server sees 'close' → aborts upstream LLM call
```

---

## 8. Phased roadmap

Each phase ends with a working, demo-able app, its own commits, passing tests and a git tag. Unfinished modules stay behind `FEATURE_FLAGS`.

### Phase 0 — Foundation
- Vite + React + Express setup, `npm start` runs both (concurrently), production serving.
- Config loader + env validation, security middleware, rate limit, cost cap, request IDs, error mapper.
- Provider interface with **mock + Groq + Gemini** and fallback router.
- `shared/` contracts, JSON scanner, limits; UI kit, tokens, light/dark theme; CI workflow.
- **Done when:** `npm install && npm start` works with no keys; `npm test` passes in CI; `/api/health` reports the provider.

### Phase 1 — Core AI planner ⭐
- Trip input, streamed plan, day and stop cards, expand/collapse, remove, reorder (dnd-kit + buttons), move between days, inline edit, undo/redo, toasts.
- All loading, error and empty states; the full failure matrix with mock triggers; stale guard; Cancel; resume after cut-off; error boundaries.
- Mobile-first layout.
- **Done when:** every mock trigger is handled with no crash; works at 360 px; reducer and scanner tests pass.

### Phase 2 — Smart intake, styles & AI editing
- Intake agent and question UI; style, pace and interests; refine bar and chips; regenerate day; swap stop; fill gap; trip details blocks; "why this plan".
- **Done when:** "Goa with friends" gives 3–5 questions, and the plan clearly changes between Tourist and Local styles.

### Phase 3 — PWA, My Trips & sharing ⭐ → tag `v1.0-core`
- Installable PWA, offline app shell, update prompt, offline banner.
- IndexedDB My Trips (autosave, search, duplicate, delete), profile, share/copy/print/.ics.
- README, AI-USAGE.md, RELIABILITY.md, dev panel with chaos switches, deploy to Render, demo recording.
- **Done when:** Lighthouse PWA passes and scores ≥ 90; a saved trip opens in airplane mode; the deployed URL works on a phone.

### Phase 4 — RAG grounding
- Wikivoyage, Overpass, Nominatim, Open-Meteo; BM25 ranker; caches; fact IDs in prompts; verified badges; weather-aware planning.
- **Done when:** ≥ 80% of stops map to real places with coordinates for 5 test destinations.

### Phase 5 — Maps, local transport & stays
- Leaflet day map, stop-to-stop distance and mode, cab deep links, OSM stays by tier with booking links, emergency card.

### Phase 6 — Trains
- Curated Vande Bharat + scenic datasets (with source and last-verified date), Explore → Trains page, rail-journey style, AI train selection, IRCTC links.

### Phase 7 — Road trips, buses & flights
- OSRM/ORS road legs, fuel and toll estimates, bus deep links, flight sandbox or deep links, transport optimizer with CO₂.

### Phase 8 — Package, checkout & wallet → tag `v2.0-full` (or after the last finished phase)
- Package overview, cart, simulated / Razorpay-test checkout with a DEMO banner, wallet (offline), budget tracker.

### Phase 9 — Accounts, cloud & collaboration
- Supabase auth, cloud sync, public share links, group trips (invite, vote, comments), expense split.

### Phase 10 — Travel companion & scale
- Trip mode (today view, next stop), push reminders, fix-my-plan agent, compare-two-versions, i18n (Hindi, Telugu), embeddings RAG, festivals/permits/phrasebook, Playwright E2E, performance budget.

---

## 9. Security & robustness

### 9.1 Server & key
- Key only in server `.env`; the server refuses to start in production with invalid config.
- **Build test** scans `dist/` for key patterns (`gsk_`, `AIza`, `rzp_`, `sk-`) and fails if any are found.
- Headers: Content-Security-Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`, `Permissions-Policy`.
- CORS: same origin only; JSON body limit 100 KB; text input ≤ 2,000 characters; unknown fields stripped.
- Rate limit per IP per minute + **daily cost cap** per IP and globally (`COST_CAP` error).
- Client disconnect → upstream AI request aborted (saves credits).
- Safe typed errors only; no stack traces or provider messages to the client.
- Request ID in every response, error card and log line.
- External API politeness: caching, timeouts, a user-agent with contact email (Nominatim/Overpass), OSM and Wikivoyage attribution.

### 9.2 AI safety
- User text wrapped as data (`<trip_request>…</trip_request>`); the system prompt says to ignore instructions inside it.
- **The model never provides URLs.** All links are built from `data/deeplinks.js` templates and checked against a domain allowlist.
- No HTML rendering of model output (React text only, no `dangerouslySetInnerHTML`).
- Length caps on every field, numbers range-checked, unknown fields dropped, categories whitelisted.

### 9.3 Client
- IndexedDB data re-validated + migrated on load; corrupt records quarantined.
- Error boundaries per feature; global fallback screen with "Reload".
- Offline detection; AI disabled with a reason.
- No third-party trackers.

### 9.4 Proof for reviewers
- `docs/RELIABILITY.md`: every failure, how to reproduce it, the test that covers it.
- Dev panel (`?dev=1`): chaos toggles (malformed, slow, empty, cut-off, rate limit, crash a card), token/cost/latency view.
- Demo video includes a 60-second "breaking it on purpose" segment.
- CI: tests + build + key scan + `npm audit --omit=dev` on every push.

---

## 10. Honesty & legal rules

- No real bookings or payments in the demo; every checkout says DEMO / Test mode.
- No brand imitation: Roamly's own UI only; partners appear only as "Book on X" links.
- No invented live data: prices, timings and availability are labelled "estimate, verify on site"; the train dataset shows its source and last-verified date.
- Respect the usage policies of every free API; show attributions (OSM, Wikivoyage CC BY-SA, Open-Meteo).
- Privacy: trips stay on the device until the user signs in; no tracking.

---

## 11. Internship requirements checklist

| Brief asks for | Covered by |
|---|---|
| React, hooks, functional components | Whole frontend (Phase 0–1) |
| Free-form text input | Trip box (Phase 1) + intake (Phase 2) |
| Real LLM API | Groq with Gemini fallback, through the server |
| Structured data → interactive, stateful UI, not a chatbot | NDJSON contracts → editable cards, undo, reorder |
| Malformed JSON, wrong shape, empty, slow, failed | §5.7 matrix, mock triggers, tests |
| No crashes; error or retry | Error boundaries + typed error cards + Retry |
| Stale response can't overwrite newer | Request ID + AbortController + test |
| Loading, error, empty states | Every screen and AI action |
| Works on mobile | Mobile-first, 360 px tested, PWA |
| README: setup, AI usage, limitations, time spent | README + docs/ |
| API key not in browser | Server-only + build scan test |
| `npm install && npm start` | Works with zero keys (mock) |
| Small commits + screen recording | Commit plan (§13), demo script (§14) |
| Stretch: blocks, streaming, refinement, save/reload, polish | All in Phases 1–3 |

**Submission strategy:** build all phases, but only ship finished modules (unfinished ones stay behind flags). Tag `v1.0-core` and `v2.0-full`. The README sends reviewers to the core first, then "Explore the full app". Write real hours spent.

---

## 12. Testing plan

| Layer | What | Tool |
|---|---|---|
| Shared | Contracts (good, bad, variant inputs), JSON scanner (NDJSON, pretty-printed, chatter, cut-off) | Vitest |
| State | Every reducer action, undo/redo, stream assembly, patches | Vitest |
| Server | Every endpoint with the mock provider × every trigger; rate limit; cost cap; abort on disconnect | Vitest + fetch against `app.listen(0)` |
| Security | dist key scan, headers present, oversize body rejected | Vitest |
| UI | Critical components (error card retry, stale guard hook) | Vitest + Testing Library |
| E2E | Create → edit → save → offline reopen; failure demo | Playwright (Phase 10) |
| Manual | 360 px phone, tablet, desktop, dark mode, airplane mode, keyboard-only, screen reader spot check | Checklist in RELIABILITY.md |

**Success metrics:** first day visible in under 4 s on Groq; full plan in under 15 s; zero crashes across triggers; ≥ 80% verified stops (Phase 4+); Lighthouse ≥ 90 in all four categories.

---

## 13. Git & commit conventions

- Conventional commits: `feat: …`, `fix: …`, `test: …`, `docs: …`, `refactor: …`, `chore: …`.
- One commit per meaningful change (e.g. "feat: NDJSON stream reader with stale guard"), never one giant commit.
- Branch per phase (`phase-1-core`), merged to `main` with a tag (`phase-1`, `v1.0-core`…).
- AI assistance acknowledged in `docs/AI-USAGE.md` (and commit trailers if you choose).

---

## 14. README & demo plan

**README outline:** what Roamly is (one paragraph + screenshot/GIF) · live demo link · quick start (`npm install && npm start`, mock mode, adding a Groq key) · features (core first, then full app) · architecture diagram · how bad AI output is handled (link to RELIABILITY.md) · security notes · AI-usage note · known limitations · roadmap · time spent (honest).

**Demo video (5–6 min):**
1. 0:00 Problem & one-line pitch.
2. 0:20 Type a trip → intake questions → streamed plan.
3. 1:00 Edit: drag, move day, remove + undo, refine "more relaxed", swap a stop.
4. 2:00 **Break it on purpose:** malformed, slow + cancel, cut-off + continue, rapid re-submit (stale guard), offline.
5. 3:00 Install as PWA, reopen a trip offline.
6. 3:30 Full app tour: map, stays, trains, road trip, package + DEMO checkout.
7. 5:00 Code tour: shared contracts, scanner, reducer/history, key stays on the server.

---

## 15. Building with Claude Code

1. Create an empty GitHub repo named `roamly`, clone it, and copy in `docs/BLUEPRINT.md` and `CLAUDE.md`.
2. Open Claude Code in the folder and run one phase at a time with the prompts below.
3. After each phase: run it yourself, read every file Claude Code wrote, ask it to explain anything unclear, then tag.

**Kickoff prompt (Phase 0):**
> Read CLAUDE.md and docs/BLUEPRINT.md fully. Build Phase 0 exactly as specified in §8, using the locked decisions in §0. Work in small conventional commits. Finish by running `npm test` and `npm start` (mock mode), then summarise what you built and how I can verify each "done when" item.

**Next phases:**
> Read docs/BLUEPRINT.md §8 Phase N and the related sections (list them). Plan the work as a checklist first, then build it in small commits. Add tests for every new contract, reducer action and endpoint. End by verifying the phase's "done when" criteria and updating README/RELIABILITY.md.

**Before the interview:**
> Quiz me on this codebase: ask me 10 questions about the stale guard, stream scanner, validators, reducer/history and server security, then introduce one small bug for me to find.

---

## 16. Data sources to confirm at build time

Free tiers and endpoints change. Before each phase, check the current status of: Groq free models and limits, the Gemini free tier, OpenRouteService limits, Overpass/Nominatim usage policies, any free flight sandbox, any free Indian rail status API, and Razorpay test mode. Record what was used and its date in the README.
