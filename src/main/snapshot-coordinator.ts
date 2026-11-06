import type { SnapshotError } from '../shared/types';

export type SnapshotFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SnapshotError };

export interface CoordinatorResult<T> {
  data: T | null;
  error: SnapshotError | null;
  stale: boolean;
  ageMs: number;
  cached: boolean;
}

export interface CoordinatorOptions {
  maxAgeMs?: number;
  force?: boolean;
}

/**
 * Coalesces snapshot reads from the polling timer, manual refresh buttons and
 * all renderer IPC callers into a single in-flight request. A successful result
 * is cached briefly so multiple windows do not ask the service for the same
 * expensive hardware snapshot at the same time.
 */
export class SnapshotCoordinator<T> {
  private latest: T | null = null;
  private latestAt = 0;
  private inFlight: Promise<CoordinatorResult<T>> | null = null;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly defaultMaxAgeMs = 500,
  ) {}

  getLatest(): { data: T | null; ageMs: number } {
    return {
      data: this.latest,
      ageMs: this.latest === null ? 0 : Math.max(0, this.now() - this.latestAt),
    };
  }

  invalidate(): void {
    this.latest = null;
    this.latestAt = 0;
  }

  async get(
    fetcher: () => Promise<SnapshotFetchResult<T>>,
    options: CoordinatorOptions = {},
  ): Promise<CoordinatorResult<T>> {
    const maxAgeMs = options.maxAgeMs ?? this.defaultMaxAgeMs;
    const age = this.latest === null ? 0 : Math.max(0, this.now() - this.latestAt);

    if (!options.force && this.latest !== null && age <= maxAgeMs) {
      return { data: this.latest, error: null, stale: false, ageMs: age, cached: true };
    }

    if (this.inFlight) return this.inFlight;

    const request = (async (): Promise<CoordinatorResult<T>> => {
      const result = await fetcher();
      if (result.ok) {
        this.latest = result.data;
        this.latestAt = this.now();
        return { data: result.data, error: null, stale: false, ageMs: 0, cached: false };
      }

      const staleAge = this.latest === null ? 0 : Math.max(0, this.now() - this.latestAt);
      return {
        data: this.latest,
        error: result.error,
        stale: this.latest !== null,
        ageMs: staleAge,
        cached: false,
      };
    })();

    this.inFlight = request;
    try {
      return await request;
    } finally {
      if (this.inFlight === request) this.inFlight = null;
    }
  }
}
