export interface PricePoint {
  t: number; // unix ms
  v: number; // price
}

export interface ResolutionDef {
  key: string;
  intervalMs: number;
  maxPoints: number;
  label: string;
}

export const RESOLUTIONS: ResolutionDef[] = [
  { key: "1m",  intervalMs:      60_000, maxPoints:  60, label: "1m"  },
  { key: "6m",  intervalMs:     360_000, maxPoints:  60, label: "6m"  },
  { key: "30m", intervalMs:   1_800_000, maxPoints:  48, label: "30m" },
  { key: "3h",  intervalMs:  10_800_000, maxPoints:  56, label: "3h"  },
  { key: "1d",  intervalMs:  86_400_000, maxPoints:  30, label: "1D"  },
  { key: "1w",  intervalMs: 604_800_000, maxPoints:  52, label: "1W"  },
];

const MIN_KEEP = 2;       // always retain at least this many points per resolution
const MIN_DISPLAY = 3;    // minimum points before a resolution is considered "ready"
const LS_PREFIX = "insurArc_priceCache_v1_";

interface ResState {
  points: PricePoint[];
  lastInsert: number; // ms timestamp of last insert
}
type SymCache = Record<string, ResState>;
type Store = Record<string, SymCache>;

function emptySymCache(): SymCache {
  const c: SymCache = {};
  for (const r of RESOLUTIONS) c[r.key] = { points: [], lastInsert: 0 };
  return c;
}

export class PriceCache {
  private store: Store = {};
  private readonly lsKey: string;

  constructor(cacheKey: string) {
    this.lsKey = LS_PREFIX + cacheKey;
    this.hydrate();
  }

  private hydrate() {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(this.lsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Store;
      // Back-fill missing resolution keys added after first persist
      for (const sym of Object.keys(parsed)) {
        for (const r of RESOLUTIONS) {
          if (!parsed[sym][r.key]) parsed[sym][r.key] = { points: [], lastInsert: 0 };
        }
      }
      this.store = parsed;
    } catch { /* invalid JSON — start fresh */ }
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(this.lsKey, JSON.stringify(this.store));
    } catch { /* quota exceeded — in-memory continues */ }
  }

  /** Feed a new price into every resolution that has elapsed its interval. */
  addPoint(symbol: string, price: number, now = Date.now()) {
    if (!this.store[symbol]) this.store[symbol] = emptySymCache();
    const sym = this.store[symbol];
    let dirty = false;

    for (const r of RESOLUTIONS) {
      const state = sym[r.key];
      if (now - state.lastInsert < r.intervalMs) continue;

      state.points.push({ t: now, v: price });
      state.lastInsert = now;

      // Prune while guaranteeing MIN_KEEP points are always retained
      const cap = Math.max(MIN_KEEP, r.maxPoints);
      if (state.points.length > cap) state.points = state.points.slice(-cap);
      dirty = true;
    }

    if (dirty) this.persist();
  }

  getPoints(symbol: string, resKey: string): PricePoint[] {
    return this.store[symbol]?.[resKey]?.points ?? [];
  }

  pointCount(symbol: string, resKey: string): number {
    return this.getPoints(symbol, resKey).length;
  }

  /** Finest resolution that has ≥ MIN_DISPLAY points; falls back to coarsest. */
  selectBestResolution(symbol: string): ResolutionDef {
    for (const r of RESOLUTIONS) {
      if (this.pointCount(symbol, r.key) >= MIN_DISPLAY) return r;
    }
    return RESOLUTIONS[RESOLUTIONS.length - 1];
  }

  hasAnyData(symbol: string): boolean {
    return RESOLUTIONS.some((r) => this.pointCount(symbol, r.key) > 0);
  }
}
