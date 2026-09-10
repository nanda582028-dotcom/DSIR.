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
  /* The ring angle the arm collapses into as the galaxy becomes a record. */
  au: number;
  v: number;
  sp: number;
  sz: number;
  red: boolean;
}

interface Plate {
  img: HTMLCanvasElement;
  lead: number;   // stagger along the shared spiral path
  th0: number;    // where on the spiral it enters
  tumble: number;
  curl: number;
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

export interface IntroOptions {
  /* Where the closing sheet spiral lands. */
  issueHref: string;
  grainCount?: number;
  /* Called the moment the reader commits to entering, so the page can record
     that the intro has been seen. */
  onEnter?: () => void;
}

export function startIntro(options: IntroOptions): void {
  const { issueHref, grainCount = DEFAULT_GRAIN_COUNT, onEnter } = options;
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

  /* Phase C state: the flood clock starts on click, and `left` guards the
     navigation so it fires exactly once. */
  let plates: Plate[] | null = null;
  let floodT0 = 0;
  let left = false;

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

  /* ---------- phase C: the closing sheet spiral ---------- */

  /* No article photography exists, so each sheet is a typographic plate drawn once
     on an offscreen canvas. Real cover photography drops straight into the same
     flight in place of these. */
  const PLATE_SPECS: Array<{ flag: string; lines: string[]; bg: string; ink: string }> = [
    { flag: 'Film', lines: ['The Substance', 'and the limits', 'of the body'], bg: '#000', ink: '#fff' },
    { flag: 'Music', lines: ['Brat summer,', 'one year on'], bg: '#ED1C24', ink: '#fff' },
    { flag: 'Literature', lines: ['The canon', 'nobody', 'assigned'], bg: '#fff', ink: '#000' },
    { flag: 'Culture', lines: ['Celebrity is', 'a full-time', 'job now'], bg: '#000', ink: '#fff' },
    { flag: 'Build It', lines: ['How a rollout', 'actually works'], bg: '#fff', ink: '#000' },
    { flag: 'Film', lines: ['Sequels,', 'franchises,', 'diminishing', 'returns'], bg: '#000', ink: '#fff' },
    { flag: 'Music', lines: ['What streaming', 'pays, exactly'], bg: '#ED1C24', ink: '#fff' },
    { flag: 'Culture', lines: ['Television', 'after the', 'algorithm'], bg: '#fff', ink: '#000' },
  ];

  const PLATE_W = 300;
  const PLATE_H = 400;

  function buildPlates(): void {
    const dpr = 2;
    const drawn = PLATE_SPECS.map((spec) => {
      const c = document.createElement('canvas');
      c.width = PLATE_W * dpr;
      c.height = PLATE_H * dpr;
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr);

      g.fillStyle = spec.bg;
      g.fillRect(0, 0, PLATE_W, PLATE_H);

      const faint = spec.ink === '#fff' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
      g.strokeStyle = faint;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0.5, 0.5);
      g.lineTo(PLATE_W - 0.5, 0.5);
      g.lineTo(PLATE_W - 0.5, PLATE_H - 0.5);
      g.lineTo(0.5, PLATE_H - 0.5);
      g.closePath();
      g.stroke();

      /* Section flag. Canvas has no letter-spacing, so it is tracked by hand. */
      g.fillStyle = spec.bg === '#ED1C24' ? '#fff' : spec.ink === '#fff' ? '#ED1C24' : '#C41219';
      g.font = '500 12px "Helvetica Neue", Helvetica, Arial, sans-serif';
      g.textBaseline = 'alphabetic';
      let fx = 28;
      for (const ch of spec.flag.toUpperCase()) {
        g.fillText(ch, fx, 44);
        fx += g.measureText(ch).width + 1.7;
      }
      g.strokeStyle = faint;
      g.beginPath();
      g.moveTo(28, 60);
      g.lineTo(PLATE_W - 28, 60);
      g.stroke();

      g.fillStyle = spec.ink;
      g.font = '400 34px Newsreader, "Times New Roman", Times, serif';
      let y = 116;
      for (const line of spec.lines) {
        g.fillText(line, 28, y);
        y += 38;
      }

      g.fillStyle = spec.ink === '#fff' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
      g.font = '400 15px Newsreader, "Times New Roman", Times, serif';
      g.fillText('DSIR.', 28, PLATE_H - 30);
      return c;
    });

