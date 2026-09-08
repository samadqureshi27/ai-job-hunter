/*
 * Pure filtering/matching logic for search results returned by Serper,
 * extracted out of the hunt route so it can be unit tested directly.
 */

export type SearchResultItem = {
  title?: string;
  link?: string;
  snippet?: string;
};

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * The same posting is often indexed separately on LinkedIn, a job board,
 * and a company site. URLs differ, so a plain URL-dedupe misses these.
 * Stripping the "- Site Name" suffix and normalizing punctuation/case
 * gives a stable key for "same job, different listing."
 */
export function normalizeTitleKey(title: string) {
  return title
    .toLowerCase()
    .replace(
      /\s*[-|·]\s*(linkedin|indeed|glassdoor|wellfound|facebook|bebee)\b.*$/i,
      ""
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const CLOSED_LISTING_PATTERN =
  /(no longer accepting applications|position (has been )?filled|job (has )?(expired|closed)|this job (posting )?is (no longer )?(active|available)|applications? closed|hiring (has )?(paused|frozen))/i;

export function isClosedListing(item: SearchResultItem) {
  const text = `${item.title || ""} ${item.snippet || ""}`;

  return CLOSED_LISTING_PATTERN.test(text);
}

/*
 * Some job-board results returned by web search are search-result index
 * pages ("50+ React Jobs, Employment in Lahore") rather than a single
 * posting. They have no real single location or requirements, so both
 * the location filter and the AI analysis get garbage from them.
 */
export function isAggregatorListingPage(item: SearchResultItem) {
  const title = String(item.title || "");
  const url = String(item.link || "");

  return (
    /^\d+\+?\s.*\bjobs?\b/i.test(title) ||
    /\bjobs\s+in\b/i.test(title) ||
    /\/q-.*-jobs(-jobs)?\.html/i.test(url) ||
    /\/jobs\/search/i.test(url) ||
    /\/jobs?-in-/i.test(url)
  );
}

/*
 * A job is only kept if the requested location literally appears in its
 * title/snippet, or it's explicitly remote and the candidate wants
 * remote work. Otherwise Google's loose relevance ranking lets jobs from
 * other cities (e.g. Islamabad when Lahore was requested) slip through.
 */
export function buildCityRegex(location: string): RegExp | null {
  const citySegment = (location.split(",")[0] || location).trim();

  if (citySegment.length < 2) return null;

  return new RegExp(`\\b${escapeRegExp(citySegment)}\\b`, "i");
}

export function isLocationVerified(
  item: SearchResultItem,
  cityRegex: RegExp | null
) {
  if (!cityRegex) return true;

  const text = `${item.title || ""} ${item.snippet || ""}`;

  return cityRegex.test(text);
}

const REMOTE_PATTERN = /\bremote\b|work from (home|anywhere)/i;

export function isRemoteMatch(item: SearchResultItem, remotePreferred: boolean) {
  if (!remotePreferred) return false;

  const text = `${item.title || ""} ${item.snippet || ""}`;

  return REMOTE_PATTERN.test(text);
}
