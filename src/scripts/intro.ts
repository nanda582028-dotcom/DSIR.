/*
 * DSIR intro — scroll-driven grain fields on one 2D canvas.
 *
 * Ported from design/Intro.dc.html. Every constant here is deliberate and comes
 * from the motion specification in the handoff README; treat them as fixed.
 *
 * Two bugs from the prototype are worth not repeating, and both are handled below:
 *   1. Elements are looked up by attribute each frame, never held as long-lived
 *      refs — a remount silently orphaned them and froze the animation.
 *   2. Exactly one animation loop runs per page; a new one cancels the previous,
 *      and the draw call sits inside a try so one bad frame cannot break the chain.
 */

interface Beat {
  key: string;
  src: string | null;
  gold: boolean;
  a: number; // grains begin arriving from depth
  b: number; // object resolved
  c: number; // begins its pass past the camera
  d: number; // gone
}

/* Windows overlap so a hand-off never shows empty black. */
const BEATS: Beat[] = [
  { key: 'film', src: '/intro/oscar.webp', gold: true, a: 0.3, b: 0.385, c: 0.455, d: 0.51 },
  { key: 'music', src: '/intro/grammy.jpg', gold: true, a: 0.47, b: 0.545, c: 0.615, d: 0.67 },
  { key: 'lit', src: '/intro/booker.jpg', gold: true, a: 0.63, b: 0.705, c: 0.775, d: 0.83 },
  { key: 'culture', src: null, gold: false, a: 0.79, b: 0.86, c: 0.92, d: 0.965 },
];

const DEFAULT_GRAIN_COUNT = 6500;
const DISC_COUNT = 4200;
const ARMS = 3;

interface Grain {
  px: number;
  py: number;
  l: number;
  a: number;
  rr: number;
  o: number;
  ph: number;
  sz: number;
}

interface DiscPoint {
  r: number;
  a0: number;
  v: number;
  sp: number;
  sz: number;
  red: boolean;
}

declare global {
  interface Window {
    __dsirIntroCancel?: () => void;
  }
}

