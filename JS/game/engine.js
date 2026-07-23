// ============================================================================
//  engine.js — the HR Jump game loop ("UMM fingers" climber).
// ----------------------------------------------------------------------------
//  Hold a finger on the screen: the mascot flies just above the fingertip and
//  follows it while the career ladder scrolls upward. Two ways to lose a life:
//    1. Lift your finger.
//    2. Strike an HR obstacle.
//  Three lives per daily run. Collect coins & power-ups on the way up.
//
//  The engine is self-contained: it emits state via callbacks and never talks
//  to the network or the DOM HUD directly.
// ============================================================================

import { Player } from './player.js';
import { Obstacle } from './obstacles.js';
import { Collectible, POWERUPS, randomCollectibleType } from './powerups.js';
import { levelForScore, levelParams } from './levels.js';

const BASE_SCROLL = 0.12;   // px per ms at speed multiplier 1
const SCORE_PER_PX = 0.7;   // points per pixel climbed
const COIN_POINTS = 25;
const MAX_LIVES = 5;
const RESUME_GRACE_MS = 900; // brief invincibility after (re)touching

function overlap(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x &&
    a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export class Engine {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // callbacks: onState, onGameOver, onPickup, onLevelUp, onHit, onLift,
    //            onWaiting, onResume
    this.cb = callbacks;
    this.world = { w: 0, h: 0 };
    this.running = false;
    this.state = 'idle'; // 'idle' | 'waiting' | 'active' | 'over'
    this.pointerDown = false;
    this._raf = 0;
    this._boundLoop = this._loop.bind(this);
    this._onResize = () => this._resize();

    this._bindInput();
    this._resize();
  }

  // ----- lifecycle ---------------------------------------------------------

  start({ lives = 3, streak = 0, startShieldMs = 0 } = {}) {
    this._resize();
    this.player = new Player(this.world);
    this.obstacles = [];
    this.collectibles = [];
    this.score = 0;
    this.level = 1;
    this.lives = Math.min(MAX_LIVES, lives);
    this.streak = streak;
    this.slowUntil = 0;
    this.shieldUntil = 0;
    this._pendingShieldMs = startShieldMs; // applied on first touch (rule 12)
    this.rungOffset = 0;
    this._obTimer = 0;
    this._coTimer = 0;
    this._last = performance.now();
    this.pointerDown = false;

    this.running = true;
    this.state = 'waiting';
    this._emitState();
    this.cb.onWaiting?.({ lives: this.lives, first: true });

    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(this._boundLoop);
  }

  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this._unbindInput();
  }

  // ----- input (Pointer Events unify touch + mouse) ------------------------

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  // Mascot sits above the fingertip so the finger never hides it.
  _aimAt(x, y) {
    const offset = this.player.size * 1.1;
    this.player.setTarget(x, y - offset);
  }

  _bindInput() {
    this._onDown = (e) => {
      if (!this.running || this.state === 'over') return;
      this.canvas.setPointerCapture?.(e.pointerId);
      this.pointerDown = true;
      const [x, y] = this._pos(e);
      this._aimAt(x, y);
      if (this.state === 'waiting') { this.player.snap(); this._resume(); }
      e.preventDefault();
    };
    this._onMove = (e) => {
      if (!this.pointerDown || this.state !== 'active') return;
      const [x, y] = this._pos(e);
      this._aimAt(x, y);
      e.preventDefault();
    };
    this._onUp = () => {
      if (!this.pointerDown) return;
      this.pointerDown = false;
      if (this.state === 'active') this._loseLife('lift', performance.now());
    };

    this.canvas.addEventListener('pointerdown', this._onDown, { passive: false });
    this.canvas.addEventListener('pointermove', this._onMove, { passive: false });
    this.canvas.addEventListener('pointerup', this._onUp);
    this.canvas.addEventListener('pointercancel', this._onUp);
    window.addEventListener('resize', this._onResize);
  }

  _unbindInput() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    this.canvas.removeEventListener('pointermove', this._onMove);
    this.canvas.removeEventListener('pointerup', this._onUp);
    this.canvas.removeEventListener('pointercancel', this._onUp);
  }

  _resume() {
    const now = performance.now();
    this.state = 'active';
    this._last = now;
    this.player.invincibleUntil = now + RESUME_GRACE_MS;
    if (this._pendingShieldMs > 0) {          // streak Fast-Track, first touch
      this.shieldUntil = now + this._pendingShieldMs;
      this._pendingShieldMs = 0;
    }
    this.cb.onResume?.();
    this._emitState();
  }

  _loseLife(reason, now) {
    this.lives -= 1;
    if (reason === 'lift') this.cb.onLift?.(this.lives);
    else this.cb.onHit?.(reason, this.lives);

    if (this.lives <= 0) { this._gameOver(); return; }

    if (reason === 'lift') {
      this.state = 'waiting';
      this.cb.onWaiting?.({ lives: this.lives, first: false });
    } else {
      this.player.invincibleUntil = now + 1200; // keep playing, finger still down
    }
    this._emitState();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const cssH = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const prev = this.world;
    this.world = { w: cssW, h: cssH };
    if (this.player && prev.w) {
      this.player.x *= cssW / prev.w;
      this.player.targetX *= cssW / prev.w;
    }
  }

  // ----- main loop ---------------------------------------------------------

  _loop(now) {
    if (!this.running) return;
    let dt = now - this._last;
    this._last = now;
    if (dt > 60) dt = 60;

    if (this.state === 'active') this._update(dt, now);
    this._draw(now);

    this._raf = requestAnimationFrame(this._boundLoop);
  }

  _update(dt, now) {
    const lp = levelParams(this.level);
    const slow = now < this.slowUntil ? 0.5 : 1;
    const boost = now < this.shieldUntil ? 1.25 : 1;
    const scroll = BASE_SCROLL * lp.speedMul * slow * boost * dt;

    this.score += scroll * SCORE_PER_PX;
    this.rungOffset = (this.rungOffset + scroll) % (this.world.h / 5);

    const newLevel = levelForScore(this.score);
    if (newLevel !== this.level) {
      this.level = newLevel;
      this.cb.onLevelUp?.(levelParams(this.level).info, this.level);
    }

    this.player.update(dt);

    // Spawn obstacles.
    this._obTimer += dt;
    if (this._obTimer >= lp.spawnMs) {
      this._obTimer = 0;
      this.obstacles.push(new Obstacle(this.world));
      if (lp.double && Math.random() < 0.5) this.obstacles.push(new Obstacle(this.world));
    }

    // Spawn collectibles.
    this._coTimer += dt;
    if (this._coTimer >= 1100) {
      this._coTimer = 0;
      if (Math.random() < 0.8) {
        this.collectibles.push(new Collectible(this.world, randomCollectibleType()));
      }
    }

    const shielded = now < this.shieldUntil;
    const invincible = shielded || now < this.player.invincibleUntil;
    const pb = this.player.bounds();

    for (const o of this.obstacles) {
      o.update(dt, scroll);
      if (o.dead) continue;
      if (overlap(pb, o.bounds())) {
        if (shielded) { o.dead = true; this.score += 5; }
        else if (!invincible) {
          o.dead = true;
          this._loseLife(o.label, now);
          if (this.state !== 'active') return; // game over or waiting
        }
      }
    }
    this.obstacles = this.obstacles.filter((o) => !o.dead);

    for (const c of this.collectibles) {
      c.update(dt, scroll);
      if (c.dead) continue;
      if (overlap(pb, c.bounds())) { c.dead = true; this._collect(c.type, now); }
    }
    this.collectibles = this.collectibles.filter((c) => !c.dead);

    this._emitState();
  }

  _collect(type, now) {
    if (type === 'coin') this.score += COIN_POINTS;
    else if (type === 'slow') this.slowUntil = now + POWERUPS.slow.duration;
    else if (type === 'shield') this.shieldUntil = now + POWERUPS.shield.duration;
    else if (type === 'life') this.lives = Math.min(MAX_LIVES, this.lives + 1);
    this.cb.onPickup?.(type);
    this._emitState();
  }

  _gameOver() {
    this.state = 'over';
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.cb.onGameOver?.({ score: Math.floor(this.score), level: this.level });
  }

  _emitState() {
    const now = performance.now();
    this.cb.onState?.({
      score: Math.floor(this.score),
      level: this.level,
      levelInfo: levelParams(this.level).info,
      lives: this.lives,
      streak: this.streak,
      slowMs: Math.max(0, this.slowUntil - now),
      shieldMs: Math.max(0, this.shieldUntil - now),
    });
  }

  // ----- rendering ---------------------------------------------------------

  _draw(now) {
    const { ctx } = this;
    const { w, h } = this.world;

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a0f08');
    g.addColorStop(0.55, '#5c1f10');
    g.addColorStop(1, '#a8410f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 200, 120, 0.10)';
    ctx.lineWidth = 3;
    const gap = h / 5;
    for (let y = this.rungOffset - gap; y < h + gap; y += gap) {
      ctx.beginPath();
      ctx.moveTo(w * 0.2, y);
      ctx.lineTo(w * 0.8, y);
      ctx.stroke();
    }

    for (const o of this.obstacles) o.draw(ctx);
    for (const c of this.collectibles) c.draw(ctx);
    if (this.player) this.player.draw(ctx, now, now < this.shieldUntil);
  }
}