    /* Sixteen sheets strung along one shared path, in order. */
    plates = new Array(16).fill(0).map((_, i) => ({
      img: drawn[i % drawn.length]!,
      lead: i * 0.058,
      th0: i * 0.38,
      tumble: (i % 2 ? 1 : -1) * (0.5 + (i % 3) * 0.22),
      curl: 0.45 + (i % 4) * 0.16,
    }));
  }

  /* Paper does not travel flat: each plate is drawn in strips whose ends lift,
     which reads as a curling tearsheet without a real 3D pipeline. */
  function drawCurled(
    g: CanvasRenderingContext2D,
    img: HTMLCanvasElement,
    w: number,
    h: number,
    curl: number,
  ): void {
    const N = 16;
    const sw = img.width / N;
    const dw = w / N;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1) - 0.5;
      const bend = curl * (u * u * 4 - 1) * h * 0.09;
      const sq = 1 - curl * 0.16 * Math.abs(u) * 2;
      g.drawImage(img, i * sw, 0, sw + 1, img.height, -w / 2 + i * dw, -h / 2 + bend, dw + 1.2, h * sq);
    }
  }

  /* Clicking Enter releases the issue: sheets travel one shared spiral path out of
     a vanishing point, widening and growing as they near the lens, until the last
     of them fills the frame and the issue opens. One shot, not a loop. */
  function plateFlight(g: CanvasRenderingContext2D): void {
    if (!plates || !floodT0) return;

    const flood = Math.min(1, (performance.now() - floodT0) / 1700);
    const cx = W * 0.54;
    const cy = H * 0.4;
    const base = Math.min(W, H);
    const head = flood * 1.62;

    g.globalCompositeOperation = 'source-over';
    for (let i = plates.length - 1; i >= 0; i--) {
      const q = plates[i]!;
      const sp = head - q.lead;
      if (sp <= 0 || sp > 1.18) continue;

      const z = 3.5 - sp * 4.2; // far behind the plane → past the lens
      if (z < -0.86) continue;
      const k = 1 / (1 + z * 0.55);
      const th = q.th0 + sp * 5.4; // ~0.86 of a turn
      const rw = 0.04 + sp * sp * 0.66; // spirals outward as it approaches
      const x = cx + Math.cos(th) * rw * base * k;
      const y = cy + Math.sin(th) * rw * base * 0.82 * k;

      const alpha = ss(sp, 0, 0.09);
      if (alpha <= 0.01) continue;

      g.save();
      g.globalAlpha = Math.min(1, alpha);
      g.translate(x, y);
      g.rotate(th * 0.3 + sp * q.tumble);
      g.scale(k * 0.52, k * 0.52);
      drawCurled(g, q.img, PLATE_W, PLATE_H, q.curl);
      g.restore();
    }
    g.globalAlpha = 1;

    const wash = ss(flood, 0.9, 1);
    if (wash > 0.001) {
      g.fillStyle = 'rgba(255,255,255,' + wash.toFixed(3) + ')';
      g.fillRect(0, 0, W, H);
    }

    if (flood >= 1 && !left) {
      left = true;
      window.location.href = issueHref;
    }
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
          au: Math.random() * Math.PI * 2,
          v: g2(),
          sp: 0.9 + Math.random() * 0.25,
          sz: Math.random() < 0.1 ? 1.7 : 1,
          red: Math.random() < 0.05 && r > 0.45,
        };
      });
    }
  }

  /* ---------- phase A: the galaxy becomes a vinyl record ---------- */

  /* The spiral arms collapse into concentric grooves, differential rotation gives
     way to rigid spin, the disc tilts up and a red label resolves at the centre.
     Then it blows past the frame. */
  function galaxy(g: CanvasRenderingContext2D, p0: number, t: number): void {
    if (!disc) return;
    const cx = W / 2;
    const cy = H * 0.44;
    const base = Math.min(W, H);
    const collapse = ss(p0, 0.03, 0.2);
    const burst = ss(p0, 0.24, 0.36);
    const gone = ss(p0, 0.26, 0.34);
    const vinyl = ss(p0, 0.07, 0.26);
    const spin = t * (0.06 + p0 * 0.45) + p0 * 2.2;
    const R = base * (0.5 + 0.1 * collapse + 2.2 * burst);
    const RINGS = 26;
    const squash = 0.36 + 0.26 * vinyl;

    const glow = (0.18 + 0.42 * collapse) * (1 - burst) * (1 - vinyl * 0.75);
    if (glow > 0.01) {
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.34);
      gr.addColorStop(0, 'rgba(255,255,255,' + (glow * 0.22).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(cx, cy, R * 0.34, R * 0.16, 0, 0, Math.PI * 2);
      g.fill();
    }

    /* The record itself resolves under the dust: body, grooves, specular sweep,
       label, spindle hole. */
    const va = vinyl * (1 - burst) * (1 - gone);
    if (va > 0.02) {
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(9,9,10,' + (va * 0.94).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(cx, cy, R, R * squash, 0, 0, Math.PI * 2);
      g.fill();

      g.lineWidth = 1;
      for (let i = 0; i < 58; i++) {
        const rr = 0.315 + (i / 58) * 0.685;
        const bandA = i % 7 === 0 ? 0.13 : i % 2 ? 0.055 : 0.085;
        g.strokeStyle = 'rgba(255,255,255,' + (va * bandA).toFixed(3) + ')';
        g.beginPath();
        g.ellipse(cx, cy, R * rr, R * rr * squash, 0, 0, Math.PI * 2);
        g.stroke();
      }

      g.save();
      g.beginPath();
      g.ellipse(cx, cy, R, R * squash, 0, 0, Math.PI * 2);
      g.clip();
      const sweep = g.createLinearGradient(cx - R, cy - R * squash, cx + R, cy + R * squash);
      sweep.addColorStop(0, 'rgba(255,255,255,0)');
      sweep.addColorStop(0.42, 'rgba(255,255,255,' + (va * 0.085).toFixed(3) + ')');
      sweep.addColorStop(0.58, 'rgba(255,255,255,' + (va * 0.05).toFixed(3) + ')');
      sweep.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sweep;
      g.fillRect(cx - R, cy - R, R * 2, R * 2);
      g.restore();

      g.fillStyle = 'rgba(237,28,36,' + (va * 0.96).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(cx, cy, R * 0.3, R * 0.3 * squash, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,' + (va * 0.34).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(cx, cy, R * 0.3, R * 0.3 * squash, 0, 0, Math.PI * 2);
      g.stroke();

      g.fillStyle = 'rgba(0,0,0,' + va.toFixed(3) + ')';
      g.beginPath();
      g.ellipse(cx, cy, R * 0.035, R * 0.035 * squash, 0, 0, Math.PI * 2);
      g.fill();
    }

    const fade = (1 - gone) * (1 - burst * 0.35) * (1 - vinyl * 0.45);
    if (fade > 0.01) {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < disc.length; i++) {
        const qq = disc[i]!;
        /* Three simultaneous lerps: radius quantises onto grooves, the arm angle
           slides to a uniform ring angle, differential rotation becomes rigid. */
        const rq = Math.round(qq.r * RINGS) / RINGS;
        const r = qq.r + (rq - qq.r) * vinyl;
        if (r < 0.045 * vinyl) continue; // the spindle hole opens
        const a0 = qq.a0 + (qq.au - qq.a0) * vinyl;
        const rot = spin * (qq.sp * (0.45 + 0.75 / (0.35 + qq.r)) * (1 - vinyl) + 0.85 * vinyl);
        const a = a0 + rot;
        const rad = r * R;
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad * squash + qq.v * base * 0.018 * (1 - vinyl * 0.8);
        if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;

        const groove = 0.72 + 0.28 * Math.sin(r * RINGS * Math.PI * 2);
        const shine = 1 + 0.5 * vinyl * Math.max(0, Math.cos(a - 0.7));
        const alpha =
          (0.16 + 0.62 * (1 - qq.r)) *
          (0.62 + 0.38 * collapse) *
          fade *
          (1 - vinyl * 0.3) *
          (1 - vinyl + vinyl * groove) *
          shine;
        if (alpha <= 0.005) continue;

        /* Grains inside the label radius turn red as the record resolves. */
        const onLabel = vinyl > 0.02 && r < 0.3;
        if (onLabel || qq.red) {
          const k = onLabel ? vinyl : 1;
          g.fillStyle =
            'rgba(237,28,36,' + Math.min(0.95, alpha * (1.6 * k + (1 - k))).toFixed(3) + ')';
        } else {
          g.fillStyle = 'rgba(255,255,255,' + Math.min(0.95, alpha).toFixed(3) + ')';
        }
        const sz = qq.sz * (1 + burst * 0.8);
        g.fillRect(x, y, sz, sz);
      }
    }

    g.globalCompositeOperation = 'source-over';
    if (va > 0.02) {
      g.strokeStyle = 'rgba(255,255,255,' + (va * 0.32).toFixed(3) + ')';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(cx, cy, R, R * squash, 0, 0, Math.PI * 2);
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

    let a4 = ss(p0, 0.935, 0.98);
    /* Once the flight is running the CTA clears out of its way. */
    if (floodT0) a4 *= 1 - ss((performance.now() - floodT0) / 1700, 0.02, 0.24);
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
    plateFlight(g);
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
      const dt = Math.min(0.4, Math.max(0.001, (now - (tPrev || now)) / 1000));
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
  buildPlates();
  /* Newsreader may not have arrived when the plates were first drawn, so redraw
     them once it has. They exist from the start either way, so an early click is
     never left without sheets. */
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => buildPlates()).catch(() => {});
  }

  const onScroll = () => {
    if (reduced) {
      /* Reduced motion: one static frame at the current scroll position, redrawn
         on scroll, and no animation loop is ever started. */
      drawNow(true);
      return;
    }
    drawNow();
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

  /* requestAnimationFrame can be throttled to nothing in a backgrounded or
     offscreen frame, which leaves the intro stuck on one faint frame. A timer
     draws as well, so the sequence always advances and always recovers; the
     damping integrates real elapsed time, so sparse frames catch up.

     It must still not run under reduced motion — waking it there would start the
     very loop the spec forbids. (The prototype restarted the loop this way.) */
  const heartbeat = reduced
    ? 0
    : window.setInterval(() => {
        if (!alive) return;
        if (performance.now() - lastDraw > 180) {
          try {
            drawNow();
          } catch (e) {
            console.error('intro frame', e);
          }
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(tick);
        }
      }, 200);

  window.__dsirIntroCancel = () => {
    alive = false;
    cancelAnimationFrame(raf);
    if (heartbeat) clearInterval(heartbeat);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerleave', onLeave);
  };

  /* The CTA is a real <a href>, so with JS off it simply navigates. Here it fires
     the flight first and lets plateFlight do the navigating when the flood ends.
     Under reduced motion we leave the default action alone — no flight, no loop. */
  document.querySelectorAll<HTMLAnchorElement>('[data-intro-enter]').forEach((el) => {
    el.addEventListener('click', (e) => {
      onEnter?.();
      if (reduced) return;
      if (floodT0) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      floodT0 = performance.now();
      const cta = q('enter');
      if (cta) cta.style.transition = 'opacity 420ms cubic-bezier(.2,0,0,1)';
    });
  });

  if (reduced) drawNow(true);
  else tick();
}