const ss = (x: number, a: number, b: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const band = (x: number, a: number, b: number, c: number, d: number): number =>
  Math.min(ss(x, a, b), 1 - ss(x, c, d));

export function startIntro(grainCount = DEFAULT_GRAIN_COUNT): void {
  const cache = new Map<string, Element | null>();

  const q = (name: string): HTMLElement | null => {
    const hit = cache.get(name) as HTMLElement | null | undefined;
    if (hit && hit.isConnected) return hit;
    const el = document.querySelector<HTMLElement>(`[data-intro="${name}"]`);
    cache.set(name, el);
    return el;
  };

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fields: Record<string, Grain[]> = {};

  let ctx: CanvasRenderingContext2D | null = null;
  let cvEl: HTMLCanvasElement | null = null;
  let W = 0;
  let H = 0;
  let disc: DiscPoint[] | null = null;

  let p: number | undefined; // first frame snaps to the real scroll position
  let tPrev = 0;
  let lastDraw = 0;
  const t0 = performance.now();

  /* The pointer starts off-screen so nothing distorts before the reader moves. */
  let mx = -9999;
  let my = -9999;

  /* ---------- grain fields sampled off the real objects ---------- */

  function sample(src: HTMLCanvasElement, w: number, h: number, target: number): Grain[] {
    const g = src.getContext('2d');
    if (!g) return [];
    const d = g.getImageData(0, 0, w, h).data;
    const raw: Array<Pick<Grain, 'px' | 'py' | 'l'>> = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = d[i]!;
        const gg = d[i + 1]!;
        const b = d[i + 2]!;
        /* Keep anything meaningfully darker or more saturated than the white
           ground. This is what drops the stock watermark. */
        const off = Math.max(255 - r, 255 - gg, 255 - b);
        if (off < 60) continue;
        raw.push({
          px: (x / w - 0.5) * (w / h), // normalised to height 1, aspect preserved
          py: y / h - 0.5,
          l: (r * 0.299 + gg * 0.587 + b * 0.114) / 255,
        });
      }
    }

    for (let i = raw.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = raw[i]!;
      raw[i] = raw[j]!;
      raw[j] = t;
    }

    return raw.slice(0, target).map((qq, i) => ({
      ...qq,
      a: Math.random() * Math.PI * 2,
      rr: 0.35 + Math.pow(Math.random(), 0.7) * 0.95,
      o: i / target,
      ph: Math.random() * Math.PI * 2,
      sz: Math.random() < 0.12 ? 1.7 : 1,
    }));
  }

  /* Culture has no trophy photograph, so its grain is sampled off a drawn
     television silhouette in the same way the awards are sampled off theirs. */
  function drawScreen(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 150;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 200, 150);
    g.fillStyle = '#000';
    g.strokeStyle = '#000';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(62, 20);
    g.lineTo(40, 2);
    g.moveTo(112, 20);
    g.lineTo(138, 4);
    g.stroke();

    const body = (x: number, y: number, w: number, h: number, r: number) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };

    body(8, 18, 168, 108, 10);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    body(20, 30, 120, 84, 6);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(158, 52, 8, 0, Math.PI * 2);
    g.arc(158, 84, 8, 0, Math.PI * 2);
    g.fill();
    g.fillRect(30, 126, 10, 16);
    g.fillRect(144, 126, 10, 16);
    return c;
  }

  function loadField(beat: Beat): void {
    const count = Math.max(1200, Math.min(12000, grainCount));
    if (!beat.src) {
      fields[beat.key] = sample(drawScreen(), 200, 150, count);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const w = 220;
      const h = Math.max(1, Math.round((w * img.height) / img.width));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      fields[beat.key] = sample(c, w, h, count);
    };
    img.onerror = () => console.warn('intro: could not load ' + beat.src);
    img.src = beat.src;
  }

  /* ---------- geometry ---------- */

  function progress(): number {
    const el = q('track');
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, -r.top / span));
  }

  function build(): void {
    const c = q('canvas') as HTMLCanvasElement | null;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = c.clientWidth;
    H = c.clientHeight;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    ctx = c.getContext('2d');
    /* All the maths below is in CSS pixels. */
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!disc) {
      const g2 = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;
      disc = new Array(DISC_COUNT).fill(0).map((_, i) => {
        const r = Math.pow(Math.random(), 0.62);
        return {
          r,
          a0:
            (i % ARMS) * ((Math.PI * 2) / ARMS) +
            2.9 * Math.log(0.22 + r * 2.6) +
            g2() * (0.1 + r * 0.42),
          v: g2(),
          sp: 0.9 + Math.random() * 0.25,
          sz: Math.random() < 0.1 ? 1.7 : 1,
          red: Math.random() < 0.05 && r > 0.45,
        };
      });
    }
  }

  /* ---------- phase A: the galaxy ---------- */

  function galaxy(g: CanvasRenderingContext2D, p0: number, t: number): void {
    if (!disc) return;
    const cx = W / 2;
    const cy = H * 0.44;
    const base = Math.min(W, H);
    const collapse = ss(p0, 0.03, 0.2);
    const burst = ss(p0, 0.24, 0.36);
    const gone = ss(p0, 0.26, 0.34);
    const spin = t * (0.06 + p0 * 0.45) + p0 * 2.2;
    const R = base * (0.5 + 0.1 * collapse + 2.2 * burst);

    const glow = (0.1 + 0.5 * collapse) * (1 - burst);
    if (glow > 0.01) {
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.34);
      gr.addColorStop(0, 'rgba(255,255,255,' + (glow * 0.22).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(cx, cy, R * 0.34, R * 0.16, 0, 0, Math.PI * 2);
      g.fill();
    }

    const fade = (1 - gone) * (1 - burst * 0.35);
    if (fade <= 0.01) return;

    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < disc.length; i++) {
      const qq = disc[i]!;
      /* differential rotation — the inner disc outruns the arms */
      const a = qq.a0 + spin * qq.sp * (0.45 + 0.75 / (0.35 + qq.r));
      const rad = qq.r * R;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad * 0.36 + qq.v * base * 0.018;
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      const alpha = (0.16 + 0.62 * (1 - qq.r)) * (0.45 + 0.55 * collapse) * fade;
      if (alpha <= 0.005) continue;
      g.fillStyle = qq.red
        ? 'rgba(237,28,36,' + Math.min(0.95, alpha * 1.6).toFixed(3) + ')'
        : 'rgba(255,255,255,' + Math.min(0.95, alpha).toFixed(3) + ')';
      const s = qq.sz * (1 + burst * 0.8);
      g.fillRect(x, y, s, s);
    }

    /* One red event in the whole phase. */
    const ring = band(p0, 0.1, 0.18, 0.22, 0.3);
    if (ring > 0.01) {
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = 'rgba(237,28,36,' + (ring * 0.55).toFixed(3) + ')';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(cx, cy, R * 0.6, R * 0.22, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }

  /* ---------- phase B: the section objects ---------- */

  function grainObject(g: CanvasRenderingContext2D, p0: number, t: number): void {
    for (const beat of BEATS) {
      if (p0 < beat.a - 0.01 || p0 > beat.d + 0.01) continue;
      const pts = fields[beat.key];
      if (!pts) continue;

      const assemble = ss(p0, beat.a, beat.b);
      const exit = ss(p0, beat.c, beat.d);
      const vis = Math.min(assemble, 1 - exit * exit);
      if (vis <= 0.004) continue;

      /* depth: +2.4 far behind the plane → 0 at rest → negative as it passes you */
      const z = 2.4 * (1 - assemble) - 1.15 * exit;
      const k = 1 / (1 + z * 0.52);
      const cx = W / 2;
      const cy = H * 0.4;
      const base = Math.min(W, H);
      const size = Math.min(H * 0.52, 460) * k;
      const mr = base * 0.13;
      const mr2 = mr * mr;

      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < pts.length; i++) {
        const qq = pts[i]!;
        /* staggered arrival, so the object resolves in a sweep rather than at once */
        const local = Math.min(1, Math.max(0, assemble * 1.4 - qq.o * 0.4));
        const e = local * local * (3 - 2 * local);
        const sx = cx + Math.cos(qq.a) * qq.rr * base * 0.95;
        const sy = cy + Math.sin(qq.a) * qq.rr * base * 0.62;
        let x = sx + (cx + qq.px * size - sx) * e;
        let y = sy + (cy + qq.py * size - sy) * e;

        const drift = 0.4 + (1 - e) * 0.6;
        x += Math.sin(t * 0.7 + qq.ph) * base * 0.006 * drift;
        y += Math.cos(t * 0.55 + qq.ph * 1.3) * base * 0.006 * drift;

        if (exit > 0) {
          const fan = exit * exit * base * (0.5 + qq.rr * 0.6);
          x += Math.cos(qq.a) * fan;
          y += Math.sin(qq.a) * fan * 0.8;
        }

        /* grains part around the cursor */
        const dx = x - mx;
        const dy = y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < mr2 && d2 > 0.01) {
          const push = 1 - d2 / mr2;
          const inv = 1 / Math.sqrt(d2);
          x += dx * inv * push * push * mr * 0.55;
          y += dy * inv * push * push * mr * 0.55;
        }

        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        const alpha = (0.2 + 0.72 * qq.l) * vis * (0.45 + 0.55 * e);
        if (alpha <= 0.006) continue;

        if (beat.gold) {
          /* Awards are gold, carried from each photograph's own brightness. */
          const r = 176 + 74 * qq.l;
          const gc = 132 + 78 * qq.l;
          const b = 34 + 62 * qq.l;
          g.fillStyle =
            'rgba(' + (r | 0) + ',' + (gc | 0) + ',' + (b | 0) + ',' + Math.min(0.95, alpha).toFixed(3) + ')';
        } else {
          g.fillStyle = 'rgba(255,255,255,' + Math.min(0.9, alpha * 0.85).toFixed(3) + ')';
        }
        /* grains swell as they pass the camera */
        const sz = Math.max(0.6, qq.sz * k);
        g.fillRect(x, y, sz, sz);
      }
    }
  }

  /* ---------- overlays ---------- */

  function set(name: string, a: number, dy: number, scale = 1): void {
    const el = q(name);
    if (!el) return;
    el.style.opacity = a.toFixed(3);
    el.style.transform = 'translateY(' + dy.toFixed(1) + 'px) scale(' + scale.toFixed(4) + ')';
    /* Overlays stay inert until they are past 60% opacity. */
    el.style.pointerEvents = a > 0.6 ? 'auto' : 'none';
    el.setAttribute('aria-hidden', a > 0.05 ? 'false' : 'true');
  }

  function overlay(p0: number): void {
    const a1 = band(p0, 0.004, 0.05, 0.115, 0.155);
    const a2 = band(p0, 0.175, 0.215, 0.275, 0.305);
    set('s1', a1, (1 - a1) * 16, 0.985 + a1 * 0.015);
    set('s2', a2, (1 - a2) * 16, 0.985 + a2 * 0.015);

    for (const b of BEATS) {
      const arrive = ss(p0, b.a + 0.045, b.b + 0.01);
      const v = Math.min(arrive, 1 - ss(p0, b.c - 0.01, b.d - 0.03));
      set(b.key, v, (1 - arrive) * 18, 0.94 + arrive * 0.06);
    }

    const a4 = ss(p0, 0.955, 0.995);
    set('enter', a4, (1 - a4) * 20, 0.97 + a4 * 0.03);

    const bar = q('bar');
    if (bar) bar.style.width = (p0 * 100).toFixed(2) + '%';
  }

  /* ---------- frame ---------- */

  function frame(single: boolean): void {
    const g = ctx;
    if (!g) return;
    const t = reduced ? 0 : (performance.now() - t0) / 1000;

    g.globalCompositeOperation = 'source-over';
    /* Each frame fills rather than clears, so grain leaves a short tail. */
    g.fillStyle = single ? '#000' : 'rgba(0,0,0,0.26)';
    g.fillRect(0, 0, W, H);

    galaxy(g, p!, t);
    grainObject(g, p!, t);
    overlay(p!);
  }

  function drawNow(single?: boolean): void {
    const c = q('canvas') as HTMLCanvasElement | null;
    if (!c) return;
    if (c !== cvEl || c.clientWidth !== W || c.clientHeight !== H) {
      cvEl = c;
      build();
    }
    const target = progress();
    const now = performance.now();

    if (p === undefined || single || reduced) {
      p = target;
    } else {
      /* Critically damped follow: the scroll wheel arrives in steps, the camera
         should not. ~150ms time constant, frame-rate independent. */
      const dt = Math.min(0.06, Math.max(0.001, (now - (tPrev || now)) / 1000));
      p += (target - p) * (1 - Math.exp(-dt * 6.5));
      if (Math.abs(target - p) < 0.0004) p = target;
    }
    tPrev = now;
    frame(!!single);
    lastDraw = now;
  }

  /* ---------- boot ---------- */

  build();
  BEATS.forEach(loadField);

  const onScroll = () => {
    if (reduced) {
      /* Reduced motion: one static frame at the current scroll position, redrawn
         on scroll, and no animation loop is ever started. */
      drawNow(true);
      return;
    }
    if (performance.now() - lastDraw > 120) drawNow();
  };
  const onResize = () => {
    build();
    drawNow(reduced);
  };
  const onMove = (e: PointerEvent) => {
    mx = e.clientX;
    my = e.clientY;
  };
  const onLeave = () => {
    mx = -9999;
    my = -9999;
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  if (!reduced) {
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);
  }

  /* Exactly one animation closure runs per page. A new claim replaces the previous
     one rather than orphaning it; a heartbeat restarts the chain if a frame dies. */
  if (window.__dsirIntroCancel) window.__dsirIntroCancel();

  let alive = true;
  let raf = 0;

  const tick = () => {
    if (!alive) return;
    try {
      drawNow();
    } catch (e) {
      console.error('intro frame', e);
    }
    raf = requestAnimationFrame(tick);
  };

  /* The heartbeat exists only to restart a broken frame chain, so it must not run
     under reduced motion — waking it there would start the very loop the spec
     forbids. (The prototype restarted the loop this way.) */
  const heartbeat = reduced
    ? 0
    : window.setInterval(() => {
        if (!alive || document.hidden) return;
        if (performance.now() - lastDraw > 400) {
          cancelAnimationFrame(raf);
          tick();
        }
      }, 500);

  window.__dsirIntroCancel = () => {
    alive = false;
    cancelAnimationFrame(raf);
    if (heartbeat) clearInterval(heartbeat);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerleave', onLeave);
  };

  if (reduced) drawNow(true);
  else tick();
}
