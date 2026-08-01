import { Redis } from "@upstash/redis";

import { isProductionRuntime } from "@/lib/prod-runtime";
import { DAILY_AI_TOKEN_LIMIT } from "@/lib/ratelimit-constants";

export { DAILY_AI_TOKEN_LIMIT } from "@/lib/ratelimit-constants";

export type RateLimitStatus = {
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
  dayKey: string;
  redisKey: string;
};

export class AiRateLimitError extends Error {
  readonly status = 429 as const;
  readonly used: number;
  readonly limit: number;

  constructor(used: number, limit: number = DAILY_AI_TOKEN_LIMIT) {
    super(
      `Daily AI limit reached (${used.toLocaleString()} / ${limit.toLocaleString()} tokens). Try again tomorrow.`,
    );
    this.name = "AiRateLimitError";
    this.used = used;
    this.limit = limit;
  }
}

export class AiQuotaUnavailableError extends Error {
  readonly status = 503 as const;

  constructor() {
    super(
      "AI usage tracking is unavailable. Configure Upstash Redis, then try again.",
    );
    this.name = "AiQuotaUnavailableError";
  }
}

function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function aiLimitRedisKey(userId: string, date = new Date()): string {
  return `ai_limit:${userId}:${utcDayKey(date)}`;
}

let redisSingleton: Redis | null = null;

function openUsage(userId: string): RateLimitStatus {
  return {
    allowed: true,
    used: 0,
    remaining: DAILY_AI_TOKEN_LIMIT,
    limit: DAILY_AI_TOKEN_LIMIT,
    dayKey: utcDayKey(),
    redisKey: aiLimitRedisKey(userId),
  };
}

function closedUsage(userId: string): RateLimitStatus {
  return {
    allowed: false,
    used: DAILY_AI_TOKEN_LIMIT,
    remaining: 0,
    limit: DAILY_AI_TOKEN_LIMIT,
    dayKey: utcDayKey(),
    redisKey: aiLimitRedisKey(userId),
  };
}

/**
 * Returns Redis when configured; null when env is missing.
 */
export function getRedis(): Redis | null {
  if (redisSingleton) return redisSingleton;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  redisSingleton = new Redis({ url, token });
  return redisSingleton;
}

/**
 * Read current daily token usage. Does not increment.
 * Soft-opens locally when Upstash is unavailable; fail-closed in production.
 */
export async function getDailyAiUsage(userId: string): Promise<RateLimitStatus> {
  const redis = getRedis();
  if (!redis) {
    if (isProductionRuntime()) return closedUsage(userId);
    return openUsage(userId);
  }

  try {
    const redisKey = aiLimitRedisKey(userId);
    const raw = await redis.get<number | string | null>(redisKey);
    const used = Number(raw ?? 0);
    const safeUsed = Number.isFinite(used) && used > 0 ? used : 0;

    return {
      allowed: safeUsed < DAILY_AI_TOKEN_LIMIT,
      used: safeUsed,
      remaining: Math.max(0, DAILY_AI_TOKEN_LIMIT - safeUsed),
      limit: DAILY_AI_TOKEN_LIMIT,
      dayKey: utcDayKey(),
      redisKey,
    };
  } catch {
    if (isProductionRuntime()) return closedUsage(userId);
    return openUsage(userId);
  }
}

/**
 * Enforce the daily cap before calling Groq.
 * Throws AiRateLimitError when the user is already at/over 20,000 tokens.
 * Throws AiQuotaUnavailableError when Redis is required but unavailable.
 */
export async function assertWithinDailyAiLimit(userId: string): Promise<RateLimitStatus> {
  const redis = getRedis();
  if (!redis && isProductionRuntime()) {
    throw new AiQuotaUnavailableError();
  }

  const status = await getDailyAiUsage(userId);
  if (!status.allowed) {
    if (!redis && isProductionRuntime()) {
      throw new AiQuotaUnavailableError();
    }
    throw new AiRateLimitError(status.used, status.limit);
  }
  return status;
}

/**
 * Increment the user's daily token counter after a successful Groq call.
 * TTL ≈ 48h so keys self-expire across day boundaries.
 * Soft-opens locally when Redis is down; fail-closed in production.
 */
export async function incrementDailyAiTokens(
  userId: string,
  tokens: number,
): Promise<RateLimitStatus> {
  const amount = Math.max(0, Math.floor(tokens));
  const redis = getRedis();
  if (!redis) {
    if (isProductionRuntime()) {
      throw new AiQuotaUnavailableError();
    }
    return {
      ...openUsage(userId),
      used: amount,
      remaining: Math.max(0, DAILY_AI_TOKEN_LIMIT - amount),
    };
  }

  try {
    const redisKey = aiLimitRedisKey(userId);

    const used =
      amount === 0
        ? Number((await redis.get(redisKey)) ?? 0)
        : await redis.incrby(redisKey, amount);

    // Refresh TTL on every write so the key outlives the calendar day slightly.
    await redis.expire(redisKey, 60 * 60 * 48);

    const safeUsed = Number(used) || 0;
    return {
      allowed: safeUsed < DAILY_AI_TOKEN_LIMIT,
      used: safeUsed,
      remaining: Math.max(0, DAILY_AI_TOKEN_LIMIT - safeUsed),
      limit: DAILY_AI_TOKEN_LIMIT,
      dayKey: utcDayKey(),
      redisKey,
    };
  } catch (err) {
    if (err instanceof AiQuotaUnavailableError) throw err;
    if (isProductionRuntime()) {
      throw new AiQuotaUnavailableError();
    }
    return {
      ...openUsage(userId),
      used: amount,
      remaining: Math.max(0, DAILY_AI_TOKEN_LIMIT - amount),
    };
  }
}

/**
 * Helper for Route Handlers that need a literal HTTP 429 response body.
 */
export function rateLimitExceededPayload(used: number, limit: number = DAILY_AI_TOKEN_LIMIT) {
  return {
    error: `Daily AI limit reached (${used.toLocaleString()} / ${limit.toLocaleString()} tokens). Try again tomorrow.`,
    code: "AI_DAILY_LIMIT" as const,
    used,
    limit,
  };
}
