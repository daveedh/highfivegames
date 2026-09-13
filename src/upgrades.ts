import type { Receipt } from './copy.ts';

export type UpgradeId = Receipt['upgradeId'];
export type UpgradeState = 'world' | 'carried' | 'processing' | 'claimed';
export const CHECKOUT_SECONDS = 3;

export class Upgrades {
  private boxes: Record<UpgradeId, { state: UpgradeState; seconds: number }> = {
    band: { state: 'world', seconds: 0 },
    pouch: { state: 'world', seconds: 0 }
  };

  state(id: UpgradeId): UpgradeState { return this.boxes[id].state; }
  progress(id: UpgradeId): number { return this.boxes[id].seconds / CHECKOUT_SECONDS; }
  get carrying(): UpgradeId | null {
    return this.boxes.band.state === 'carried' ? 'band' : this.boxes.pouch.state === 'carried' ? 'pouch' : null;
  }
  get capacity(): number { return this.state('pouch') === 'claimed' ? 8 : 5; }

  pickUp(id: UpgradeId): boolean {
    if (this.carrying || this.state(id) !== 'world') return false;
    this.boxes[id].state = 'carried';
    return true;
  }

  deposit(id: UpgradeId): boolean {
    if (this.state(id) !== 'carried') return false;
    this.boxes[id].state = 'processing';
    return true;
  }

  /** Returns true only on the frame the self-checkout finishes. */
  process(id: UpgradeId, dt: number, attended: boolean): boolean {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Checkout time must be finite and non-negative');
    const box = this.boxes[id];
    if (box.state !== 'processing' || !attended) return false;
    box.seconds = Math.min(CHECKOUT_SECONDS, box.seconds + dt);
    if (box.seconds < CHECKOUT_SECONDS) return false;
    box.state = 'claimed';
    return true;
  }

  shotSpeed(charge: number, tierSpeed: number): number {
    const pull = Math.max(0, Math.min(1, charge));
    // A replacement band engages at full pull only; partial pulls keep their old curve.
    const base = this.state('band') === 'claimed' && pull === 1 ? 62 : 14 + 34 * pull;
    return base * tierSpeed;
  }

  reset(): void {
    for (const box of Object.values(this.boxes)) {
      box.state = 'world';
      box.seconds = 0;
    }
  }
}
