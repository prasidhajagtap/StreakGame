// ============================================================================
//  powerups.js — collectible coins and the three power-ups (rule 10).
// ============================================================================

// Power-up effect definitions. Durations in ms; `life` is instant.
export const POWERUPS = {
  slow:   { emoji: '☕', label: 'Coffee Break', desc: 'Slows the climb',      duration: 6000 },
  shield: { emoji: '⚡', label: 'Fast-Track',   desc: 'Speed through hazards', duration: 5000 },
  life:   { emoji: '❤️', label: 'Wellness Day', desc: '+1 life',              duration: 0 },
};

export class Collectible {
  /** type: 'coin' | 'slow' | 'shield' | 'life' */
  constructor(world, type) {
    this.world = world;
    this.type = type;
    this.size = Math.min(world.w, world.h) * (type === 'coin' ? 0.075 : 0.09);
    this.x = this.size / 2 + Math.random() * (world.w - this.size);
    this.y = -this.size;
    this.emoji = type === 'coin' ? '🪙' : POWERUPS[type].emoji;
    this.dead = false;
    this.bob = Math.random() * Math.PI * 2;
  }

  update(dt, scrollSpeed) {
    this.y += scrollSpeed * dt;
    this.bob += dt * 0.005;
    if (this.y > this.world.h + this.size) this.dead = true;
  }

  bounds() {
    return {
      x: this.x - this.size / 2,
      y: this.y - this.size / 2,
      w: this.size,
      h: this.size,
    };
  }

  draw(ctx) {
    ctx.save();
    if (this.type !== 'coin') {
      // Soft glow so power-ups read as desirable.
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 214, 120, 0.25)';
      ctx.fill();
    }
    const wobble = Math.sin(this.bob) * this.size * 0.06;
    ctx.font = `${this.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, this.x, this.y + wobble);
    ctx.restore();
  }
}

/**
 * Weighted random collectible type. Coins are common; power-ups are rare,
 * with extra lives the rarest.
 */
export function randomCollectibleType() {
  const r = Math.random();
  if (r < 0.62) return 'coin';
  if (r < 0.80) return 'slow';
  if (r < 0.94) return 'shield';
  return 'life';
}
