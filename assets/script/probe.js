(function () {
  "use strict";

  const grid = document.getElementById("probeGrid");
  if (!grid) return;

  const CELL_PX = 80;
  const CELL_PX_WIDE = 168;
  const WIDE_FROM = 641;
  const FILL_TO_ADVANCE = 14;
  const FILL_RATIO_WIDE = 0.4;
  const ADVANCE_DELAY_MS = 450;
  const ADVANCE_SCROLL_S = 1.4;
  const ADVANCE_RETRY_MS = 500;
  const DEMO_IDLE_MS = 4500;
  const DEMO_STEP_MS = 140;
  const DEMO_HOLD_MS = 400;
  const DEMO_OUT_MS = 240;
  const DEMO_RESUME_MS = 800;
  const DEMO_BRIM_MS = 250;
  const DEMO_WORDS = [
    "슈퍼라이센스",
    "컨스트럭터",
    "드라이브스루",
    "오스카",
    "피아스트리81",
    "아르비드린드",
    "블라드",
    "포뮬러원",
    "월드챔피언",
  ];
  const GLYPH_CYCLE_MS = 3000;
  const GLYPH_RESUME_MS = 3000;
  const INTRO_MS = 3400;
  const INTRO_OUT_MS = 300;
  const INTRO_WAIT_MAX_MS = 2000;
  const INTRO_WAIT_RETURNING_MS = 250;
  const INTRO_SEEN_KEY = "apex-intro-seen";
  const CLOTH_FADE_MS = 160;
  const CLOTH_CALM_MS = 2400;
  const CLOTH_GUST_S = 0.8;

  const CLOTH_SMOOTH = 4;
  const CLOTH_DAMP = 0.5;
  const CLOTH_PULL = 0.1;
  const CLOTH_PAD = 2;
  const CLOTH_PASSES = 1;

  const CLOTH_TUNE = {
    wide:   { WIND: 2, WAVE: 0.85, SPEED: 0.55, SKEW: 3.5, ANCHOR: 0.75, ZOOM: 1.03, GUST: 2 },
    narrow: { WIND: 3.2, WAVE: 0.55, SPEED: 0.65, SKEW: 2.6, ANCHOR: 0.55, ZOOM: 1.1, GUST: 4 },
  };
  let CLOTH_WIND, CLOTH_WAVE, CLOTH_SPEED, CLOTH_SKEW, CLOTH_ANCHOR, CLOTH_ZOOM, CLOTH_GUST;

  function tuneCloth() {
    const t = CLOTH_TUNE[window.innerWidth >= WIDE_FROM ? "wide" : "narrow"];
    CLOTH_WIND = t.WIND;
    CLOTH_WAVE = t.WAVE;
    CLOTH_SPEED = t.SPEED;
    CLOTH_SKEW = t.SKEW;
    CLOTH_ANCHOR = t.ANCHOR;
    CLOTH_ZOOM = t.ZOOM;
    CLOTH_GUST = t.GUST;
  }
  tuneCloth();

  const cellTarget = () => (window.innerWidth >= WIDE_FROM ? CELL_PX_WIDE : CELL_PX);

  let filled = 0;
  let needed = FILL_TO_ADVANCE;

  const hint = document.querySelector(".probe__hint");
  const meter = document.querySelector(".probe__meter");
  let advanced = false;
  let advanceTimer = 0;
  let past = false;

  const geo = { w: 0, h: 0, cols: 0, rows: 0, cell: 0, row: 0, top: 0 };

  function layout() {
    const w = grid.clientWidth || window.innerWidth;
    const h = grid.clientHeight || window.innerHeight;
    const cols = Math.max(3, Math.round(w / cellTarget()));
    const cell = w / cols;
    const rows = Math.max(1, Math.floor(h / cell));
    const row = window.innerWidth >= WIDE_FROM ? cell : h / rows;

    grid.style.setProperty("--probe-cols", String(cols));
    grid.style.setProperty("--probe-cell", cell + "px");
    grid.style.setProperty("--probe-row", row + "px");

    geo.w = w;
    geo.h = h;
    geo.cols = cols;
    geo.rows = rows;
    geo.cell = cell;
    geo.row = row;
    geo.top = (h - rows * row) / 2;
    grid.style.setProperty("--probe-pad", `${Math.max(0, geo.top)}px`);

    const want = cols * rows;
    const cells = grid.children;
    for (let i = cells.length; i < want; i++) grid.appendChild(makeCell());
    while (grid.children.length > want) grid.lastElementChild.remove();

    for (let i = 0; i < grid.children.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      grid.children[i].classList.toggle("is-alt", (r + c) % 2 === 1);
    }

    needed =
      window.innerWidth >= WIDE_FROM
        ? Math.max(FILL_TO_ADVANCE, Math.round(grid.children.length * FILL_RATIO_WIDE))
        : FILL_TO_ADVANCE;
    updateMeter();

    if (onClothResize) onClothResize();
  }

  function makeCell() {
    const cell = document.createElement("div");
    cell.className = "probe__cell";
    cell.appendChild(document.createElement("span"));
    return cell;
  }

  let cursor = 0;
  function reveal(cell) {
    if (!cell) return;
    demo.pause();
    if (cell.classList.contains("is-on")) return;
    const text = sequence();
    const ch = text[cursor % text.length];
    cursor++;
    cell.classList.add("is-on");
    const span = cell.querySelector("span");
    if (span) span.textContent = ch;
    filled++;

    if (hint) hint.classList.add("is-hidden");
    updateMeter();
    if (filled >= needed) scheduleAdvance();
  }

  function updateMeter() {
    if (!meter || past) return;
    meter.classList.remove("is-waiting", "is-reset");
    meter.style.setProperty("--probe-fill", String(Math.min(1, filled / needed)));
  }

  const PROBE_TEXT =
    "슈퍼라이센스컨스트럭터드라이브스루오스카피아스트리81아르비드린드블라드" +
    "포뮬러원월드챔피언십 그랑프리모터레이싱 파워유닛 퀄리파잉프랙티스더레이스더티에어";

  let seq = null;
  function sequence() {
    if (seq && seq.length) return seq;
    seq = PROBE_TEXT.replace(/\s+/g, "").split("");
    return seq;
  }

  function scheduleAdvance() {
    if (advanced || advanceTimer || past) return;
    grid.classList.add("is-locked");
    advanceTimer = window.setTimeout(advance, ADVANCE_DELAY_MS);
  }

  function advance() {
    advanced = true;
    const track = document.querySelector(".main-screen-track");
    const stack = document.getElementById("slide-stack");
    if (track) {
      goTo(track.getBoundingClientRect().bottom + window.scrollY);
    } else if (stack) {
      goTo(stack.getBoundingClientRect().top + window.scrollY);
    }
    window.setTimeout(markPast, ADVANCE_SCROLL_S * 1000 + 200);
  }

  function markPast() {
    if (past) return;
    past = true;
    document.body.classList.add("probe-past");
    grid.classList.remove("is-locked");
  }

  function goTo(y) {
    const before = window.scrollY;
    if (typeof scrollPageTo === "function") {
      scrollPageTo(y, { duration: ADVANCE_SCROLL_S, lock: true, force: true });
    } else {
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    window.setTimeout(() => {
      if (Math.abs(window.scrollY - before) > 8) return;
      window.scrollTo({ top: y, behavior: "smooth" });
    }, ADVANCE_RETRY_MS);
  }

  const nudge = () => demo.pause();
  grid.addEventListener("pointermove", nudge, { passive: true });
  grid.addEventListener("pointerdown", nudge, { passive: true });
  grid.addEventListener("touchstart", nudge, { passive: true });

  grid.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const cell = e.target.closest && e.target.closest(".probe__cell");
    if (cell) reveal(cell);
  });

  grid.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const cell = el && el.closest ? el.closest(".probe__cell") : null;
      if (cell && grid.contains(cell)) reveal(cell);
    },
    { passive: true }
  );

  grid.addEventListener("click", (e) => {
    const cell = e.target.closest && e.target.closest(".probe__cell");
    if (cell) reveal(cell);
  });

  function initDemo() {
    let timers = [];
    let shown = [];

    const clearTimers = () => {
      for (const t of timers) window.clearTimeout(t);
      timers = [];
    };

    function clean() {
      clearTimers();
      for (const c of shown) c.classList.remove("is-demo", "is-demo-out");
      shown = [];
    }

    function pause() {
      if (past || advanced) return;
      const cells = shown;
      clearTimers();
      shown = [];
      meterOff();
      meterZero();
      meterCountdown(DEMO_RESUME_MS - DEMO_BRIM_MS);
      timers.push(window.setTimeout(play, DEMO_RESUME_MS));
      if (!cells.length) return;
      const left = cells.filter((c) => !c.classList.contains("is-demo-out"));
      left.forEach((cell, i) => {
        window.setTimeout(() => cell.classList.add("is-demo-out"), i * DEMO_STEP_MS);
      });
      window.setTimeout(() => {
        for (const c of cells) c.classList.remove("is-demo", "is-demo-out");
      }, Math.max(0, left.length - 1) * DEMO_STEP_MS + DEMO_OUT_MS);
    }

    function meterZero() {
      if (!meter || past || filled > 0) return;
      meter.classList.remove("is-waiting");
      meter.classList.add("is-reset");
      meter.style.setProperty("--probe-fill", "0");
    }

    function meterOff() {
      if (meter) meter.classList.remove("is-waiting", "is-reset");
    }

    function meterCountdown(ms) {
      if (!meter || past || filled > 0) return;
      meter.classList.remove("is-reset");
      meter.style.setProperty("--probe-wait", `${ms}ms`);
      meter.classList.add("is-waiting");
      meter.style.setProperty("--probe-fill", "1");
    }

    function rearm() {
      if (past || advanced || filled > 0) return;
      clean();
      meterCountdown(DEMO_IDLE_MS - DEMO_BRIM_MS);
      timers.push(window.setTimeout(play, DEMO_IDLE_MS));
    }

    const DEMO_DIRS = [
      [1, 0], [0, 1], [1, 1], [-1, 1],
    ];

    const DEMO_LEG_MIN = 2;
    const DEMO_LEG_MAX = 3;

    const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

    function pickBent(word, cols, rows) {
      for (let attempt = 0; attempt < 24; attempt++) {
        let c = rand(Math.floor(cols / 4), Math.max(Math.floor(cols / 4), Math.ceil((cols * 3) / 4) - 1));
        let r = rand(0, Math.max(0, Math.floor(rows / 2)));
        let horiz = Math.random() < 0.5;
        let dc = horiz ? (Math.random() < 0.5 ? 1 : -1) : 0;
        let dr = horiz ? 0 : 1;
        let leg = rand(DEMO_LEG_MIN, DEMO_LEG_MAX);

        const used = new Set();
        const out = [];
        for (let i = 0; i < word.length; i++) {
          if (c < 0 || c >= cols || r < 0 || r >= rows) break;
          const at = r * cols + c;
          if (used.has(at)) break;
          const cell = grid.children[at];
          if (!cell || cell.classList.contains("is-on")) break;
          used.add(at);
          out.push(cell);
          if (out.length === word.length) break;
          if (--leg === 0) {
            horiz = !horiz;
            dc = horiz ? (Math.random() < 0.5 ? 1 : -1) : 0;
            dr = horiz ? 0 : 1;
            leg = rand(DEMO_LEG_MIN, DEMO_LEG_MAX);
          }
          c += dc;
          r += dr;
        }
        if (out.length === word.length) return out;
      }
      return [];
    }

    function pick(word) {
      const cols = Number(grid.style.getPropertyValue("--probe-cols")) || 0;
      const total = grid.children.length;
      const rows = cols ? Math.floor(total / cols) : 0;
      if (!cols || rows < 1) return [];

      if (window.innerWidth < WIDE_FROM) return pickBent(word, cols, rows);

      const span = word.length - 1;
      const fit = (n, d) => [Math.max(0, -span * d), Math.min(n - 1, n - 1 - span * d)];

      const fits = DEMO_DIRS.filter(([dc, dr]) => {
        const [c0, c1] = fit(cols, dc);
        const [r0, r1] = fit(rows, dr);
        return c1 >= c0 && r1 >= r0;
      });
      if (!fits.length) return [];
      const [dc, dr] = fits[Math.floor(Math.random() * fits.length)];

      const [cFit0, cFit1] = fit(cols, dc);
      const [rFit0, rFit1] = fit(rows, dr);

      const mid = (lo, hi, f0, f1) => {
        const a = Math.max(lo, f0);
        const b = Math.min(hi, f1);
        return b >= a ? [a, b] : [f0, f1];
      };
      const [c0, c1] = mid(Math.floor(cols / 4), Math.ceil((cols * 3) / 4) - 1, cFit0, cFit1);
      const [r0, r1] = mid(Math.floor(rows / 3), Math.ceil((rows * 2) / 3) - 1, rFit0, rFit1);

      const col = c0 + Math.floor(Math.random() * (c1 - c0 + 1));
      const row = r0 + Math.floor(Math.random() * (r1 - r0 + 1));

      const out = [];
      for (let i = 0; i < word.length; i++) {
        const cell = grid.children[(row + dr * i) * cols + (col + dc * i)];
        if (!cell || cell.classList.contains("is-on")) return [];
        out.push(cell);
      }
      return out;
    }

    let demoAt = 0;

    function play() {
      if (past || advanced || filled > 0) return;
      const word = DEMO_WORDS[demoAt % DEMO_WORDS.length];
      demoAt = (demoAt + 1) % DEMO_WORDS.length;

      const cells = pick(word);
      if (!cells.length) {
        rearm();
        return;
      }
      shown = cells;
      meterZero();

      const step = DEMO_STEP_MS;

      cells.forEach((cell, i) => {
        timers.push(
          window.setTimeout(() => {
            const span = cell.querySelector("span");
            if (span) span.textContent = word[i];
            cell.classList.add("is-demo");
          }, i * step)
        );
      });

      const lit = (cells.length - 1) * step;
      cells.forEach((cell, i) => {
        timers.push(
          window.setTimeout(() => {
            cell.classList.add("is-demo-out");
          }, lit + DEMO_HOLD_MS + i * step)
        );
      });

      const outFrom = lit + DEMO_HOLD_MS;
      const outSpan = lit + DEMO_OUT_MS;

      timers.push(
        window.setTimeout(() => {
          for (const c of cells) c.classList.remove("is-demo", "is-demo-out");
          shown = [];
          rearm();
        }, outFrom + outSpan)
      );
    }

    window.addEventListener("resize", () => rearm());

    return {
      start() {
        if (past) return;
        meterCountdown(DEMO_IDLE_MS - DEMO_BRIM_MS);
        timers.push(window.setTimeout(play, DEMO_IDLE_MS));
      },
      pause,
    };
  }

  const demo = initDemo();

  function initGlyphCycle() {
    const table = document.getElementById("glyphGrid");
    if (!table) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer = 0;
    let wake = 0;
    let paused = false;
    let seen = true;

    const step = () => {
      const cells = table.querySelectorAll(".glyph-cell");
      if (!cells.length || paused) return;
      const active = table.querySelector(".glyph-cell.is-active");
      const at = active ? Array.prototype.indexOf.call(cells, active) : -1;
      cells[(at + 1) % cells.length].click();
    };

    const stop = () => {
      window.clearInterval(timer);
      window.clearTimeout(wake);
      timer = 0;
      wake = 0;
    };

    const arm = () => {
      stop();
      if (paused || !seen) return;
      wake = window.setTimeout(() => {
        timer = window.setInterval(step, GLYPH_CYCLE_MS);
      }, GLYPH_RESUME_MS);
    };

    const hold = () => {
      paused = true;
      stop();
    };
    const release = () => {
      paused = false;
      arm();
    };
    table.addEventListener("pointerenter", hold);
    table.addEventListener("pointerleave", release);
    table.addEventListener("touchstart", hold, { passive: true });
    table.addEventListener("touchend", release, { passive: true });
    table.addEventListener("touchcancel", release, { passive: true });
    table.addEventListener("click", () => {
      if (paused) return;
      arm();
    });

    if (!("IntersectionObserver" in window)) {
      arm();
      return;
    }
    new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          seen = entry.isIntersecting;
          if (seen) arm();
          else stop();
        });
      },
      { threshold: 0.2 }
    ).observe(table);
  }

  const cloth = document.getElementById("probeCloth");

  function runIntro() {
    if (typeof lockPageScroll === "function") lockPageScroll(true, "intro-lock");

    const ctx = cloth && cloth.getContext ? cloth.getContext("2d") : null;
    if (!ctx) {
      endIntro();
      finishIntro();
      return;
    }

    grid.classList.add("is-cloth");

    let CW = 0;
    let RH = 0;
    let px = null;
    let py = null;
    let ox = null;
    let oy = null;
    let rx = null;
    let ry = null;
    let free = null;

    let hx = null;
    let hy = null;
    let vx = null;
    let vy = null;
    let hStride = 0;
    let vStride = 0;
    let dpr = 1;

    function build() {
      tuneCloth();
      CW = geo.cols + CLOTH_PAD * 2;
      RH = geo.rows + CLOTH_PAD * 2;
      const n = (CW + 1) * (RH + 1);
      px = new Float32Array(n);
      py = new Float32Array(n);
      ox = new Float32Array(n);
      oy = new Float32Array(n);
      rx = new Float32Array(n);
      ry = new Float32Array(n);
      free = new Uint8Array(n);
      for (let j = 0; j <= RH; j++) {
        for (let i = 0; i <= CW; i++) {
          const k = j * (CW + 1) + i;
          rx[k] = (i - CLOTH_PAD) * geo.cell;
          ry[k] = geo.top + (j - CLOTH_PAD) * geo.row;
          px[k] = ox[k] = rx[k];
          py[k] = oy[k] = ry[k];
          free[k] = i > 0 && j > 0 && i < CW && j < RH ? 1 : 0;
        }
      }
      hStride = CW * CLOTH_SMOOTH + 1;
      vStride = RH * CLOTH_SMOOTH + 1;
      hx = new Float32Array((RH + 1) * hStride);
      hy = new Float32Array((RH + 1) * hStride);
      vx = new Float32Array((CW + 1) * vStride);
      vy = new Float32Array((CW + 1) * vStride);

      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      cloth.width = Math.round(geo.w * dpr);
      cloth.height = Math.round(geo.h * dpr);
    }

    function wind(t, calm) {
      const TAU = Math.PI * 2;
      const force = ((CLOTH_WIND * geo.cell) / 120) * calm;
      for (let j = 1; j < RH; j++) {
        const v = j / RH;
        for (let i = 1; i < CW; i++) {
          const k = j * (CW + 1) + i;
          const u = i / CW;
          const phase = (u * CLOTH_WAVE - t * CLOTH_SPEED) * TAU + v * CLOTH_SKEW;
          const amp = force * (CLOTH_ANCHOR + (1 - CLOTH_ANCHOR) * u);
          const vx0 = (px[k] - ox[k]) * CLOTH_DAMP;
          const vy0 = (py[k] - oy[k]) * CLOTH_DAMP;
          ox[k] = px[k];
          oy[k] = py[k];
          px[k] += vx0 + Math.sin(phase) * amp * 0.5 + (rx[k] - px[k]) * CLOTH_PULL;
          py[k] += vy0 + Math.cos(phase * 0.85) * amp + (ry[k] - py[k]) * CLOTH_PULL;
        }
      }
    }

    function relax() {
      const W = CW + 1;
      for (let pass = 0; pass < CLOTH_PASSES; pass++) {
        for (let j = 0; j <= RH; j++) {
          for (let i = 0; i <= CW; i++) {
            const k = j * W + i;
            if (i < CW) link(k, k + 1, geo.cell);
            if (j < RH) link(k, k + W, geo.row);
          }
        }
      }
    }

    function link(a, b, len) {
      const fa = free[a];
      const fb = free[b];
      if (!fa && !fb) return;
      const dx = px[b] - px[a];
      const dy = py[b] - py[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const off = (d - len) / d;
      const cx = dx * off;
      const cy = dy * off;
      if (fa && fb) {
        px[a] += cx * 0.5;
        py[a] += cy * 0.5;
        px[b] -= cx * 0.5;
        py[b] -= cy * 0.5;
      } else if (fa) {
        px[a] += cx;
        py[a] += cy;
      } else {
        px[b] -= cx;
        py[b] -= cy;
      }
    }

    function curve(get, count, out, base) {
      for (let a = 0; a < count; a++) {
        const p0 = get(a - 1 < 0 ? 0 : a - 1);
        const p1 = get(a);
        const p2 = get(a + 1 > count ? count : a + 1);
        const p3 = get(a + 2 > count ? count : a + 2);
        for (let s = 0; s < CLOTH_SMOOTH; s++) {
          const t = s / CLOTH_SMOOTH;
          const t2 = t * t;
          const t3 = t2 * t;
          out[base + a * CLOTH_SMOOTH + s] =
            0.5 *
            ((2 * p1) +
              (-p0 + p2) * t +
              (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
              (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        }
      }
      out[base + count * CLOTH_SMOOTH] = get(count);
    }

    function resample() {
      const W = CW + 1;
      for (let j = 0; j <= RH; j++) {
        const base = j * hStride;
        const row = j * W;
        curve((i) => px[row + i], CW, hx, base);
        curve((i) => py[row + i], CW, hy, base);
      }
      for (let i = 0; i <= CW; i++) {
        const base = i * vStride;
        curve((j) => px[j * W + i], RH, vx, base);
        curve((j) => py[j * W + i], RH, vy, base);
      }
    }

    function draw(zoom) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, geo.w, geo.h);
      if (zoom !== 1) {
        ctx.translate(geo.w / 2, geo.h / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-geo.w / 2, -geo.h / 2);
      }
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      for (let r = 0; r < geo.rows; r++) {
        for (let c = 0; c < geo.cols; c++) {
          if ((r + c) % 2 !== 1) continue;
          const i0 = c + CLOTH_PAD;
          const j0 = r + CLOTH_PAD;
          const top = j0 * hStride + i0 * CLOTH_SMOOTH;
          const bot = (j0 + 1) * hStride + i0 * CLOTH_SMOOTH;
          const left = i0 * vStride + j0 * CLOTH_SMOOTH;
          const right = (i0 + 1) * vStride + j0 * CLOTH_SMOOTH;
          ctx.moveTo(hx[top], hy[top]);
          for (let s = 1; s <= CLOTH_SMOOTH; s++) ctx.lineTo(hx[top + s], hy[top + s]);
          for (let s = 1; s <= CLOTH_SMOOTH; s++) ctx.lineTo(vx[right + s], vy[right + s]);
          for (let s = CLOTH_SMOOTH - 1; s >= 0; s--) ctx.lineTo(hx[bot + s], hy[bot + s]);
          for (let s = CLOTH_SMOOTH - 1; s >= 1; s--) ctx.lineTo(vx[left + s], vy[left + s]);
          ctx.closePath();
        }
      }
      ctx.fill();
    }

    build();
    onClothResize = build;

    let t0 = 0;
    let started = false;
    let settleFrom = null;

    function begin() {
      if (started) return;
      started = true;
      t0 = performance.now();
      deadman = window.setTimeout(land, INTRO_MS + INTRO_OUT_MS + 1200);
      window.requestAnimationFrame(frame);
    }

    skipIntro = () => {
      if (settleFrom) return;
      begin();
      t0 = performance.now() - INTRO_MS;
    };

    function frame(now) {
      const age = now - t0;

      if (age < INTRO_MS) {
        const left = INTRO_MS - age;
        const calm = left >= CLOTH_CALM_MS ? 1 : Math.max(0, left / CLOTH_CALM_MS);
        const gust = 1 + (CLOTH_GUST - 1) * Math.exp(-age / (CLOTH_GUST_S * 1000));
        wind(age / 1000, calm * calm * gust);
        relax();
        resample();
        draw(CLOTH_ZOOM);
        window.requestAnimationFrame(frame);
        return;
      }

      if (!settleFrom) {
        settleFrom = { x: px.slice(), y: py.slice() };
        endIntro();
      }
      const t = Math.min(1, (age - INTRO_MS) / INTRO_OUT_MS);
      const e = 1 - Math.pow(1 - t, 3);
      for (let k = 0; k < px.length; k++) {
        px[k] = settleFrom.x[k] + (rx[k] - settleFrom.x[k]) * e;
        py[k] = settleFrom.y[k] + (ry[k] - settleFrom.y[k]) * e;
      }
      resample();
      draw(1 + (CLOTH_ZOOM - 1) * (1 - e));

      if (t < 1) {
        window.requestAnimationFrame(frame);
        return;
      }

      land();
    }

    let landed = false;
    function land() {
      if (landed) return;
      landed = true;
      window.clearTimeout(deadman);
      onClothResize = null;
      skipIntro = null;
      grid.classList.remove("is-cloth");
      if (cloth) cloth.style.opacity = "0";
      window.setTimeout(() => {
        if (cloth) cloth.remove();
        finishIntro();
      }, CLOTH_FADE_MS);
    }

    let deadman = 0;

    document.addEventListener("visibilitychange", () => {
      if (started && !document.hidden && !landed) window.requestAnimationFrame(frame);
    });

    resample();
    draw(CLOTH_ZOOM);

    let returning = false;
    try {
      returning = window.localStorage.getItem(INTRO_SEEN_KEY) === "1";
      window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch (e) {}

    const loaded =
      returning || document.readyState === "complete"
        ? Promise.resolve()
        : new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    const giveUp = new Promise((resolve) =>
      window.setTimeout(resolve, returning ? INTRO_WAIT_RETURNING_MS : INTRO_WAIT_MAX_MS)
    );
    Promise.race([Promise.all([loaded, fontsReady]), giveUp]).then(() => {
      window.requestAnimationFrame(begin);
    });
  }

  let onClothResize = null;

  function endIntro() {
    document.body.classList.remove("probe-intro");
    if (typeof lockPageScroll === "function") lockPageScroll(false, "intro-lock");
  }

  function finishIntro() {
    grid.classList.add("is-live");
    demo.start();
    const run = () => releaseMorph();
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 400 });
    } else {
      window.setTimeout(run, 0);
    }
  }

  function releaseMorph() {
    document.documentElement.removeAttribute("data-morph-defer");
  }

  function watchPast() {
    const target =
      document.querySelector(".main-screen-track") || document.getElementById("main-screen");
    if (!target || !("IntersectionObserver" in window)) return;
    let seen = false;
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          seen = true;
        } else if (seen) {
          markPast();
        }
      });
    }, { threshold: 0 }).observe(target);
  }

  function initPageLine() {
    const line = document.querySelector(".page-line");
    if (!line) return;
    const stack = document.getElementById("slide-stack");
    const tail = document.querySelector(".site-footer__totop");

    let end1 = 1;
    let end2 = 2;
    const measure = () => {
      const span = document.documentElement.scrollHeight - window.innerHeight;
      const cap = span > 0 ? span : 1;
      const reach = (el) =>
        el.getBoundingClientRect().bottom + window.scrollY - window.innerHeight;
      end1 = Math.max(1, Math.min(cap, stack ? reach(stack) : cap));
      end2 = Math.max(end1 + 1, Math.min(cap, tail ? reach(tail) : cap));
    };

    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const update = () => {
      const y = window.scrollY;
      line.style.setProperty("--lap-slides", clamp01(y / end1).toFixed(4));
      line.style.setProperty("--lap-rest", clamp01((y - end1) / (end2 - end1)).toFixed(4));
    };

    measure();
    update();
    if (typeof scrollFrame === "object" && scrollFrame && scrollFrame.add) {
      scrollFrame.add(() => update);
    } else {
      window.addEventListener("scroll", update, { passive: true });
    }
    window.addEventListener("resize", () => {
      measure();
      update();
    });
    window.addEventListener("load", () => {
      measure();
      update();
    });
  }

  let skipIntro = null;

  function initEscape() {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const at = document.activeElement;
      if (at && (at.tagName === "INPUT" || at.tagName === "TEXTAREA" || at.isContentEditable)) return;

      if (skipIntro) {
        skipIntro();
        return;
      }
      if (advanced || past) return;
      window.clearTimeout(advanceTimer);
      advanceTimer = 0;
      advance();
    });
  }

  layout();
  window.addEventListener("resize", layout);
  window.addEventListener("load", layout);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", layout);
  }
  runIntro();
  initEscape();
  watchPast();
  initGlyphCycle();
  initPageLine();
})();
