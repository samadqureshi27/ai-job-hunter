import { describe, expect, it } from "vitest";
import {
  buildCityRegex,
  isAggregatorListingPage,
  isClosedListing,
  isLocationVerified,
  isRemoteMatch,
  normalizeTitleKey,
} from "./jobFilters";

describe("isAggregatorListingPage", () => {
  it("flags Indeed-style numbered category pages", () => {
    expect(
      isAggregatorListingPage({
        title: "50+ React Js Jobs, Employment in Lahore 5 September, 2026| Indeed",
        link: "https://pk.indeed.com/q-react-l-lahore-jobs.html",
      })
    ).toBe(true);
  });

  it("flags a search-index page whose URL slug contains a comma", () => {
    // Regression: an earlier regex used a [a-z0-9-]+ character class that
    // broke on punctuation like a comma in the query slug, letting this
    // page slip through undetected.
    expect(
      isAggregatorListingPage({
        title: "Nutritionist, public health jobs in Shahdara Bagh - Indeed",
        link: "https://pk.indeed.com/q-nutritionist,-public-health-l-shahdara-bagh-jobs.html",
      })
    ).toBe(true);
  });

  it("does not flag a real single posting whose title says 'job in' (singular)", () => {
    // Regression: an earlier "jobs? in" regex (with the optional s) also
    // matched singular "job in", wrongly killing real single-listing titles.
    expect(
      isAggregatorListingPage({
        title: "Front-end developer job in Lahore at Atmar Infotech - Facebook",
        link: "https://www.facebook.com/globaljobsopportunity/posts/123",
      })
    ).toBe(false);
  });

  it("does not flag an ordinary company job page", () => {
    expect(
      isAggregatorListingPage({
        title: "Frontend Developer - Systems Arabia - BeBee",
        link: "https://bebee.com/pk/jobs/frontend-developer-systems-arabia-lahore--fj-2342995802",
      })
    ).toBe(false);
  });

  it("flags LinkedIn/Indeed search-results URLs", () => {
    expect(
      isAggregatorListingPage({
        title: "Frontend Developer jobs",
        link: "https://www.linkedin.com/jobs/search?keywords=frontend",
      })
    ).toBe(true);
  });
});

describe("isClosedListing", () => {
  it("flags common closed/expired phrasing", () => {
    expect(
      isClosedListing({
        title: "Frontend Developer",
        snippet: "This position has been filled. Thanks for your interest.",
      })
    ).toBe(true);
  });

  it("does not flag an open listing", () => {
    expect(
      isClosedListing({
        title: "Frontend Developer",
        snippet: "We are looking for a talented frontend developer to join our team.",
      })
    ).toBe(false);
  });
});

describe("location filtering", () => {
  it("matches a job that mentions the requested city", () => {
    const cityRegex = buildCityRegex("Lahore, Pakistan");

    expect(
      isLocationVerified(
        { title: "Frontend Developer - Lahore, Punjab, Pakistan" },
        cityRegex
      )
    ).toBe(true);
  });

  it("rejects a job in a different city", () => {
    const cityRegex = buildCityRegex("Lahore, Pakistan");

    expect(
      isLocationVerified(
        { title: "Frontend Developer - Islamabad, Pakistan" },
        cityRegex
      )
    ).toBe(false);
  });

  it("does not let a short city code substring-match an unrelated word", () => {
    // Regression: without word boundaries, the 2-letter city "LA" matched
    // inside "Atlanta" ("At-LA-nta"), a false positive.
    const cityRegex = buildCityRegex("LA");

    expect(isLocationVerified({ title: "Engineer role in Atlanta" }, cityRegex)).toBe(
      false
    );
    expect(
      isLocationVerified({ title: "Engineer role in LA, California" }, cityRegex)
    ).toBe(true);
  });

  it("falls back to remote match when requested and the listing is remote", () => {
    expect(
      isRemoteMatch({ title: "Remote JavaScript Developer at Turing" }, true)
    ).toBe(true);
    expect(
      isRemoteMatch({ title: "Remote JavaScript Developer at Turing" }, false)
    ).toBe(false);
  });

  it("treats a location under 2 characters as unfiltered", () => {
    expect(buildCityRegex("")).toBeNull();
  });
});

describe("normalizeTitleKey", () => {
  it("treats the same job posted on different boards as identical", () => {
    const a = normalizeTitleKey(
      "Full Stack WordPress Developer - Napollo Software Design - LinkedIn"
    );
    const b = normalizeTitleKey(
      "Full Stack WordPress Developer - Napollo Software Design - Indeed"
    );

    expect(a).toBe(b);
  });

  it("keeps genuinely different job titles distinct", () => {
    const a = normalizeTitleKey("Frontend Developer at Acme - LinkedIn");
    const b = normalizeTitleKey("Backend Developer at Acme - LinkedIn");

    expect(a).not.toBe(b);
  });
});
