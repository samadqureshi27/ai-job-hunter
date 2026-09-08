import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { checkRateLimit, getClientKey } from "@/lib/rateLimit";
import {
  truncateForPrompt,
  wrapUntrustedContent,
  UNTRUSTED_CONTENT_NOTICE,
} from "@/lib/promptSafety";
import {
  buildCityRegex,
  isAggregatorListingPage,
  isClosedListing,
  isLocationVerified as isLocationVerifiedForItem,
  isRemoteMatch as isRemoteMatchForItem,
  normalizeTitleKey,
} from "@/lib/jobFilters";

const MAX_RESUME_CHARS = 12000;
const MAX_SNIPPET_CHARS = 2000;

export const runtime = "nodejs";

/*
 * A hunt fans out to 3 web searches plus up to 10 parallel Gemini calls —
 * the most expensive route in the app. Keep this tight.
 */
const HUNT_RATE_LIMIT = 5;
const HUNT_RATE_WINDOW_MS = 5 * 60 * 1000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

type HuntRequest = {
  resumeText: string;
  fileName?: string;
  roleKeyword: string;
  location?: string;
  workTypes?: string[];
  experience?: string;
  companyType?: string;
  keywords?: string[];
  maxResults?: number;
};

async function runSerperSearch(
  query: string,
  apiKey: string,
  num = 10
) {
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num,
        tbs: "qdr:w",
      }),
    });

    if (!response.ok) {
      const rawText = await response.text();

      console.error(
        `Serper API error for "${query}":`,
        response.status,
        rawText
      );

      return [];
    }

    const data = await response.json();

    return Array.isArray(data.organic) ? data.organic : [];
  } catch (error) {
    console.error("Serper request failed:", error);
    return [];
  }
}

function cleanJsonResponse(text: string) {
  let cleanText = text.trim();

  if (cleanText.startsWith("```")) {
    cleanText = cleanText
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
  }

  return cleanText;
}

const MAX_RETRY_DELAY_MS = 6000;

function getRetryDelayMs(error: any, fallbackMs: number) {
  const message = typeof error?.message === "string" ? error.message : "";
  const match = message.match(/"retryDelay":"(\d+)s"/);
  const suggested = match ? Number(match[1]) * 1000 : fallbackMs;

  /*
   * Gemini can suggest a retryDelay of 30-60s under load. With up to 10
   * jobs retrying in parallel, honoring that verbatim makes a single hunt
   * take a minute-plus. Capping it keeps worst-case latency bounded, at
   * the cost of a slightly higher chance the retry also gets rate limited.
   */
  return Math.min(suggested, MAX_RETRY_DELAY_MS);
}

function isRateLimitError(error: any) {
  return (
    error?.status === 429 ||
    error?.error?.code === 429 ||
    /RESOURCE_EXHAUSTED|429/.test(String(error?.message || ""))
  );
}

function isDailyQuotaError(error: any) {
  return /PerDay/i.test(String(error?.message || ""));
}

