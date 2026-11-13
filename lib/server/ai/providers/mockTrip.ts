import 'server-only'

/**
 * Canned trip used by the mock provider. It follows the plan stream contract
 * (one JSON object per line: meta, day…, transport, stays, info) so the whole
 * app can be built and demoed without an API key.
 */

export const SAMPLE_DAYS = [
  {
    title: 'Old Goa and Panjim',
    stayArea: 'Panjim',
    stops: [
      { name: 'Basilica of Bom Jesus', time: '09:00', duration: '1h', category: 'sight', description: 'UNESCO-listed 16th-century church holding the relics of St Francis Xavier.', tip: 'Shoulders and knees covered to enter.' },
      { name: 'Se Cathedral', time: '10:30', duration: '45m', category: 'sight', description: 'One of the largest churches in Asia, a short walk across the square.', tip: 'Look for the Golden Bell in the tower.' },
      { name: 'Lunch at a Panjim cafe', time: '13:00', duration: '1h', category: 'food', description: 'Goan fish curry rice or a veg thali in the old quarter.', tip: 'Most places close between 3 and 7 pm.' },
      { name: 'Fontainhas Latin Quarter walk', time: '16:30', duration: '1h 30m', category: 'activity', description: 'Colourful Portuguese-era houses and narrow lanes.', tip: 'Best light for photos is just before sunset.' },
    ],
  },
  {
    title: 'North Goa beaches',
    stayArea: 'Candolim',
    stops: [
      { name: 'Fort Aguada', time: '09:30', duration: '1h', category: 'sight', description: 'Clifftop Portuguese fort and lighthouse over the Arabian Sea.', tip: 'Go early to beat the heat and the crowds.' },
      { name: 'Candolim Beach', time: '11:00', duration: '2h', category: 'activity', description: 'Wide, calmer beach good for a swim and a long walk.', tip: 'Swim only between the lifeguard flags.' },
      { name: 'Beach shack lunch', time: '13:30', duration: '1h 30m', category: 'food', description: 'Fresh seafood or veg plates with a sea view.', tip: 'Ask for the catch of the day.' },
      { name: 'Anjuna flea market', time: '16:00', duration: '2h', category: 'activity', description: 'Weekly market for clothes, crafts and street food.', tip: 'Runs on Wednesdays only; bargaining is expected.' },
    ],
  },
  {
    title: 'Spice farm and the south',
    stayArea: 'Benaulim',
    stops: [
      { name: 'Spice plantation tour', time: '09:30', duration: '2h 30m', category: 'activity', description: 'Guided walk through cardamom, pepper and vanilla, with a buffet lunch.', tip: 'Carry mosquito repellent.' },
      { name: 'Drive to South Goa', time: '13:00', duration: '1h 30m', category: 'transport', description: 'Cab ride south through villages and paddy fields.', tip: 'Agree the cab fare before setting off.' },
      { name: 'Colva Beach sunset', time: '17:30', duration: '1h 30m', category: 'activity', description: 'Long, open beach with a quieter evening scene.', tip: 'Stay for the sunset, then head to dinner.' },
    ],
  },
]

/** An extra day the mock offers when asked to rewrite one, so "Regenerate day" visibly changes something. */
export const EXTRA_DAYS = [
  {
    title: 'Divar Island and Chorao',
    stayArea: 'Panjim',
    stops: [
      { name: 'Ribandar ferry to Divar', time: '09:00', duration: '20m', category: 'transport', description: 'Free roll-on ferry across the Mandovi to a quiet island.', tip: 'Ferries run often; no need to book.' },
      { name: 'Divar village cycle', time: '09:45', duration: '2h', category: 'activity', description: 'Ride past paddy fields, old Portuguese homes and chapels.', tip: 'Rent a bicycle near the jetty and carry water.' },
      { name: 'Salim Ali Bird Sanctuary', time: '12:30', duration: '1h 30m', category: 'sight', description: 'Mangrove sanctuary on Chorao island with herons and kingfishers.', tip: 'Morning or late afternoon is best for birds.' },
      { name: 'Goan thali back in Panjim', time: '15:00', duration: '1h', category: 'food', description: 'A late lunch of fish curry, rice and sol kadhi.', tip: 'Veg thalis are easy to find too.' },
    ],
  },
]

