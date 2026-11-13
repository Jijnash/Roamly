// Fails if anything that looks like a secret key ended up in the browser bundle.
// Run after `npm run build`. The brief says the API key must never reach the browser;
// this proves it for every build (CI runs it on each push).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = '.next/static' // everything here is downloadable by any visitor
const PATTERNS = [
  [/gsk_[A-Za-z0-9]{20,}/, 'Groq API key'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google/Gemini API key'],
  // Must not follow a letter/hyphen: Tailwind class names like "mask-linear-…" contain "sk-".
  [/(?<![A-Za-z0-9-])sk-(?:proj-)?[A-Za-z0-9]{32,}/, 'OpenAI-style secret key'],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase secret key'],
  [/"role"\s*:\s*"service_role"/, 'Supabase service_role JWT payload'],
  [/GROQ_API_KEY|GEMINI_API_KEY/, 'server-only env variable name'],
]

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (/\.(js|css|html|json|map|txt)$/.test(name)) yield path
  }
}

let problems = 0
let scanned = 0
try {
  for (const file of files(ROOT)) {
    scanned++
    const text = readFileSync(file, 'utf8')
    for (const [pattern, label] of PATTERNS) {
      if (pattern.test(text)) {
        console.error(`✗ ${label} found in ${file}`)
        problems++
      }
    }
  }
} catch (err) {
  console.error(`Could not scan ${ROOT}. Run "npm run build" first.`, err.message)
  process.exit(1)
}

if (problems > 0) process.exit(1)
console.log(`✓ No secrets in the browser bundle (${scanned} files scanned)`)
