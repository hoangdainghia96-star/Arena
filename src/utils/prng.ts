/**
 * Deterministic Seeded PRNG (Mulberry32)
 * Ensures reproducible random selection, AI tie-breaking, and deterministic replay simulation.
 */
export class SeededRNG {
  private state: number;
  public readonly seedString: string;

  constructor(seedInput?: string | number) {
    this.seedString =
      seedInput !== undefined && seedInput !== ''
        ? String(seedInput)
        : `CATACLYSM-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 9999)}`;
    this.state = SeededRNG.hashString(this.seedString);
  }

  public static hashString(str: string): number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0 || 1;
  }

  /** Returns a float in [0, 1) */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max) */
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max] inclusive */
  public int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Returns true with probability p (0..1) */
  public chance(p: number): boolean {
    return this.next() < p;
  }

  /** Deterministically shuffles a copy of the array (Fisher-Yates) */
  public shuffle<T>(items: readonly T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /** Picks one random element from a non-empty array */
  public pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}
