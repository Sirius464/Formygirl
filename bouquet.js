/*
 * ASCII Lily Bouquet
 *
 * The bouquet is drawn as ordinary vector shapes onto a tiny offscreen canvas
 * where one pixel = one character cell. Each frame that canvas is turned into
 * text: a WebGL shader picks a glyph per cell from its brightness and tints it
 * with the cell's colour (with a Canvas 2D fallback if WebGL is unavailable).
 *
 * Timeline (seconds):
 *   0.0 - 1.0  stems grow from the base
 *   0.3 - 1.4  leaves unfurl
 *   1.0 - 2.2  buds appear and swell, turning from green to their colour
 *   2.1 - 3.9  lilies bloom
 *   3.4 - 4.2  stars fade in, then twinkle forever
 *
 * Click / tap / space / R replays the animation.
 * Add ?t=2.5 to the URL to freeze the animation at a given time.
 */
(() => {
  'use strict';

  // ------------------------------------------------------------------ utils
  const D2R = Math.PI / 180;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const easeOut = (t, p = 3) => 1 - Math.pow(1 - clamp(t), p);
  const easeInOut = (t) => {
    t = clamp(t);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const shade = (c, k) => (k >= 0 ? mix(c, [255, 255, 255], k) : mix(c, [0, 0, 0], -k));
  const rgb = (c, a = 1) =>
    a >= 1
      ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
      : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
  const rng = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ------------------------------------------------------------- the scene
  // Everything is laid out in "design units": the bouquet spans roughly
  // x 170..560 and y 50..610, and is centred on (365, 330).
  const DESIGN = { cx: 365, cy: 330, w: 400, h: 566 };
  const BASE_Y = 606;
  const GREEN_BUD = [96, 138, 56];

  // Flowers, listed back to front.
  //  x,y      centre of the bloom (stems end here)
  //  R        petal length when fully open (0 = stays a bud)
  //  rot      angle of the first petal, tilt/tiltAng = perspective squash
  //  col      petal colour, throat = colour near the centre
  //  bud      [half length, half width] of the bud, budAng = its direction
  //  start    time when it starts to open
  const FLOWERS = [
    { x: 333, y: 76, R: 0, bud: [19, 8], budAng: -96, budCol: [118, 136, 62] },
    { x: 430, y: 68, R: 0, bud: [19, 8], budAng: -80, budCol: [180, 44, 72] },
    { x: 377, y: 104, R: 70, rot: -92, tilt: 0.78, tiltAng: 0, col: [208, 152, 130], throat: [150, 82, 60],
      budCol: [118, 114, 80], bud: [22, 10], budAng: -86, start: 2.62 },
    { x: 216, y: 194, R: 50, rot: -124, tilt: 0.75, tiltAng: 25, col: [204, 122, 62], throat: [130, 58, 24],
      budCol: [186, 100, 56], bud: [17, 8], budAng: -128, start: 2.72 },
    { x: 516, y: 200, R: 48, rot: -58, tilt: 0.75, tiltAng: -25, col: [216, 172, 56], throat: [150, 100, 22],
      budCol: [150, 150, 70], bud: [18, 8], budAng: -55, start: 2.7 },
    { x: 264, y: 158, R: 76, rot: -104, tilt: 0.86, tiltAng: 30, col: [230, 220, 204], throat: [178, 166, 104],
      speck: [120, 70, 50], pollenCol: [196, 150, 70], budCol: [128, 124, 86], bud: [26, 14], budAng: -110, start: 2.5 },
    { x: 466, y: 156, R: 74, rot: -78, tilt: 0.84, tiltAng: -30, col: [224, 188, 58], throat: [162, 110, 24],
      budCol: [132, 132, 70], bud: [26, 14], budAng: -70, start: 2.5 },
    { x: 503, y: 270, R: 72, rot: -20, tilt: 0.9, tiltAng: 10, col: [194, 64, 114], throat: [118, 20, 56],
      stamen: [244, 194, 64], stamLen: 1.3, budCol: [172, 62, 74], bud: [34, 24], budAng: -10, start: 2.24 },
    { x: 226, y: 264, R: 78, rot: -160, tilt: 0.9, tiltAng: -10, col: [232, 178, 48], throat: [170, 100, 22],
      budCol: [172, 92, 50], bud: [36, 22], budAng: -172, start: 2.26 },
    { x: 500, y: 456, R: 76, rot: 12, tilt: 0.88, tiltAng: 20, col: [132, 14, 22], throat: [70, 4, 10],
      stamen: [250, 204, 64], stamLen: 1.55, budCol: [200, 110, 44], bud: [32, 20], budAng: 4, start: 2.55 },
    { x: 220, y: 440, R: 76, rot: 172, tilt: 0.84, tiltAng: 70, col: [232, 196, 48], throat: [170, 118, 22],
      budCol: [194, 142, 52], bud: [34, 20], budAng: 186, start: 2.55 },
    { x: 436, y: 336, R: 120, rot: -74, tilt: 0.96, tiltAng: 0, col: [232, 228, 222], throat: [186, 182, 110],
      speck: [130, 110, 70], pollenCol: [190, 176, 72], budCol: [194, 164, 154], bud: [42, 34], budAng: -90, start: 2.16 },
    { x: 357, y: 200, R: 116, rot: -101, tilt: 0.94, tiltAng: 0, col: [224, 40, 44], throat: [122, 10, 18],
      pollenCol: [236, 172, 52], budCol: [142, 30, 42], bud: [34, 36], budAng: -90, start: 2.1 },
    { x: 296, y: 332, R: 108, rot: -82, tilt: 0.95, tiltAng: 0, col: [216, 80, 200], throat: [124, 24, 96],
      budCol: [152, 40, 84], bud: [40, 36], budAng: -90, start: 2.14 },
    { x: 361, y: 436, R: 112, rot: -91, tilt: 0.96, tiltAng: 0, col: [236, 188, 158], throat: [196, 104, 60],
      speck: [150, 70, 40], budCol: [152, 62, 42], bud: [34, 34], budAng: -90, start: 2.2 },
  ];

  // Leaves: base x,y -> tip x,y, half width, curl (bend of the midrib).
  const LEAVES = [
    // long arching leaves at the foot of the bouquet
    [342, 600, 222, 590, 11, -0.2],
    [332, 562, 210, 506, 12, 0.16],
    [338, 532, 214, 482, 12, 0.12],
    [392, 602, 502, 592, 10, 0.2],
    [404, 568, 524, 540, 11, -0.16],
    [398, 534, 502, 486, 12, -0.12],
    [352, 548, 300, 468, 9, 0.12],
    [380, 552, 432, 478, 9, -0.12],
    [360, 584, 326, 500, 8, 0.06],
    [372, 592, 412, 504, 8, -0.06],
    [346, 604, 286, 560, 7, 0.1],
    [386, 604, 452, 566, 7, -0.1],
    // leaves along the stems
    [300, 462, 260, 440, 8, -0.12],
    [456, 472, 494, 450, 8, 0.12],
    [372, 452, 402, 416, 8, 0.12],
    [292, 404, 228, 388, 9, 0.14],
    [430, 406, 490, 378, 9, -0.12],
    [312, 368, 272, 336, 9, -0.12],
    [426, 354, 474, 312, 9, 0.12],
    [346, 302, 304, 266, 10, 0.16],
    [438, 298, 404, 250, 10, -0.14],
    [372, 260, 402, 220, 8, -0.12],
    [288, 248, 262, 214, 6, 0.12],
    [470, 236, 492, 206, 6, -0.12],
    [333, 96, 321, 80, 3, 0.25],
    [338, 102, 348, 86, 3, -0.25],
  ];

  const LEAF_LIGHT = [200, 232, 150];
  const LEAF_DARK = [86, 178, 48];
  const STEM = [128, 210, 66];

  // Pre-compute per-flower geometry (petal angles, speckles, stamens, stem).
  function buildScene() {
    FLOWERS.forEach((f, i) => {
      const r = rng(1013 + i * 7919);
      f.phase = r() * Math.PI * 2;
      f.delay = r() * 0.08;
      // stem from the base of the bouquet to the flower centre
      const bx = DESIGN.cx + (f.x - DESIGN.cx) * 0.3 + (r() - 0.5) * 16;
      const by = BASE_Y + (r() - 0.5) * 6;
      f.stem = {
        b: [bx, by],
        c: [lerp(bx, f.x, 0.5) + (f.x - DESIGN.cx) * 0.14 + (r() - 0.5) * 16, lerp(by, f.y, 0.55)],
      };
      if (!f.R) return;
      f.tilt = f.tilt || 1;
      f.tiltAng = f.tiltAng || 0;
      f.speck = f.speck || shade(f.throat, -0.35);
      f.stamen = f.stamen || [206, 108, 32];
      f.petals = [];
      for (let k = 0; k < 6; k++) {
        const inner = k % 2 === 1;
        const p = {
          ang: (f.rot + k * 60 + (r() - 0.5) * 22) * D2R,
          len: 1 + (r() - 0.5) * 0.28 - (inner ? 0.05 : 0),
          w: (inner ? 0.25 : 0.21) * (1 + (r() - 0.5) * 0.2),
          bend: (r() < 0.5 ? -1 : 1) * (0.05 + r() * 0.12),
          specks: [],
        };
        const n = 8 + ((r() * 7) | 0);
        for (let s = 0; s < n; s++) {
          const u = 0.1 + r() * 0.42;
          p.specks.push({ u, v: (r() - 0.5) * 1.3 * Math.sin(Math.PI * Math.min(1, u * 1.6)), sz: 1.6 + r() * 1.4 });
        }
        f.petals.push(p);
      }
      f.stamens = [];
      for (let k = 0; k < 6; k++) {
        f.stamens.push({
          ang: (f.rot + 30 + k * 60 + (r() - 0.5) * 24) * D2R,
          len: (0.42 + r() * 0.2) * (f.stamLen || 1),
          curve: (r() - 0.5) * 0.2,
        });
      }
      f.pollen = [];
      for (let k = 0; k < 16; k++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 0.34;
        f.pollen.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, sz: 1.8 + r() * 1.6 });
      }
      f.pistil = { ang: (f.rot + 15 + (r() - 0.5) * 40) * D2R, len: 0.48 };
    });

    LEAVES.forEach((l, i) => {
      // lower leaves unfurl first, as the stems pass them
      l.appear = 0.2 + ((BASE_Y - l[1]) / (BASE_Y - 60)) * 0.55 + rng(31 + i)() * 0.08;
    });
  }

  // ------------------------------------------------------- scene drawing
  const quad = (p0, p1, p2, t) => {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  };

  function flowerPos(f, t) {
    const sw = smooth(3.6, 5.5, t);
    if (sw <= 0) return [f.x, f.y, 0];
    return [
      f.x + Math.sin(t * 0.7 + f.phase) * 1.4 * sw,
      f.y + Math.cos(t * 0.55 + f.phase * 1.3) * 0.8 * sw,
      Math.sin(t * 0.5 + f.phase) * 1.2 * D2R * sw,
    ];
  }

  function drawStem(ctx, f, t) {
    const g = easeOut((t - f.delay) / 1.0, 2.5);
    if (g <= 0) return;
    const [x, y] = flowerPos(f, t);
    const tip = [x, y];
    const steps = 28;
    ctx.beginPath();
    ctx.moveTo(f.stem.b[0], f.stem.b[1]);
    for (let i = 1; i <= steps; i++) {
      const p = quad(f.stem.b, f.stem.c, tip, (i / steps) * g);
      ctx.lineTo(p[0], p[1]);
    }
    ctx.strokeStyle = rgb(STEM);
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function drawLeaf(ctx, l, t) {
    const g = easeOut((t - l.appear) / 0.5, 2.2);
    if (g <= 0) return;
    const [bx, by, tx0, ty0, hw, curl] = l;
    const tx = lerp(bx, tx0, g);
    const ty = lerp(by, ty0, g);
    const dx = tx - bx;
    const dy = ty - by;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const mx = (bx + tx) / 2 + nx * curl * len;
    const my = (by + ty) / 2 + ny * curl * len;
    const w = hw * 2.4 * g;
    // light half
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(mx + nx * w, my + ny * w, tx, ty);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.fillStyle = rgb(LEAF_LIGHT);
    ctx.fill();
    // dark half
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(mx - nx * w, my - ny * w, tx, ty);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.fillStyle = rgb(LEAF_DARK);
    ctx.fill();
  }

  function budShape(ctx, a, w) {
    // teardrop pointing along +x, centred on the origin
    ctx.beginPath();
    ctx.moveTo(-a, 0);
    ctx.bezierCurveTo(-a, -w * 1.25, a * 0.35, -w * 1.05, a, 0);
    ctx.bezierCurveTo(a * 0.35, w * 1.05, -a, w * 1.25, -a, 0);
    ctx.closePath();
  }

  function drawBud(ctx, f, t, x, y, scale, alpha) {
    const grow = easeInOut((t - 0.95 - f.delay) / 1.05);
    if (grow <= 0 || alpha <= 0) return;
    const k = lerp(0.22, 1, grow) * scale;
    const a = f.bud[0] * k;
    const w = f.bud[1] * k;
    const c = mix(GREEN_BUD, f.budCol, smooth(1.15, 2.05, t));
    const bright = lerp(0.55, 1, smooth(1.0, 1.9, t));
    const col = mix([0, 0, 0], c, bright);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(f.budAng * D2R);
    const gr = ctx.createRadialGradient(a * 0.15, -w * 0.45, 0, 0, 0, Math.max(a, w) * 1.1);
    gr.addColorStop(0, rgb(shade(col, 0.28)));
    gr.addColorStop(0.55, rgb(col));
    gr.addColorStop(1, rgb(shade(col, -0.45)));
    ctx.fillStyle = gr;
    budShape(ctx, a, w);
    ctx.fill();
    // a faint seam along the bud
    ctx.beginPath();
    ctx.moveTo(-a * 0.7, 0);
    ctx.lineTo(a * 0.85, 0);
    ctx.strokeStyle = rgb(shade(col, -0.4), 0.5);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  function drawPetal(ctx, f, p, len, wr, col, throat, o) {
    const w = len * wr;
    const bend = len * p.bend;
    ctx.save();
    ctx.rotate(p.ang);

    // lanceolate: almost parallel sides, then a sharp, slightly curved tip
    const side = (k) => {
      ctx.bezierCurveTo(len * 0.18, k * w * 1.08, len * 0.48, k * w * 1.06 + bend * 0.4, len * 0.74, k * w * 0.8 + bend * 0.7);
      ctx.quadraticCurveTo(len * 0.9, k * w * 0.38 + bend * 0.9, len, bend);
    };
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(0, -w * 0.55);
      side(-1);
      ctx.quadraticCurveTo(len * 0.9, w * 0.38 + bend * 0.9, len * 0.74, w * 0.8 + bend * 0.7);
      ctx.bezierCurveTo(len * 0.48, w * 1.06 + bend * 0.4, len * 0.18, w * 1.08, 0, w * 0.55);
      ctx.closePath();
    };

    // body: dark throat -> petal colour -> slightly lighter tip
    const gr = ctx.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, rgb(throat));
    gr.addColorStop(0.2, rgb(mix(throat, col, 0.7)));
    gr.addColorStop(0.45, rgb(col));
    gr.addColorStop(1, rgb(shade(col, 0.12)));
    outline();
    ctx.fillStyle = gr;
    ctx.fill();
    // dark rim: keeps overlapping petals readable
    ctx.strokeStyle = rgb(shade(col, -0.6), 0.45);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // one half slightly darker: gives the petal a fold
    ctx.beginPath();
    ctx.moveTo(0, w * 0.55);
    ctx.bezierCurveTo(len * 0.18, w * 1.08, len * 0.48, w * 1.06 + bend * 0.4, len * 0.74, w * 0.8 + bend * 0.7);
    ctx.quadraticCurveTo(len * 0.9, w * 0.38 + bend * 0.9, len, bend);
    ctx.quadraticCurveTo(len * 0.5, bend * 0.3, 0, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fill();

    // crease along the midrib: a soft wide band, then a fine dark line
    ctx.beginPath();
    ctx.moveTo(len * 0.04, 0);
    ctx.quadraticCurveTo(len * 0.5, bend * 0.3, len * 0.92, bend * 0.88);
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgb(shade(col, -0.5), 0.18);
    ctx.lineWidth = w * 0.5;
    ctx.stroke();
    ctx.strokeStyle = rgb(shade(throat, -0.4), 0.85);
    ctx.lineWidth = 3.4;
    ctx.stroke();

    // speckles near the throat
    const sa = smooth(0.35, 0.85, o);
    if (sa > 0) {
      ctx.fillStyle = rgb(f.speck, 0.85 * sa);
      for (const s of p.specks) {
        ctx.fillRect(s.u * len - s.sz / 2, s.v * w - s.sz / 2, s.sz, s.sz);
      }
    }
    ctx.restore();
  }

  function drawLily(ctx, f, t) {
    const [x, y, sway] = flowerPos(f, t);
    const o = clamp((t - f.start) / 1.5);
    if (o <= 0) {
      drawBud(ctx, f, t, x, y, 1, 1);
      return;
    }
    const e = easeOut(o, 1.6);
    const blend = smooth(0.0, 0.8, o);
    const col = mix(f.budCol, f.col, blend);
    const throat = mix(shade(f.budCol, -0.35), f.throat, blend);
    const budLen = Math.max(f.bud[0], f.bud[1]);
    const len = lerp(budLen * 0.8, f.R, e);
    const wr = lerp(1.6, 1, smooth(0, 0.8, o));

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    ctx.rotate(f.tiltAng * D2R);
    ctx.scale(1, f.tilt);
    ctx.rotate(-f.tiltAng * D2R);

    // outer tepals behind, inner ones in front
    for (const k of [0, 2, 4, 1, 3, 5]) {
      const p = f.petals[k];
      drawPetal(ctx, f, p, len * p.len, p.w * wr, col, throat, o);
    }

    // throat glow
    const tg = ctx.createRadialGradient(0, 0, 0, 0, 0, len * 0.3);
    tg.addColorStop(0, rgb(shade(throat, -0.2), 0.85));
    tg.addColorStop(1, rgb(throat, 0));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.arc(0, 0, len * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // stamens + pistil
    const st = smooth(0.45, 0.9, o);
    if (st > 0) {
      ctx.lineCap = 'round';
      for (const s of f.stamens) {
        const L = len * s.len * lerp(0.6, 1, st);
        const ex = Math.cos(s.ang) * L;
        const ey = Math.sin(s.ang) * L;
        const cx = Math.cos(s.ang + s.curve) * L * 0.55;
        const cy = Math.sin(s.ang + s.curve) * L * 0.55;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        ctx.strokeStyle = rgb([214, 206, 140], 0.85 * st);
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(s.ang + Math.PI / 2);
        ctx.fillStyle = rgb(f.stamen, st);
        ctx.beginPath();
        ctx.ellipse(0, 0, 4.4, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const pl = len * f.pistil.len;
      const px = Math.cos(f.pistil.ang) * pl;
      const py = Math.sin(f.pistil.ang) * pl;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(px, py);
      ctx.strokeStyle = rgb([176, 196, 96], 0.85 * st);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = rgb([150, 170, 70], st);
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fill();
      // pollen dusting around the heart of the flower
      ctx.fillStyle = rgb(f.pollenCol || f.stamen, 0.9 * st);
      for (const d of f.pollen) {
        ctx.fillRect(d.x * len - d.sz / 2, d.y * len - d.sz / 2, d.sz, d.sz);
      }
    }
    ctx.restore();

    // the bud melts away as the petals push out
    const ba = 1 - smooth(0.12, 0.55, o);
    if (ba > 0) drawBud(ctx, f, t, x, y, 1 - 0.35 * e, ba);
  }

  // ------------------------------------------------------------ layout
  const RAMP = ' .:-=+*#%@';
  const FONT = '"SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace';
  const canvas = document.getElementById('c');
  const scene = document.createElement('canvas');
  // CPU-backed: the canvas is tiny, and this avoids a GPU readback every frame
  // when it is uploaded as a texture (or read with getImageData).
  const sctx = scene.getContext('2d', { willReadFrequently: true });

  const L = {}; // layout: dpr, vw, vh, s, cellW, cellH, fontPx, cols, rows, sx, sy, ox, oy
  let supersample = true; // render at >= 2x for smoother tiny glyphs; dropped on slow devices
  let stars = [];

  function measureCell() {
    const m = document.createElement('canvas').getContext('2d');
    m.font = `bold ${L.fontPx}px ${FONT}`;
    return Math.max(3, Math.round(m.measureText('M').width));
  }

  function layout() {
    L.dpr = supersample ? Math.min(Math.max(window.devicePixelRatio || 1, 2), 3) : Math.min(window.devicePixelRatio || 1, 2);
    L.vw = window.innerWidth;
    L.vh = window.innerHeight;
    // fit the bouquet: ~90% of the height, never wider than the screen
    L.s = Math.min((L.vh * 0.92) / DESIGN.h, (L.vw * 0.94) / DESIGN.w);
    const bouquetPx = DESIGN.h * L.s;
    // roughly 140 rows of text across the bouquet, like the original
    const cellCss = Math.max(bouquetPx / 140, 4);
    L.cellH = Math.max(6, Math.round(cellCss * L.dpr));
    L.fontPx = Math.max(5, Math.round(L.cellH / 0.98));
    L.cellW = measureCell();
    L.W = Math.round(L.vw * L.dpr);
    L.H = Math.round(L.vh * L.dpr);
    L.cols = Math.ceil(L.W / L.cellW);
    L.rows = Math.ceil(L.H / L.cellH);
    scene.width = L.cols;
    scene.height = L.rows;
    canvas.width = L.W;
    canvas.height = L.H;
    L.sx = (L.s * L.dpr) / L.cellW;
    L.sy = (L.s * L.dpr) / L.cellH;
    L.ox = ((L.vw / 2 - DESIGN.cx * L.s) * L.dpr) / L.cellW;
    L.oy = ((L.vh / 2 - DESIGN.cy * L.s) * L.dpr) / L.cellH;

    const r = rng(4242);
    const n = Math.round((L.cols * L.rows) / 240);
    stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: (r() * L.cols) | 0,
        y: (r() * L.rows) | 0,
        b: 0.4 + Math.pow(r(), 2) * 0.6,
        sp: 0.8 + r() * 2.6,
        ph: r() * Math.PI * 2,
        on: 3.4 + r() * 0.7,
      });
    }
    renderer.resize();
  }

  function drawScene(t) {
    const ctx = sctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, L.cols, L.rows);

    // stars
    for (const s of stars) {
      const a = smooth(s.on, s.on + 0.5, t);
      if (a <= 0) continue;
      const tw = 0.6 + 0.4 * Math.sin(t * s.sp + s.ph);
      ctx.fillStyle = `rgba(236,238,245,${(s.b * tw * a).toFixed(3)})`;
      ctx.fillRect(s.x, s.y, 1, 1);
    }

    ctx.setTransform(L.sx, 0, 0, L.sy, L.ox, L.oy);
    for (const f of FLOWERS) drawStem(ctx, f, t);
    for (const l of LEAVES) drawLeaf(ctx, l, t);
    for (const f of FLOWERS) {
      if (f.R) drawLily(ctx, f, t);
      else {
        const [x, y] = flowerPos(f, t);
        drawBud(ctx, f, t, x, y, 1, 1);
      }
    }
  }

  // ---------------------------------------------------- WebGL renderer
  function makeAtlas() {
    const a = document.createElement('canvas');
    a.width = L.cellW * RAMP.length;
    a.height = L.cellH;
    const x = a.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, a.width, a.height);
    x.fillStyle = '#fff';
    x.font = `bold ${L.fontPx}px ${FONT}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (let i = 0; i < RAMP.length; i++) {
      x.fillText(RAMP[i], i * L.cellW + L.cellW / 2, L.cellH / 2 + L.fontPx * 0.04);
    }
    return a;
  }

  function glRenderer() {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false });
    if (!gl) return null;
    const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const FS = `precision highp float;
uniform sampler2D uScene;uniform sampler2D uAtlas;
uniform vec2 uGrid;uniform vec2 uCell;uniform vec2 uRes;uniform float uN;uniform float uTime;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec2 px=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  vec2 cell=floor(px/uCell);
  vec4 s=texture2D(uScene,(cell+.5)/uGrid);
  if(s.a<.06){gl_FragColor=vec4(0.,0.,0.,1.);return;}
  vec3 c=s.rgb;
  float m=max(c.r,max(c.g,c.b));
  float d=s.a*mix(.62,1.,sqrt(m));
  vec2 f=(px-cell*uCell)/uCell;
  float hs=hash(cell*1.37+11.);
  float j=(hs-.5)*.8+(hash(cell+floor(uTime*7.)*vec2(17.,31.))-.5)*.5;
  float idx=clamp(floor(.3+pow(d,.8)*(uN-1.)+j),1.,uN-1.);
  float a=texture2D(uAtlas,vec2((idx+f.x)/uN,f.y)).r;
  vec3 col=min(c*min(1.38,1./max(m,.001))*(.9+.2*hash(cell*.71+3.)),vec3(1.));
  gl_FragColor=vec4(col*(a+.09*s.a),1.);
}`;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = (unit) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const sceneTex = tex(0);
    const atlasTex = tex(1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const u = (n) => gl.getUniformLocation(prog, n);
    const uGrid = u('uGrid');
    const uCell = u('uCell');
    const uRes = u('uRes');
    const uN = u('uN');
    const uTime = u('uTime');
    gl.uniform1i(u('uScene'), 0);
    gl.uniform1i(u('uAtlas'), 1);

    return {
      resize() {
        gl.viewport(0, 0, L.W, L.H);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeAtlas());
        gl.uniform2f(uGrid, L.cols, L.rows);
        gl.uniform2f(uCell, L.cellW, L.cellH);
        gl.uniform2f(uRes, L.W, L.H);
        gl.uniform1f(uN, RAMP.length);
      },
      draw(t) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
        gl.uniform1f(uTime, t);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }

  // ----------------------------------------------- Canvas 2D fallback
  function canvasRenderer() {
    const ctx = canvas.getContext('2d');
    return {
      resize() {},
      draw(t) {
        const data = sctx.getImageData(0, 0, L.cols, L.rows).data;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, L.W, L.H);
        ctx.font = `bold ${L.fontPx}px ${FONT}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        const tick = Math.floor(t * 9);
        const groups = new Map();
        for (let y = 0, i = 0; y < L.rows; y++) {
          for (let x = 0; x < L.cols; x++, i += 4) {
            const al = data[i + 3] / 255;
            if (al < 0.06) continue;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const m = Math.max(r, g, b) / 255;
            const d = al * (0.62 + 0.38 * Math.sqrt(m));
            const h = Math.sin((x + tick * 17) * 12.9898 + (y + tick * 31) * 78.233) * 43758.5453;
            const j = (h - Math.floor(h) - 0.5) * 1.2;
            const idx = Math.max(1, Math.min(RAMP.length - 1, Math.floor(0.3 + Math.pow(d, 0.8) * (RAMP.length - 1) + j)));
            const gain = Math.min(1.38, 1 / Math.max(m, 0.001));
            const key = ((Math.min(255, r * gain) >> 3) << 10) | ((Math.min(255, g * gain) >> 3) << 5) | (Math.min(255, b * gain) >> 3);
            let list = groups.get(key);
            if (!list) groups.set(key, (list = []));
            list.push(x, y, idx);
          }
        }
        for (const [key, list] of groups) {
          ctx.fillStyle = `rgb(${((key >> 10) & 31) << 3},${((key >> 5) & 31) << 3},${(key & 31) << 3})`;
          for (let k = 0; k < list.length; k += 3) {
            ctx.fillText(RAMP[list[k + 2]], (list[k] + 0.5) * L.cellW, (list[k + 1] + 0.5) * L.cellH);
          }
        }
      },
    };
  }

  // ------------------------------------------------------------- main
  buildScene();
  let renderer = null;
  try {
    renderer = glRenderer();
  } catch (err) {
    console.warn('WebGL unavailable, falling back to canvas 2D', err);
    renderer = null;
  }
  if (!renderer) renderer = canvasRenderer();
  layout();

  const params = new URLSearchParams(location.search);
  const frozen = params.has('t') ? parseFloat(params.get('t')) || 0 : null;
  const speed = parseFloat(params.get('speed')) || 1;
  let start = performance.now();

  const restart = () => {
    start = performance.now();
  };
  canvas.addEventListener('click', restart);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      restart();
    }
  });
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(layout);
  });

  // If the device struggles (no GPU acceleration...), render fewer pixels.
  const deltas = [];
  let last = 0;
  function watchSpeed(now) {
    if (!supersample) return;
    if (last) deltas.push(now - last);
    last = now;
    if (deltas.length < 90) return;
    const sorted = deltas.slice(20).sort((a, b) => a - b);
    deltas.length = 0;
    if (sorted[sorted.length >> 1] > 28 && L.dpr > (window.devicePixelRatio || 1)) {
      supersample = false;
      layout();
    }
  }

  function frame(now) {
    const t = frozen !== null ? frozen : ((now - start) / 1000) * speed;
    drawScene(t);
    renderer.draw(t);
    watchSpeed(now);
    window.__bouquetReady = true;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
