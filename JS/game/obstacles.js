// ============================================================================
//  obstacles.js — HR-world hazards that fall toward the climbing mascot.
// ============================================================================

const OBSTACLE_KINDS = [
  { emoji: '📉', label: 'Budget Cut' },
  { emoji: '📋', label: 'Paperwork Pileup' },
  { emoji: '📎', label: 'Red Tape' },
  { emoji: '⏰', label: 'Deadline' },
  { emoji: '🗓️', label: 'Back-to-back Meeting' },
  { emoji: '☎️', label: 'Endless Call' },
  { emoji: '🔥', label: 'Burnout' },
];

export class Obstacle {
  constructor(world) {
    this.world = world;
    this.size = Math.min(world.w, world.h) * 0.1;
    this.x = this.size / 2 + Math.random() * (world.w - this.size);
    this.y = -this.size;
    const kind = OBSTACLE_KINDS[(Math.random() * OBSTACLE_KINDS.length) | 0];
    this.emoji = kind.emoji;
    this.label = kind.label;
    // Slight horizontal drift so patterns feel less rigid.
    this.drift = (Math.random() - 0.5) * 0.02;
    this.dead = false;
  }

  update(dt, scrollSpeed) {
    this.y += scrollSpeed * dt;
    this.x += this.drift * dt;
    if (this.y > this.world.h + this.size) this.dead = true;
  }

  bounds() {
    const pad = this.size * 0.2;
    return {
      x: this.x - this.size / 2 + pad,
      y: this.y - this.size / 2 + pad,
      w: this.size - pad * 2,
      h: this.size - pad * 2,
    };
  }

  draw(ctx) {
    ctx.save();
    ctx.font = `${this.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, this.x, this.y);
    ctx.restore();
  }
}
