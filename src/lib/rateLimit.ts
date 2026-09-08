/*
 * In-memory sliding-window rate limiter, keyed per client IP per route.
 * Good enough to stop a single caller from hammering the paid Gemini/Serper
 * APIs from a single dev/small-deployment process. It resets on server
 * restart and does NOT share state across multiple server instances —
 * for a multi-instance production deployment this needs a shared store
 * (e.g. Redis) instead.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function getClientKey(request: Request, routeName: string) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

  return `${routeName}:${ip}`;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
