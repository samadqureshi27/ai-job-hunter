# JobHunter AI

An autonomous job-search assistant. Upload a CV, describe what you're looking for, and it searches LinkedIn, Indeed, Glassdoor, Wellfound, and the open web in one pass, filters out closed/fake listings, and scores each job against your resume with Gemini — including a culture-fit read (startup vs. enterprise) that most job-match tools don't attempt.

## Features

- **CV parsing** — drag-and-drop or paste; supports PDF, DOCX, HTML, and TXT (`/api/parse-cv`).
- **Multi-source search** — queries LinkedIn, Indeed/Glassdoor/Wellfound, and the general web in parallel via Serper, then interleaves results round-robin so one source can't crowd out the others.
- **Closed/ghost-listing filtering** — regex + AI double-check drops postings that are expired, filled, or no longer accepting applications.
- **Search-index-page filtering** — drops Indeed/LinkedIn category pages (e.g. "50+ React Jobs in Lahore") that aren't a real single posting and would otherwise poison the AI analysis with fabricated details.
- **Location verification** — a job is only kept if the requested city is literally confirmed in its title/snippet (or it's genuinely remote and remote was requested). Prevents wrong-city results (e.g. Islamabad jobs showing up for a Lahore search).
- **Cross-board deduplication** — the same posting indexed on multiple boards is merged into one card instead of showing as duplicates.
- **AI match scoring** — Gemini scores each job 0–100 against your CV, explains the reasoning, lists matched/missing skills, and factors in your stated company-culture preference.
- **Tailored application tips** — on-demand deep-dive (`/api/match`) that generates a job-specific resume bullet and an apply/skip recommendation, without burning API quota automatically on every job view.
- **Persistence** — your CV, search prefs, results, and saved jobs survive a page refresh (localStorage).
- **Rate limiting** — per-IP limits on all three API routes to protect the Gemini/Serper quota from abuse.
- **Prompt-injection guarding** — resume text and job descriptions are wrapped in explicit delimiters with an instruction telling the model to treat them as inert data, never as commands.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- React 19, TypeScript, Tailwind CSS 4
- [Gemini](https://ai.google.dev) (`@google/genai`) for CV/job matching
- [Serper](https://serper.dev) for Google-backed job search
- `pdf-parse` / `mammoth` for CV text extraction
- [Vitest](https://vitest.dev) for unit tests

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` in the project root:

```bash
GEMINI_API_KEY=your_gemini_api_key
SERPER_API_KEY=your_serper_api_key

# Optional — defaults to gemini-3-flash-preview
GEMINI_MODEL=gemini-3-flash-preview
```

- Get a Gemini key at [aistudio.google.com](https://aistudio.google.com/apikey).
- Get a Serper key at [serper.dev](https://serper.dev).

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Run tests

```bash
npm test
```

Covers the job-filtering logic in `src/lib/jobFilters.ts` — aggregator-page detection, location verification, closed-listing detection, and cross-board title deduplication.

## Project structure

```
src/
  app/
    page.tsx              Main UI — CV upload, preferences, results, job modal
    layout.tsx             Root layout + metadata
    icon.tsx                Generated favicon
    api/
      hunt/route.ts         Multi-source search + AI scoring pipeline
      match/route.ts        On-demand deep-dive match (tailored resume bullet)
      parse-cv/route.ts      CV text extraction (PDF/DOCX/HTML/TXT)
  lib/
    jobFilters.ts           Pure filtering logic (aggregator/closed/location/dedup) + tests
    promptSafety.ts          Prompt-injection guarding helpers
    rateLimit.ts             In-memory per-IP rate limiter
```

## Known limitations

- **Gemini free tier caps at 20 requests/day** for the default model. Once exhausted, the app falls back to a neutral score with a clear "quota exhausted" message rather than fabricating results — but a hunt with several jobs can burn through the daily cap fast. Use a paid Gemini key for regular use.
- **Rate limiting is in-memory**, scoped to a single server process — it resets on restart and doesn't share state across multiple instances. Fine for local use or a single small deployment; a multi-instance production deployment needs a shared store (e.g. Redis) instead.
- **No authentication** — anyone with network access to the deployed app can use it within the rate limits.
- **Location/closed-listing detection is heuristic** (regex + AI, not a structured job-board API), so it won't catch every edge case — it's meaningfully better than no filtering, not perfect.
- **Deep-match tailoring** (`/api/match`) works from the search snippet, not the full job description (no page scraping), so its suggestions are only as detailed as what the search snippet contains.
