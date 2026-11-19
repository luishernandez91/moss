interface Attempt {
  failures: number;
  expiresAt: number;
}
const WINDOW_MS = 15 * 60 * 1000;

/** Una instancia por proceso. Tanto bloqueos como contadores inactivos caducan. */
export class LoginAttempts {
  private readonly entries = new Map<string, Attempt>();
  constructor(readonly now: () => number = Date.now) {}

  private cleanup(): void {
    const now = this.now();
    for (const [ip, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(ip);
    }
  }

  retryAfter(ip: string): number {
    this.cleanup();
    const entry = this.entries.get(ip);
    return entry && entry.failures >= 5 ? Math.ceil((entry.expiresAt - this.now()) / 1000) : 0;
  }

  fail(ip: string): void {
    this.cleanup();
    const current = this.entries.get(ip);
    if (current && current.failures >= 5) return;
    this.entries.set(ip, {
      failures: (current?.failures ?? 0) + 1,
      expiresAt: this.now() + WINDOW_MS,
    });
  }

  succeed(ip: string): void {
    this.cleanup();
    this.entries.delete(ip);
  }
}
