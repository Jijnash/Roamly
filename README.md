# Roamly — AI trip planner

Describe a trip in plain words. Roamly asks only what's missing, streams a day-by-day plan, and turns it into an editable, interactive itinerary: expand, reorder, remove, edit, rewrite a day, swap a stop, undo anything. It's not a chatbot. The AI returns structured JSON that is validated and rendered as components.

> ✏️ **TODO (owner):** add the demo video link and a screenshot or GIF here.

## Quick start

```bash
npm install && npm start
```

Open http://localhost:3000. **No API key is needed:** without keys Roamly uses a built-in mock provider, so every feature works offline.

For real AI, copy `.env.example` to `.env.local` and add `GROQ_API_KEY` (primary) and/or `GEMINI_API_KEY` (automatic fallback). Keys are read only on the server.

| Command | What it does |
|---|---|
| `npm start` | Dev server on port 3000 |
| `npm test` | 163 Vitest tests |
| `npm run typecheck` | TypeScript |
| `npm run build` then `npm run check:secrets` | Production build, then a scan proving no API key is in the browser bundle |

## What it does

- **Free-text input → AI intake** that shows what it understood and asks only for missing details.
- **Streamed plan:** days appear one by one (NDJSON), with a slow-response notice and Cancel.
- **Interactive itinerary:** expand, mark done, drag to reorder (mouse, touch or keyboard), move between days, edit inline, remove, undo/redo (Ctrl/Cmd+Z).
- **Refinement loop:** refine the whole plan ("more relaxed"), rewrite one day with a note, or swap a stop for one of three AI alternatives.
- **Blocks:** budget chart, packing checklist, transport, stays, tips, safety, phrases. Each kind of data has its own component.
- **Save and reload:** autosave to IndexedDB, My Trips (search, duplicate, delete with Undo), optional Supabase sync ([docs/SUPABASE.md](docs/SUPABASE.md)).
- **Polish:** dark mode, mobile-first layout down to 360px, keyboard navigation, reduced-motion support.

## Handling bad AI output

This is the core of the project. See **[docs/RELIABILITY.md](docs/RELIABILITY.md)** for every failure case, what happens, and which test covers it. Open **`/lab`** (the Reliability lab) to trigger each one live: malformed JSON, no JSON, wrong shape, empty, slow, provider failure, rate limit, cut-off stream, a stale response, a crashed card, and offline.

In short:
1. A streaming JSON scanner extracts objects from messy output.
2. A lenient parser fixes common mistakes such as trailing commas.
3. Validators accept common variants, clean every field, and drop broken items with a warning.
4. If nothing usable comes back, the server retries once with a stricter prompt, then returns a typed error.
5. If the stream is cut off, the days already received are kept and **Continue** fetches the rest.
6. A request gate makes sure a stale response can never overwrite a newer one.
7. Error boundaries wrap each section, so one broken card can't take down the page.

## Architecture

```
Browser (React, Next.js client)                Server (Next.js route handlers)
 home → intake dialog ──POST /api/intake──────▶ runIntake ┐
 planner ◀──NDJSON events── POST /api/plan ───▶ planEvents ├─▶ router (Groq → Gemini, or mock)
 tripReducer + undo history                     edits.ts  ┘     timeouts · abort on disconnect
 requestGate (stale guard)                      scanner → validators (lib/contracts)
 IndexedDB (+ optional Supabase sync)           rate limit · typed errors · request IDs
```

For a map of the key files, see [CLAUDE.md](CLAUDE.md); the full spec is [docs/BLUEPRINT.md](docs/BLUEPRINT.md).

## Security

- API keys live only in the server env and are never sent to the browser. CI scans the built bundle to prove it.
- The model never supplies URLs: links are built from templates with a host allowlist.
- No `dangerouslySetInnerHTML`.
- User text is wrapped as data in prompts.
- Every input is size-capped, and requests are rate-limited per IP.
- Supabase uses row-level security.

## AI usage note

> ✏️ **TODO (owner): check and edit this in your own words. Honesty counts.**

- **v0** generated the initial UI screens (the first commit, kept unchanged so the history shows what was generated).
- **Claude Code** wrote most of the code, step by step from a plan I directed: backend, providers, streaming, validators, state, tests and docs. I chose the scope and stack, ran and reviewed each step, and asked for changes. *(Owner: state truthfully how much you reviewed and understood.)*

## Known limitations

- Prompts were tuned against the mock. Real models may need prompt adjustments; test with real keys before demoing.
- Prices, timings and places are AI estimates and aren't verified against live data (no RAG yet).
- The rate limiter is in memory, so it applies per server instance.
- Cloud sync uses last-write-wins: offline edits to the same trip on two devices can overwrite each other.
- Not built yet: maps, trains, bookings and checkout (later phases in the blueprint).

## Time spent

> ✏️ **TODO (owner): write your real hours.** The brief suggests about 8; be honest if it took more and why.