async function generateContentWithRetry(
  params: Parameters<typeof ai.models.generateContent>[0],
  retries = 1
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error) {
      // A daily quota won't reset within a retry window, so retrying
      // just burns 30-60s per job for a call that's guaranteed to fail again.
      if (!isRateLimitError(error) || isDailyQuotaError(error) || attempt >= retries) {
        throw error;
      }

      const delay = getRetryDelayMs(error, 15000);

      console.warn(
        `Gemini rate limited, retrying in ${delay}ms (attempt ${
          attempt + 1
        }/${retries})`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function normalizeWorkType(workTypes: string[] = []) {
  if (!workTypes.length) return "";

  return workTypes
    .map((type) => {
      if (type === "On-site") return "on-site";
      if (type === "Remote") return "remote";
      if (type === "Hybrid") return "hybrid";

      return type.toLowerCase();
    })
    .join(" OR ");
}

export async function POST(request: Request) {
  const rateLimitKey = getClientKey(request, "hunt");
  const rateLimit = checkRateLimit(
    rateLimitKey,
    HUNT_RATE_LIMIT,
    HUNT_RATE_WINDOW_MS
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Too many hunts in a short time. Try again in ${Math.ceil(
          rateLimit.retryAfterMs / 1000
        )}s.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        },
      }
    );
  }

  try {
    const body = (await request.json()) as HuntRequest;

    const {
      resumeText,
      roleKeyword,
      location = "Pakistan",
      workTypes = [],
      experience = "Any",
      companyType = "any",
      keywords = [],
      maxResults = 6,
    } = body;

    const serperKey = process.env.SERPER_API_KEY;

    if (!serperKey) {
      return NextResponse.json(
        {
          error:
            "Configuration Error: SERPER_API_KEY is missing in your .env.local file.",
        },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Configuration Error: GEMINI_API_KEY is missing in your .env.local file.",
        },
        { status: 400 }
      );
    }

    if (!resumeText?.trim()) {
      return NextResponse.json(
        {
          error:
            "No CV text was received. Upload a CV and make sure text extraction succeeds.",
        },
        { status: 400 }
      );
    }

    if (!roleKeyword?.trim()) {
      return NextResponse.json(
        {
          error: "Target role is required.",
        },
        { status: 400 }
      );
    }

    const safeMaxResults = Math.min(
      Math.max(Number(maxResults) || 6, 1),
      10
    );

    const workTypeQuery = normalizeWorkType(workTypes);

    const keywordQuery = keywords
      .slice(0, 5)
      .map((keyword) => `"${keyword}"`)
      .join(" ");

    const experienceQuery =
      experience && experience !== "Any"
        ? `"${experience}"`
        : "";

    const companyQuery =
      companyType === "startup"
        ? "startup"
        : companyType === "enterprise"
        ? "enterprise"
        : "";

    /*
     * Quoting the location forces Google to treat it as a literal phrase
     * instead of a loose relevance hint — without this, a "Lahore" search
     * happily returns Islamabad/Karachi postings that just rank well for
     * the role keyword.
     */
    const locationQuery = location ? `"${location}"` : "";

    /*
     * Search query 1:
     * General web search
     */
    const generalQuery = [
      `"${roleKeyword}"`,
      "jobs",
      locationQuery,
      workTypeQuery,
      experienceQuery,
      companyQuery,
      keywordQuery,
    ]
      .filter(Boolean)
      .join(" ");

    /*
     * Search query 2:
     * LinkedIn jobs
     */
    const linkedinQuery = [
      `"${roleKeyword}"`,
      "jobs",
      locationQuery,
      workTypeQuery,
      experienceQuery,
      "site:linkedin.com/jobs",
    ]
      .filter(Boolean)
      .join(" ");

    /*
     * Search query 3:
     * Well-known job boards
     */
    const jobBoardQuery = [
      `"${roleKeyword}"`,
      "jobs",
      locationQuery,
      workTypeQuery,
      "site:indeed.com OR site:glassdoor.com OR site:wellfound.com",
    ]
      .filter(Boolean)
      .join(" ");

    const [
      generalResults,
      linkedinResults,
      jobBoardResults,
    ] = await Promise.all([
      runSerperSearch(generalQuery, serperKey, 10),
      runSerperSearch(linkedinQuery, serperKey, 10),
      runSerperSearch(jobBoardQuery, serperKey, 10),
    ]);

    /*
     * Combine all search results, interleaved round-robin so one
     * source (e.g. LinkedIn) can't crowd out the others once sliced
     * down to maxResults.
     */
    const sources = [linkedinResults, jobBoardResults, generalResults];
    const combined: any[] = [];
    const maxLen = Math.max(...sources.map((source) => source.length), 0);

    for (let i = 0; i < maxLen; i++) {
      for (const source of sources) {
        if (source[i]) {
          combined.push(source[i]);
        }
      }
    }

    /*
     * Deduplicate by URL.
     */
    const seenUrls = new Set<string>();
    const seenTitleKeys = new Set<string>();

    const dedupedItems = combined.filter((item: any) => {
      const url = item?.link || "";

      if (!url || seenUrls.has(url)) {
        return false;
      }

      const titleKey = normalizeTitleKey(item?.title || "");

      if (titleKey && seenTitleKeys.has(titleKey)) {
        return false;
      }

      if (isClosedListing(item)) {
        return false;
      }

      if (isAggregatorListingPage(item)) {
        return false;
      }

      seenUrls.add(url);

      if (titleKey) {
        seenTitleKeys.add(titleKey);
      }

      return true;
    });

    if (!dedupedItems.length) {
      return NextResponse.json({
        jobs: [],
        message: `No active jobs found for "${roleKeyword}" in "${location}". Try broader keywords or another location.`,
      });
    }

    /*
     * A job is only kept if the requested location literally appears in
     * its title/snippet, or it's explicitly remote and the candidate
     * wants remote work. Otherwise Google's loose relevance ranking lets
     * jobs from other cities (e.g. Islamabad when Lahore was requested)
     * slip through.
     */
    const cityRegex = buildCityRegex(location);
    const remotePreferred = workTypes.includes("Remote");

    const isLocationVerified = (item: any) =>
      isLocationVerifiedForItem(item, cityRegex);

    const isRemoteMatch = (item: any) =>
      isRemoteMatchForItem(item, remotePreferred);

    const locationFilteredItems = dedupedItems.filter(
      (item: any) => isLocationVerified(item) || isRemoteMatch(item)
    );

    const locationFilterFellBack =
      cityRegex !== null &&
      locationFilteredItems.length === 0 &&
      dedupedItems.length > 0;

    const finalItems = locationFilteredItems.length
      ? locationFilteredItems
      : dedupedItems;

    /*
     * Limit how many jobs Gemini analyzes.
     */
    const itemsToAnalyze = finalItems.slice(
      0,
      safeMaxResults
    );

    /*
     * Analyze every job with Gemini, in parallel, so total wait time
     * is bounded by the slowest single call instead of the sum of all of them.
     */
    const matchedJobs = await Promise.all(itemsToAnalyze.map(async (item: any) => {
      const jobTitle =
        item?.title || "Unknown Job Title";

      const jobUrl =
        item?.link || "#";

      const snippet =
        item?.snippet || "";

      const source =
        item?.source || "";

      const displayLocation = isLocationVerified(item)
        ? location
        : isRemoteMatch(item)
        ? "Remote"
        : "Location not specified";

      const prompt = `
You are an expert technical recruiter and job-matching AI.

Your job is to compare the candidate's CV against a job listing.

Return an objective match score from 0 to 100.

IMPORTANT:
- If the job listing snippet indicates the position is closed, filled, expired, or no longer accepting applications, set score to 0 and say so in cultureAnalysis.
- Do not inflate the score.
- Only give credit for skills or experience actually supported by the CV.
- Consider technical skills, years of experience, seniority, responsibilities, location, work type, and role alignment.
- Missing skills should be explicitly identified.
- A candidate does not need every skill to be a good match.
- Do not reject a candidate simply because a skill is missing unless it is clearly critical.
- Keep the analysis concise and useful.

Candidate preferences:

Target role:
${roleKeyword}

Location:
${location}

Preferred work types:
${workTypes.join(", ") || "Any"}

Experience level:
${experience}

Company type:
${companyType}

Preferred keywords:
${keywords.join(", ") || "None"}

Candidate CV:
${wrapUntrustedContent(
  "candidate_resume",
  truncateForPrompt(resumeText, MAX_RESUME_CHARS)
)}

Job title:
${wrapUntrustedContent("job_title", jobTitle)}

Job source:
${source}

Job listing snippet:
${wrapUntrustedContent(
  "job_snippet",
  truncateForPrompt(snippet, MAX_SNIPPET_CHARS)
)}

${UNTRUSTED_CONTENT_NOTICE}

Analyze the candidate against this job.

Return:
1. score
2. cultureAnalysis
3. skills
4. missingSkills
`;

      try {
        const response =
          await generateContentWithRetry({
            model:
              process.env.GEMINI_MODEL ||
              "gemini-3-flash-preview",

            contents: prompt,

            config: {
              responseMimeType: "application/json",

              responseSchema: {
                type: "OBJECT",

                properties: {
                  score: {
                    type: "INTEGER",
                  },

                  cultureAnalysis: {
                    type: "STRING",
                  },

                  skills: {
                    type: "ARRAY",
                    items: {
                      type: "STRING",
                    },
                  },

                  missingSkills: {
                    type: "ARRAY",
                    items: {
                      type: "STRING",
                    },
                  },
                },

                required: [
                  "score",
                  "cultureAnalysis",
                  "skills",
                  "missingSkills",
                ],
              },
            },
          });

        const rawText = response.text
          ? response.text.trim()
          : "{}";

        const cleanText =
          cleanJsonResponse(rawText);

        const analysis = JSON.parse(cleanText);

        const score = Math.min(
          Math.max(
            Number(analysis.score) || 0,
            0
          ),
          100
        );

        return {
          title: jobTitle,

          company:
            source ||
            item?.domain ||
            "Job listing",

          url: jobUrl,

          location: displayLocation,

          workType:
            workTypes.length > 0
              ? workTypes.join(" / ")
              : "Not specified",

          score,

          analysis:
            analysis.cultureAnalysis ||
            "No detailed analysis available.",

          skills:
            Array.isArray(analysis.skills)
              ? analysis.skills
              : [],

          missingSkills:
            Array.isArray(analysis.missingSkills)
              ? analysis.missingSkills
              : [],

          snippet,
        };
      } catch (aiError) {
        console.error(
          `Gemini analysis failed for "${jobTitle}":`,
          aiError
        );

        /*
         * We don't want one failed Gemini request
         * to destroy the entire job hunt.
         */
        return {
          title: jobTitle,

          company:
            source ||
            item?.domain ||
            "Job listing",

          url: jobUrl,

          location: displayLocation,

          workType:
            workTypes.length > 0
              ? workTypes.join(" / ")
              : "Not specified",

          score: 50,

          analysis: isDailyQuotaError(aiError)
            ? "AI analysis skipped: Gemini daily free-tier quota is exhausted for today."
            : "The job was discovered successfully, but AI analysis could not be completed for this listing.",

          skills: [],

          missingSkills: [],

          quotaExhausted: isDailyQuotaError(aiError),

          snippet,
        };
      }
    }));

    /*
     * Highest matches first.
     */
    matchedJobs.sort(
      (a, b) => b.score - a.score
    );

    const quotaExhausted = matchedJobs.every(
      (job: any) => job.quotaExhausted
    );

    const message = quotaExhausted
      ? "Gemini's daily free-tier quota is exhausted, so scores below couldn't be AI-analyzed. Try again after the quota resets, or use a paid Gemini API key."
      : locationFilterFellBack
      ? `No listings explicitly confirmed for "${location}" — showing the closest broader matches instead. Location on these may not be exact.`
      : undefined;

    return NextResponse.json({
      jobs: matchedJobs,
      count: matchedJobs.length,
      ...(message && { message }),
    });
  } catch (error: any) {
    console.error(
      "Hunt route crashed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Hunting routine encountered a global runtime exception.",
      },
      { status: 500 }
    );
  }
}