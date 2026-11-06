import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

interface ThrottleState {
  at: number;
  suppressed: number;
}

/**
 * Small append-only logger with duplicate suppression and size-based rotation.
 * It intentionally stays synchronous: log volume is low after request-level
 * ASP.NET logging is filtered, and startup/exit messages must not be lost.
 */
export class RotatingLogger {
  private readonly file: string;
  private readonly rotated: string;
  private readonly throttle = new Map<string, ThrottleState>();

  constructor(
    private readonly directory: string,
    private readonly maxBytes = 5 * 1024 * 1024,
    private readonly now: () => number = Date.now,
  ) {
    mkdirSync(this.directory, { recursive: true });
    this.file = join(this.directory, 'main.log');
    this.rotated = `${this.file}.1`;
    this.rotateIfNeeded();
  }

  log(message: string, key?: string, intervalMs = 5_000): void {
    let line = message;
    if (key && intervalMs > 0) {
      const current = this.now();
      const previous = this.throttle.get(key);

      if (previous && current - previous.at < intervalMs) {
        previous.suppressed += 1;
        return;
      }

      if (previous?.suppressed) {
        line += ` (suppressed ${previous.suppressed} duplicate(s))`;
      }
      this.throttle.set(key, { at: current, suppressed: 0 });
    }

    try {
      appendFileSync(this.file, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
      this.rotateIfNeeded();
    } catch {
      // Logging must never crash the application.
    }
  }

  logTransition(key: string, message: string): void {
    const previous = this.throttle.get(key);
    const suffix = previous?.suppressed ? ` (suppressed ${previous.suppressed} duplicate(s))` : '';
    this.throttle.set(key, { at: this.now(), suppressed: 0 });
    try {
      appendFileSync(this.file, `[${new Date().toISOString()}] ${message}${suffix}\n`, 'utf8');
      this.rotateIfNeeded();
    } catch {
      // Logging must never crash the application.
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!existsSync(this.file) || statSync(this.file).size < this.maxBytes) return;
      if (existsSync(this.rotated)) unlinkSync(this.rotated);
      renameSync(this.file, this.rotated);
    } catch {
      // Rotation failure must not prevent logging.
    }
  }
}
