# Reliability: how Roamly handles bad AI output

The assignment's core question is what happens when the model gets it wrong. This page lists every failure Roamly handles, how to reproduce it, what the user sees, and which test covers it.

## How to reproduce failures

**Easiest: the Reliability lab** at [`/lab`](http://localhost:3000/lab) (Profile menu › Reliability lab). Each "Run" button sends a real request whose `chaos` field forces the mock provider into one failure mode, even when real API keys are set, so no quota is used. It also has the stale-response, crash-a-card and offline demos, plus timings for the last request.

**Or by hand:** with no API keys, Roamly uses the **mock provider**. Put a trigger anywhere in the trip text (for example `3 days in Goa [cutoff]`):

| Trigger | What the mock does |
|---|---|
| `[malformed]` | Chatter, a code fence, a trailing comma, and a day line cut off mid-string |
| `[garbage]` | Prose with no JSON at all (the strict retry then succeeds) |
| `[wrong-shape]` | One big object with `itinerary` / `activities` / `place` instead of our keys |
| `[empty]` | Nothing at all, on both attempts |
| `[slow]` | Silent for 9.5 s, then one line a second (about 17 s in all) |
| `[fail]` | Provider error |
| `[ratelimit]` | Provider rate limit (retry after 20 s) |
| `[cutoff]` | Stops in the middle of day 2 |

From a terminal:

```bash
curl -N -X POST localhost:3000/api/plan -H 'content-type: application/json' -d '{"text":"3 days in Goa [malformed]"}'
```

## Failure matrix

| Problem | What happens on the server | What the user gets | Covered by |
|---|---|---|---|
| Malformed JSON | The scanner extracts each complete object and ignores chatter and fences. `parseLenient` fixes trailing commas and smart quotes. A line cut off mid-object is dropped. | The plan, plus a warning for the skipped part | `jsonScanner.test.ts`, `planPipeline.test.ts` › [malformed] |
| Answer with no usable JSON | One strict retry with a reminder prompt, announced by a `retry` event. If that also fails: `BAD_MODEL_OUTPUT`. | "Trying once more…", then the plan or an error with Retry | `planPipeline.test.ts` › [garbage], unreadable |
| Wrong shape | Validators accept common variants (`activities`, `place`, `at`, `notes`…), map categories, times, modes and tiers, and expand a whole-plan object into events | The plan | `contracts.test.ts`, `planPipeline.test.ts` › [wrong-shape] |
| Broken item | That stop or day is dropped. The rest of the plan is kept, with a warning (at most 10). | The plan, minus that item, with a warning | `contracts.test.ts` › normalizeDay, toPlanParts |
| Empty answer | Strict retry, then `EMPTY_OUTPUT` | "Trying once more…", then an error with Retry | `planPipeline.test.ts` › [empty] |
| Slow first chunk | Limit `LLM_TIMEOUT_MS` (30 s). The upstream request is aborted, then the next provider is tried. | The plan from the fallback provider, or `TIMEOUT` | `router.test.ts` › times out a silent provider |
| Nothing arrives for 8 s | The browser shows "Taking longer than usual… You can keep waiting or cancel". The timer restarts on every event. | That notice, plus Cancel (keeps the days so far) | Lab › Slow model |
| Stream stalls | Limit `STREAM_IDLE_TIMEOUT_MS` (20 s) between chunks, and `STREAM_TOTAL_TIMEOUT_MS` (90 s) overall | The days received so far, plus a `TIMEOUT` error line | `router.test.ts` › withTimeouts |
| Provider failure, bad key or retired model | Typed error (`UPSTREAM_ERROR` or `CONFIG_ERROR`). If no text was sent yet, falls back once to the next provider. Provider messages are logged only, never sent to the client. | The plan from the fallback provider, or an error with Retry | `providers.test.ts`, `router.test.ts` › fallback |
| Provider rate limit | `RATE_LIMITED` with `retryAfterSec`, then fallback to the next provider | The plan, or "busy, try again in N s" | `providers.test.ts` › 429, `router.test.ts` |
| Too many requests to Roamly | Per-IP limit (`RATE_LIMIT_PER_MIN`, default 20) → HTTP 429 with `retry-after` | "Busy, try again" | `routes.test.ts` › rate-limits |
| Stream cut off | Days already received are kept. The stream ends with `done { complete: false }`, and `resume.fromDay` asks for only the missing days. | The days so far, plus "Continue" | `planPipeline.test.ts` › [cutoff], resume |
| Failure after some days | Days already sent are kept, and a final `{"type":"error"}` line is sent | The days so far, plus an error with Retry or Continue | `routes.test.ts` › error line |
| Browser cancels or disconnects | The stream's `cancel()` and `request.signal` both abort the upstream model call, and the server logs `cancelled` | — | Manually: `curl --max-time 3 … [slow]`, then check the server log; `router.test.ts` › client cancel |
| Prompt injection in trip text | Text is wrapped in `<trip_request>`, and closing tags inside it are removed. The prompt says to treat it as data. Output must still pass the validators, and links are never taken from the model. | A normal plan | `prompts.test.ts` › strips tags |
| A component crashes while rendering | Each day card and the sidebar sit inside their own error boundary (Next's `catchError`). `app/error.tsx` catches page-level errors, and `app/global-error.tsx` catches root-layout errors. Trip state lives above them, so it survives. | "This day couldn't be shown" + Reload this section; the other days keep working | Lab › Crash a card |
| Over-long or bad input | Trip text up to 2,000 characters, body up to 100 KB, unknown fields dropped, invalid JSON → `INVALID_INPUT` (400) | A clear message | `contracts.test.ts` › request parsing, `routes.test.ts` |
| Too many days or stops | Capped at 14 days and 8 stops per day, with a warning | The plan, plus a warning | `contracts.test.ts` |
| Stale response (submit again, or cancel, before the answer arrives) | Browser: each request gets a ticket from `createRequestGate`. Starting a new one aborts the old fetch (the server then stops the model) and makes the old ticket stale. Every event handler checks `isCurrent()` first, so a late event from an old request is dropped. | Only the newest plan is shown | `client.test.ts` › stale request never calls its handlers, becomes stale midway |
| AI edit vs user edit | Manual edits are locked while a plan streams or a refine runs. Edits target ids, so an edit whose stop or day no longer exists does nothing (and adds no undo step). Starting or continuing a generation clears undo history. | No mixed or half-applied changes | `tripReducer.test.ts` › target is gone, withHistory |
| Stream ends without `done` | The browser treats it as a dropped connection | Days so far, plus "The plan stopped early · Continue" | `client.test.ts` › dropped connection |
| Network down or offline | `fetch` fails → `OFFLINE` when `navigator.onLine` is false, otherwise "Couldn't reach Roamly" | An error card with Retry | `client.test.ts` › network failure |
| Intake call fails, returns junk, or you're offline | Validated on both server and client. On any failure the dialog shows a fixed set of basic questions with a short note. | Planning is never blocked by intake | `intake.test.ts`, manual: break `/api/intake` |
| Rewrite-day or swap fails | Same JSON safety net as refine (validate → one strict retry → typed error). Only that day or stop is affected, and nothing changes on failure. | An inline error with its reference; the plan is unchanged | `routes.test.ts` › /api/day, /api/alternatives, `contracts.test.ts` › normalizeAlternatives |
| Saved trip is damaged or from a newer version | It's re-validated on load with the same cleaners as AI output. Older versions go through migrations. A damaged record is moved to a `quarantine` store (kept, not deleted). | My Trips: "1 saved trip was damaged and set aside"; opening it by URL explains it | `storage.test.ts` |
| Storage blocked (private window) or a save fails | Saving errors are caught; the indicator says "Couldn't save…" and the trip stays in memory | Planning still works | manual |
| Cloud sync fails or you're offline while signed in | The local save always happens first. The cloud write is queued, and the queue is replayed on reconnect, on "Sync now", or on the next sign-in. Deletes made offline are replayed too, so the trip isn't pulled back. | "Saved on this device · will sync when back online"; the account menu shows "N changes waiting" | `sync.test.ts` |
| Another user's trips | Row-level security in Postgres: every policy requires `auth.uid() = user_id`. The browser's anon key can't bypass it. | — | `sync.test.ts` › migration enables RLS on every operation |
| Refine fails | Plan unchanged, inline error with request ID. The refined plan is re-validated in the browser before use. | "…Your plan was not changed." | `planPipeline.test.ts` › refinePlan, `routes.test.ts` |

## Error format

Errors from every non-streamed endpoint, and the final `error` line of the plan stream, use the same shape:

```json
{ "error": { "code": "TIMEOUT", "message": "The AI took too long to answer.", "retryable": true, "requestId": "a1b2c3d4" } }
```

Codes: `INVALID_INPUT · RATE_LIMITED · TIMEOUT · UPSTREAM_ERROR · BAD_MODEL_OUTPUT · EMPTY_OUTPUT · CONFIG_ERROR · NOT_FOUND · CANCELLED`. The request ID also appears in the `x-request-id` header and in every server log line, so a screenshot of an error card can be matched to the logs.
