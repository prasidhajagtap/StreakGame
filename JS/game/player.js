// ============================================================================
//  player.js — the employee mascot.
// ----------------------------------------------------------------------------
//  "UMM fingers" control: the mascot flies to a point just ABOVE the finger
//  and follows it in 2D (rule: finger drives the mascot). Lifting the finger
//  is handled by the engine (costs a life).
// ============================================================================

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export class Player {
  constructor(world) {
    this.world = world;
    this.size = Math.min(world.w, world.h) * 0.11;
    this.x = world.w / 2;
    this.y = world.h * 0.62;
    this.targetX = this.x;
    this.targetY = this.y;
    this.follow = 0.03;            // easing toward the finger (fly feel)
    this.emoji = '🧑‍💼';
    this.invincibleUntil = 0;
  }

  get half() { return this.size / 2; }

  /** Point the mascot at a finger location; it is drawn offset above the finger. */
  setTarget(x, y) {
    this.targetX = clamp(x, this.half, this.world.w - this.half);
    this.targetY = clamp(y, this.half, this.world.h - this.half);
  }

  /** Jump instantly to the target (used when re-entering after a lift). */
  snap() { this.x = this.targetX; this.y = this.targetY; }

  update(dt) {
    const k = Math.min(1, this.follow * dt);
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
  }

  bounds() {
    const pad = this.size * 0.22;
    return {
      x: this.x - this.half + pad,
      y: this.y - this.half + pad,
      w: this.size - pad * 2,
      h: this.size - pad * 2,
    };
  }

  draw(ctx, now, shielded) {
    ctx.save();
    const flashing = now < this.invincibleUntil;
    if (shielded) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.half * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 191, 0, 0.28)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 191, 0, 0.9)';
      ctx.stroke();
    }
    if (flashing && !shielded && Math.floor(now / 120) % 2 === 0) {
      ctx.globalAlpha = 0.35;
    }
    ctx.font = `${this.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, this.x, this.y);
    ctx.restore();
  }
}
