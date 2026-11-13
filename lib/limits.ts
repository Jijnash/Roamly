/**
 * Size caps shared by the server (validating AI output and requests) and the
 * client (input counters, re-validating saved trips). Keeping them in one file
 * means the UI and the validators can't drift apart.
 */
export const LIMITS = {
  /** Free-form trip description typed by the user. */
  inputChars: 2000,
  /** Refine instruction ("make day 2 relaxed"). */
  instructionChars: 500,
  /** Max request body for any API route. */
  bodyBytes: 100_000,

  days: 14,
  stopsPerDay: 8,

  titleChars: 80,
  nameChars: 80,
  descriptionChars: 200,
  tipChars: 120,
  shortChars: 40,
  summaryChars: 300,
  listItems: 8,
  listItemChars: 120,
  budgetMax: 10_000_000,
} as const