/** Replacement ideas for "Swap with AI". */
export const ALTERNATIVE_STOPS = [
  { name: 'Reis Magos Fort', time: '10:00', duration: '1h', category: 'sight', description: 'Restored riverside fort with views over Panjim.', tip: 'Small entry fee; closed Mondays.' },
  { name: 'Museum of Goa', time: '11:00', duration: '1h 30m', category: 'sight', description: 'Contemporary art museum in Pilerne.', tip: 'Check opening days before going.' },
  { name: 'Chapora Fort', time: '16:30', duration: '1h', category: 'sight', description: 'Hilltop fort ruins with sweeping sea views.', tip: 'Short but steep climb; wear good shoes.' },
  { name: 'Mapusa Friday market', time: '09:30', duration: '1h 30m', category: 'activity', description: 'Busy local market for spices, sausages and pottery.', tip: 'Fridays only; go early.' },
  { name: 'Butterfly Conservatory of Goa', time: '10:00', duration: '1h', category: 'activity', description: 'Small garden reserve with many butterfly species.', tip: 'Quiet mornings are best.' },
]

/** The mock plan as one object ({ title, …, days: [...] }), the shape /api/refine asks for. */
export function buildMockPlanObject(days: number): Record<string, unknown> & { summary: string; days: typeof SAMPLE_DAYS } {
  const lines = buildMockPlanNdjson(days).split('\n').map((line) => JSON.parse(line))
  const { type: _meta, ...meta } = lines[0]
  const pick = (type: string) => {
    const { type: _t, ...rest } = lines.find((l) => l.type === type)
    return rest
  }
  return {
    ...meta,
    days: lines.filter((l) => l.type === 'day').map(({ type: _t, ...day }) => day) as typeof SAMPLE_DAYS,
    transport: pick('transport'),
    stays: pick('stays'),
    info: pick('info'),
  }
}

/** Returns the mock plan as NDJSON text. `days` is clamped to 1–7; extra days reuse the sample days. */
export function buildMockPlanNdjson(days: number): string {
  const count = Math.min(Math.max(days, 1), 7)
  const lines: unknown[] = [
    {
      type: 'meta',
      title: `${count} days in Goa (mock plan)`,
      destination: 'Goa, India',
      summary: 'A sample plan from the built-in mock provider. Add an API key in .env.local for real plans.',
      why: ['Old Goa first while you are fresh', 'Beaches grouped by area to cut travel time', 'South Goa last for a quieter finish'],
    },
  ]
  for (let i = 0; i < count; i++) {
    lines.push({ type: 'day', ...SAMPLE_DAYS[i % SAMPLE_DAYS.length] })
  }
  lines.push(
    { type: 'transport', legs: [{ from: 'Hyderabad', to: 'Goa', mode: 'train', reason: 'Overnight train saves a hotel night (estimate, check live timings).' }] },
    { type: 'stays', nights: [{ dayIndexes: [0], area: 'Panjim', options: [{ name: 'Guesthouse in Fontainhas', tier: 'budget', why: 'Walkable to day 1 stops.' }] }] },
    {
      type: 'info',
      budget: { currency: 'INR', perPerson: 18000, breakdown: [{ label: 'Stay', amount: 7000 }, { label: 'Food', amount: 4500 }, { label: 'Transport', amount: 4000 }, { label: 'Activities', amount: 2500 }] },
      packing: ['Sunscreen', 'Light cotton clothes', 'Swimwear', 'Mosquito repellent'],
      tips: ['Rent a scooter only with a valid licence', 'Carry cash for beach shacks'],
      safety: ['Swim only at lifeguarded beaches', 'Avoid isolated beaches after dark'],
      phrases: ['Dev borem korum (thank you, Konkani)'],
    },
  )
  return lines.map((line) => JSON.stringify(line)).join('\n')
}
