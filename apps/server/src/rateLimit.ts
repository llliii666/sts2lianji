import { HttpError } from "./errors.js";

interface Bucket {
  count: number;
  resetAt: number;
}

export class MemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number) {}

  hit(key: string, limit: number, windowMs: number): void {
    const now = this.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    current.count += 1;
    if (current.count > limit) {
      throw new HttpError(429, "操作太频繁，请稍后再试。", "RATE_LIMITED");
    }
  }

  prune(): void {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
