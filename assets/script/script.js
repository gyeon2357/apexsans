
document.documentElement.classList.add("app-ready");

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}
window.scrollTo(0, 0);

var scrollFrame = (function () {
  var readers = [];
  var queued = false;
  function run() {
    queued = false;
    var writes = [];
    for (var i = 0; i < readers.length; i++) {
      var w = readers[i]();
      if (typeof w === "function") writes.push(w);
    }
    for (var j = 0; j < writes.length; j++) writes[j]();
  }
  return {
    add: function (read) { readers.push(read); },
    request: function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(run);
    }
  };
})();
window.addEventListener("scroll", function () { scrollFrame.request(); }, { passive: true });
window.addEventListener("resize", function () { scrollFrame.request(); });

function syncHeaderHeight() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const h = header.getBoundingClientRect().height;
  if (h > 0) {
    document.documentElement.style.setProperty("--header-h", `${Math.round(h)}px`);
  }
}
syncHeaderHeight();
window.addEventListener("resize", syncHeaderHeight);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncHeaderHeight);
}
window.addEventListener("resize", function () {
  window.clearTimeout(syncHeaderHeight._t);
  syncHeaderHeight._t = window.setTimeout(syncHeaderHeight, 350);
});

function watchGlyphPanelStick() {
  const panels = [".glyph-browser__preview", ".tester__toolbar"]
    .map((sel) => document.querySelector(sel))
    .filter(Boolean);
  const header = document.querySelector(".site-header");
  if (!panels.length || !header) return;

  function read() {
    const headerH = header.getBoundingClientRect().height || 0;
    const stuck = panels.some((p) => {
      const r = p.getBoundingClientRect();
      return r.top <= headerH + 1 && r.bottom > headerH;
    });
    return () => header.classList.toggle("is-over-panel", stuck);
  }
  read()();
  scrollFrame.add(read);
}
watchGlyphPanelStick();
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(syncHeaderHeight);
}

const SEGMENT_VH = 1.6;
const HOLD_RATIO = 0.5;
const SEGMENT_VH_MOBILE = 1.05;
const HOLD_RATIO_MOBILE = 0.22;
const MOBILE_BREAKPOINT = 640;
const AUTO_ADVANCE_THRESHOLD = 0.5;
const AUTO_ADVANCE_DURATION = 420;

let stackedScrollInstance = null;

const hasScrollToPlugin = !!(window.gsap && window.gsap.registerPlugin && window.ScrollToPlugin);
if (hasScrollToPlugin) {
  gsap.registerPlugin(ScrollToPlugin);
}

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

const LENIS_ON_TOUCH = true;

const LENIS_ON_REDUCED_MOTION = true;

const LENIS_FEEL = {
  lerp: 0.12,
  wheel: 0.75,
  touch: 0.95,
  touchLerp: 0.075,
  coast: 1.85,
};

const LENIS_FEEL_REDUCED = {
  lerp: 0.3,
  wheel: 0.75,
  touch: 0.95,
  touchLerp: 0.09,
  coast: 1.9,
};

let lenis = null;

function initSmoothScroll() {
  if (typeof Lenis === "undefined") return;
  if (prefersReducedMotion() && !LENIS_ON_REDUCED_MOTION) return;
  if (typeof ResizeObserver === "undefined") return;

  try {
    lenis = makeLenis();
  } catch (e) {
    lenis = null;
    if (window.console) console.warn("부드러운 스크롤을 켜지 못했습니다:", e);
  }
}

function makeLenis() {
  const feel = prefersReducedMotion() ? LENIS_FEEL_REDUCED : LENIS_FEEL;
  const instance = new Lenis({
    lerp: feel.lerp,
    wheelMultiplier: feel.wheel,
    touchMultiplier: feel.touch,
    syncTouchLerp: feel.touchLerp,
    touchInertiaExponent: feel.coast,
    smoothWheel: true,
    syncTouch: LENIS_ON_TOUCH,
    respectReducedMotion: !LENIS_ON_REDUCED_MOTION,
    orientation: "vertical",
    gestureOrientation: "vertical",
  });

  instance.on("scroll", function () {
    scrollFrame.request();
    if (window.ScrollTrigger) window.ScrollTrigger.update();
  });

  function frame(time) {
    instance.raf(time);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return instance;
}

function scrollPageTo(target, opt) {
  const o = opt || {};
  if (lenis) {
    const arg = { immediate: !!o.immediate, offset: o.offset || 0 };
    if (o.duration) arg.duration = o.duration;
    if (o.lock) arg.lock = true;
    if (o.force) arg.force = true;
    lenis.scrollTo(target, arg);
    return;
  }
  const y = typeof target === "number"
    ? target
    : target.getBoundingClientRect().top + window.scrollY + (o.offset || 0);
  window.scrollTo({ top: y, behavior: o.immediate ? "auto" : "smooth" });
}

function lockPageScroll(on, cls) {
  document.body.classList.toggle(cls, on);
  if (!lenis) return;
  if (on) lenis.stop();
  else lenis.start();
}

initSmoothScroll();

const URL_BAR_TOLERANCE = 0.2;

const WIDE_MIN = 2000;

const HOLD_ENTER_RATIO = 0.15;

class StackedScroll {
  constructor(container, slideSelector) {
    this.container = container;
    this.slides = Array.from(container.querySelectorAll(slideSelector));
    this.total = this.slides.length;
    this.ticking = false;
    this.isAutoScrolling = false;
    this.SPRING_K = 130;
    this.SPRING_DAMP = 16;
    this.SPRING_SNAP_PX = 0.3;
    this.SPRING_SNAP_V = 4;
    this.smoothY = window.scrollY;
    this.smoothV = 0;
    this.springRAF = null;
    this.springLast = 0;
    this.currentIndex = 0;
    this.settleTimer = null;
    this.lastScrollY = window.scrollY;
    this.scrollDirection = "down";
    this.indexAsideEl = document.querySelector(".stack__index");
    this.indexLabelEl = document.querySelector(".stack__index-label");
    this.indexDotsEl = document.querySelector(".stack__index-dots");
    this.indexDots = [];
    if (this.indexDotsEl) {
      this.indexDotsEl.innerHTML = "";
      this.slides.forEach((slide, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "stack__index-dot dot-nav__dot";
        const title = slide.dataset.title || "";
        dot.setAttribute(
          "aria-label",
          `슬라이드 ${i + 1} / ${this.total}${title ? ` — ${title}` : ""}`
        );
        dot.addEventListener("click", () => this.goToSlide(i));
        this.indexDotsEl.appendChild(dot);
        this.indexDots.push(dot);
      });
    }
    this.ctaEl = document.getElementById("stackCta");

    this.displayIndex = this.slides.map((slide, i) => ({
      number: i + 1,
      title: slide.dataset.title || "",
    }));

    this.panelCounts = this.slides.map((slide) => {
      if (!slide.classList.contains("slide--duo")) return 1;
      const count = slide.querySelectorAll(":scope > .slide__duo-track > .slide__duo-panel").length;
      return count > 0 ? count : 1;
    });
    this.duoTracks = this.slides.map((slide) =>
      slide.classList.contains("slide--duo") ? slide.querySelector(".slide__duo-track") : null
    );

    this.slides.forEach((slide, i) => {
      slide.style.zIndex = String(this.total - i);
    });

    this.onResize = this.onResize.bind(this);
    this.onScroll = this.onScroll.bind(this);
    this.stepSpring = this.stepSpring.bind(this);
    this.checkSnap = this.checkSnap.bind(this);
    this.cancelAutoScroll = this.cancelAutoScroll.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);

    this.hasScrollEnd = "onscrollend" in window;

    window.addEventListener("resize", this.onResize);
    window.addEventListener("scroll", this.onScroll, { passive: true });
    if (this.hasScrollEnd) {
      window.addEventListener("scrollend", this.checkSnap, { passive: true });
    }
    window.addEventListener("wheel", this.cancelAutoScroll, { passive: true });
    window.addEventListener("touchmove", this.cancelAutoScroll, { passive: true });
    window.addEventListener("keydown", this.onKeyDown);

    this.onResize();
  }

  onKeyDown(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;

    const t = e.target;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;

    const forwardKeys = ["ArrowDown", "PageDown", " ", "Spacebar"];
    const backKeys = ["ArrowUp", "PageUp"];
    const isForward = forwardKeys.includes(e.key);
    const isBack = backKeys.includes(e.key);
    const isHome = e.key === "Home";
    const isEnd = e.key === "End";
    if (!isForward && !isBack && !isHome && !isEnd) return;

    const y = window.scrollY;
    const inStack = y >= this.stackTop - this.vh * 0.5 && y < this.stackTop + this.totalScrollLength;
    if (!inStack) return;

    let target = this.currentIndex;
    if (isForward) target = this.currentIndex + 1;
    else if (isBack) target = this.currentIndex - 1;
    else if (isHome) target = 0;
    else if (isEnd) target = this.total - 1;

    e.preventDefault();
    this.goToSlide(target);
  }

  goToSlide(index) {
    const clamped = Math.max(-1, Math.min(this.total, index));

    if (clamped < 0) {
      this.animateScrollTo(Math.max(0, this.stackTop - this.vh));
      return;
    }
    if (clamped >= this.total) {
      this.animateScrollTo(this.stackTop + this.totalScrollLength);
      return;
    }

    const holdLen = this.segment * this.holdRatio;
    this.animateScrollTo(this.stackTop + this.slideStart[clamped] + holdLen * HOLD_ENTER_RATIO);
    this.announceSlide(clamped);
  }

  announceSlide(index) {
    const live = document.getElementById("stackLiveRegion");
    if (!live) return;
    const slide = this.slides[index];
    const title = (slide && slide.dataset.title) || "";
    live.textContent = `슬라이드 ${index + 1} / ${this.total}${title ? ` — ${title}` : ""}`;
  }

  cancelAutoScroll() {
    this.isAutoScrolling = false;
    if (this.snapTween) {
      this.snapTween.kill();
      this.snapTween = null;
    }
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (
      this.lastResizeW === w &&
      this.lastResizeH !== undefined &&
      Math.abs(this.lastResizeH - h) <= this.lastResizeH * URL_BAR_TOLERANCE
    ) {
      return;
    }
    this.lastResizeW = w;
    this.lastResizeH = h;

    this.vh = h;
    const isMobile = w <= MOBILE_BREAKPOINT;
    this.holdRatio = isMobile ? HOLD_RATIO_MOBILE : HOLD_RATIO;
    this.segment = this.vh * (isMobile ? SEGMENT_VH_MOBILE : SEGMENT_VH);

    this.slideStart = [];
    let cursor = 0;
    this.slides.forEach((slide, i) => {
      this.slideStart[i] = cursor;
      cursor += this.segment * this.panelCounts[i];
    });
    this.exitLen = this.vh;
    this.totalScrollLength = cursor + this.exitLen;

    this.container.style.height = `${this.totalScrollLength}px`;
    this.stackTop = this.getOffsetTop(this.container);
    this.snapSpring();
    this.update();
  }

  startSpring() {
    if (this.springRAF !== null) return;
    this.springLast = 0;
    this.springRAF = requestAnimationFrame(this.stepSpring);
  }

  stepSpring(now) {
    const target = window.scrollY;

    if (!this.springLast) {
      this.springLast = now;
      this.springRAF = requestAnimationFrame(this.stepSpring);
      return;
    }
    const dt = Math.max(0, Math.min((now - this.springLast) * 0.001, 0.05));
    this.springLast = now;

    const dx = target - this.smoothY;
    this.smoothV += (this.SPRING_K * dx - this.SPRING_DAMP * this.smoothV) * dt;
    this.smoothY += this.smoothV * dt;

    const exitLen = this.exitLen || this.segment * (1 - this.holdRatio);
    const exitStart = this.stackTop + this.totalScrollLength - exitLen;
    if (exitLen > 0 && target > exitStart) {
      const blend = Math.min(1, (target - exitStart) / exitLen);
      this.smoothY += (target - this.smoothY) * blend;
      this.smoothV *= 1 - blend;
    }

    this.update();

    if (Math.abs(target - this.smoothY) < this.SPRING_SNAP_PX && Math.abs(this.smoothV) < this.SPRING_SNAP_V) {
      this.smoothY = target;
      this.smoothV = 0;
      this.springRAF = null;
      this.update();
      return;
    }
    this.springRAF = requestAnimationFrame(this.stepSpring);
  }

  snapSpring() {
    if (this.springRAF !== null) {
      cancelAnimationFrame(this.springRAF);
      this.springRAF = null;
    }
    this.smoothY = window.scrollY;
    this.smoothV = 0;
  }

  onScroll() {
    if (!this.isAutoScrolling) {
      const y = window.scrollY;
      if (y !== this.lastScrollY) {
        this.scrollDirection = y > this.lastScrollY ? "down" : "up";
      }
      this.lastScrollY = y;
    }
    if (prefersReducedMotion()) {
      this.snapSpring();
      if (!this.ticking) {
        this.ticking = true;
        requestAnimationFrame(() => {
          this.update();
          this.ticking = false;
        });
      }
    } else {
      this.startSpring();
    }
    if (this.isAutoScrolling) return;
    if (this.hasScrollEnd) return;
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.checkSnap(), 110);
  }

  checkSnap() {
    if (this.isAutoScrolling) return;
    if (this.scrollDirection === "up") return;
    const i = this.currentIndex;
    const panelCount = this.panelCounts[i];
    if (panelCount == null) return;
    const scrollY = window.scrollY - this.stackTop;
    const start = this.slideStart[i];
    const chunkLen = this.segment;
    const end = start + chunkLen * panelCount;
    const transLen = chunkLen - chunkLen * this.holdRatio;
    const outerHoldEnd = end - transLen;

    if (scrollY < outerHoldEnd || scrollY >= end) return;

    const progress = (scrollY - outerHoldEnd) / transLen;
    if (progress >= AUTO_ADVANCE_THRESHOLD) {
      this.animateScrollTo(this.stackTop + end);
    }
  }

  update() {
    const scrollY = this.smoothY - this.stackTop;
    let currentIndex = 0;

    this.slides.forEach((slide, i) => {
      const panelCount = this.panelCounts[i];
      const start = this.slideStart[i];
      const chunkLen = this.segment;
      const fullLen = chunkLen * panelCount;
      const end = start + fullLen;
      const track = this.duoTracks[i];

      if (panelCount === 1 && i === this.slides.length - 1) {
        const holdEnd = start + fullLen;

        if (scrollY < start) {
          slide.style.transform = "translateY(0)";
          slide.classList.remove("is-leaving", "is-passed", "is-current");
        } else if (scrollY < holdEnd) {
          slide.style.transform = "translateY(0)";
          slide.classList.remove("is-leaving", "is-passed");
          currentIndex = i;
        } else if (scrollY < holdEnd + this.exitLen) {
          const progress = (scrollY - holdEnd) / this.exitLen;
          slide.style.transform = `translateY(${-progress * 100}%)`;
          slide.classList.add("is-leaving");
          slide.classList.remove("is-passed");
          currentIndex = i;
        } else {
          slide.style.transform = "translateY(-100%)";
          slide.classList.add("is-passed");
          slide.classList.remove("is-leaving", "is-current");
        }
        return;
      }

      if (panelCount === 1) {
        const holdEnd = start + chunkLen * this.holdRatio;

        if (scrollY < start) {
          slide.style.transform = "translateY(0)";
          slide.classList.remove("is-leaving", "is-passed", "is-current");
        } else if (scrollY < holdEnd) {
          slide.style.transform = "translateY(0)";
          slide.classList.remove("is-leaving", "is-passed");
          currentIndex = i;
        } else if (scrollY < end) {
          const progress = (scrollY - holdEnd) / (chunkLen - chunkLen * this.holdRatio);
          slide.style.transform = `translateY(${-progress * 100}%)`;
          slide.classList.add("is-leaving");
          slide.classList.remove("is-passed");
          currentIndex = i;
        } else {
          slide.style.transform = "translateY(-100%)";
          slide.classList.add("is-passed");
          slide.classList.remove("is-leaving", "is-current");
        }
        return;
      }

      const local = scrollY - start;
      const holdLen = chunkLen * this.holdRatio;
      const transLen = chunkLen - holdLen;
      const targetForPanel = (p) => -((p / panelCount) * 100);

      if (scrollY < start) {
        slide.style.transform = "translateY(0)";
        if (track) track.style.transform = "translateY(0%)";
        slide.classList.remove("is-leaving", "is-passed", "is-current");
        return;
      }

      if (local >= fullLen) {
        slide.style.transform = "translateY(-100%)";
        if (track) track.style.transform = `translateY(${targetForPanel(panelCount - 1)}%)`;
        slide.classList.add("is-passed");
        slide.classList.remove("is-leaving", "is-current");
        return;
      }

      currentIndex = i;
      const chunkIndex = Math.min(Math.floor(local / chunkLen), panelCount - 1);
      const chunkLocal = local - chunkIndex * chunkLen;

      if (chunkIndex < panelCount - 1) {
        slide.style.transform = "translateY(0)";
        slide.classList.remove("is-leaving", "is-passed");
        if (chunkLocal < holdLen) {
          if (track) track.style.transform = `translateY(${targetForPanel(chunkIndex)}%)`;
        } else {
          const p = (chunkLocal - holdLen) / transLen;
          const from = targetForPanel(chunkIndex);
          const to = targetForPanel(chunkIndex + 1);
          if (track) track.style.transform = `translateY(${from + (to - from) * p}%)`;
        }
      } else {
        if (track) track.style.transform = `translateY(${targetForPanel(panelCount - 1)}%)`;
        if (chunkLocal < holdLen) {
          slide.style.transform = "translateY(0)";
          slide.classList.remove("is-leaving", "is-passed");
        } else {
          const p = (chunkLocal - holdLen) / transLen;
          slide.style.transform = `translateY(${-p * 100}%)`;
          slide.classList.add("is-leaving");
          slide.classList.remove("is-passed");
        }
      }
    });

    this.slides.forEach((slide, i) => {
      slide.classList.toggle("is-current", i === currentIndex);
    });
    this.currentIndex = currentIndex;

    const pastAll = scrollY >= this.totalScrollLength;
    if (this.indexAsideEl) {
      this.indexAsideEl.classList.toggle("is-hidden", pastAll);
    }
    if (this.ctaEl) {
      this.ctaEl.classList.toggle("is-hidden", pastAll);
    }

    this.updateIndexUI(currentIndex);
  }

  animateScrollTo(targetY) {
    this.isAutoScrolling = true;

    if (prefersReducedMotion()) {
      window.scrollTo(0, targetY);
      this.update();
      this.isAutoScrolling = false;
      return;
    }

    if (hasScrollToPlugin) {
      if (this.snapTween) this.snapTween.kill();
      this.snapTween = gsap.to(window, {
        duration: AUTO_ADVANCE_DURATION / 1000,
        scrollTo: { y: targetY },
        ease: "power3.out",
        onUpdate: () => this.update(),
        onComplete: () => {
          this.isAutoScrolling = false;
          this.snapTween = null;
        },
        onInterrupt: () => {
          this.isAutoScrolling = false;
          this.snapTween = null;
        },
      });
      return;
    }

    const startY = window.scrollY;
    const distance = targetY - startY;
    if (distance === 0) {
      this.isAutoScrolling = false;
      return;
    }
    const startTime = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const step = (now) => {
      if (!this.isAutoScrolling) return;

      const elapsed = now - startTime;
      const t = Math.min(elapsed / AUTO_ADVANCE_DURATION, 1);
      const eased = easeOutCubic(t);
      window.scrollTo(0, startY + distance * eased);
      this.update();

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        this.isAutoScrolling = false;
      }
    };

    requestAnimationFrame(step);
  }

  updateIndexUI(currentIndex) {
    const display = this.displayIndex[currentIndex];
    if (!display) return;
    this.indexDots.forEach((dot, i) => {
      const active = i === currentIndex;
      dot.classList.toggle("is-active", active);
      dot.classList.toggle("is-passed", i < currentIndex);
      if (active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
    if (this.indexLabelEl) {
      this.indexLabelEl.textContent = display.title;
    }
  }

  getOffsetTop(el) {
    let top = 0;
    while (el) {
      top += el.offsetTop;
      el = el.offsetParent;
    }
    return top;
  }
}

function initTypeTester() {
  const preview = document.getElementById("testerPreview");
  if (!preview) return;

  const TESTER_SHORT_KO =
    "아아우토드로모 에르마노스로드리게스 스즈카마리나베이 스트리트서킷 " +
    "스쿠데리아 페라리 다운포스드래그 에어로다이나믹스드리프트 " +
    "탑스피드레코드라인 그랜드스탠드 서스펜션 슬립스트리밍";
  const TESTER_SHORT_EN =
    "Autodromo Hermanos Rodriguez Suzuka Marina Bay Street Circuit " +
    "Scuderia Ferrari Downforce Drag Aerodynamics Drift " +
    "Top Speed Record Line Grandstand Suspension Slipstreaming";

  if (window.matchMedia && window.matchMedia("(max-width: 640px)").matches) {
    const wasDefault =
      preview.textContent.trim() === (preview.dataset.ko || "").trim();
    preview.dataset.ko = TESTER_SHORT_KO;
    preview.dataset.en = TESTER_SHORT_EN;
    if (wasDefault) preview.textContent = TESTER_SHORT_KO;
  }

  function fitSampleToBox() {
    const cap = parseFloat(getComputedStyle(preview).maxHeight);
    if (!cap) return;
    const room = cap * 0.8;
    const keep = preview.textContent;
    for (const lang of ["ko", "en"]) {
      const full = preview.dataset[lang];
      if (!full) continue;
      const words = full.split(" ");
      let lo = 1;
      let hi = words.length;
      let best = 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        preview.textContent = words.slice(0, mid).join(" ");
        if (preview.scrollHeight <= room) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      preview.dataset[lang] = words.slice(0, best).join(" ");
    }
    const now = keep.trim();
    const wasDefault =
      now === "" || TESTER_SHORT_KO.startsWith(now) || TESTER_SHORT_EN.startsWith(now);
    preview.textContent = wasDefault
      ? preview.dataset[preview.lang === "en" ? "en" : "ko"]
      : keep;
  }

  function sizeStepFor(w) {
    if (w >= WIDE_MIN) return { value: 80, max: 140 };
    if (w >= 1440) return { value: 64, max: 140 };
    if (w <= 640) return { value: 28, max: 96 };
    return { value: 48, max: 140 };
  }

  function applySizeStep(input, step) {
    input.max = String(step.max);
    input.value = String(step.value);
  }

  const SPRING_STIFFNESS = 0.25;
  const SPRING_DAMPING = 0.72;
  const SETTLE_EPSILON = 0.0008;

  const bindings = [
    { inputId: "testerSize", outputId: "testerSizeValue", prop: "fontSize", suffix: "px", unit: "px", decimals: 0 },
    { inputId: "testerLineHeight", outputId: "testerLineHeightValue", prop: "lineHeight", suffix: "", unit: "", decimals: 2 },
    { inputId: "testerLetterSpacing", outputId: "testerLetterSpacingValue", prop: "letterSpacing", suffix: "em", unit: "", decimals: 3 },
  ];

  const resetters = [];

  const glyphStage = document.querySelector(".glyph-browser__stage");
  if (glyphStage) {
    const syncTesterDotGrid = () => {
      const size = getComputedStyle(glyphStage, "::before").backgroundSize;
      if (size && /\dpx/.test(size)) preview.style.backgroundSize = size;
    };
    syncTesterDotGrid();
    window.addEventListener("resize", syncTesterDotGrid);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(syncTesterDotGrid);
    }
  }

  function updateTesterTruncation() {
    const overflowing = preview.scrollHeight > preview.clientHeight + 1;
    preview.classList.toggle("is-truncated", overflowing);
  const box = preview.closest(".tester");
  if (box) {
    const h = preview.offsetHeight;
    const vh = window.innerHeight;
    if (box.classList.contains("is-short")) {
      if (h > vh * 1.1) box.classList.remove("is-short");
    } else if (h < vh * 0.9) {
      box.classList.add("is-short");
    }
  }
  }

  window.addEventListener("resize", updateTesterTruncation);

  if (document.fonts && document.fonts.ready) {

    document.fonts.ready.then(updateTesterTruncation).catch(() => {});

  }

  window.addEventListener("load", updateTesterTruncation);



  bindings.forEach(({ inputId, outputId, prop, suffix, unit, decimals }) => {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    if (!input) return;

    if (inputId === "testerSize") applySizeStep(input, sizeStepFor(window.innerWidth));

    const min = parseFloat(input.min);
    let max = parseFloat(input.max);
    let defaultValue = parseFloat(input.value);
    let current = defaultValue;
    let target = current;
    let velocity = 0;
    let rafId = null;

    const row = input.closest(".tester__control");
    let shownDefault = defaultValue.toFixed(decimals);
    function markChanged(shown) {
      if (row) row.classList.toggle("is-changed", shown !== shownDefault);
    }

    function render(value) {
      const shown = value.toFixed(decimals);
      preview.style[prop] = `${shown}${suffix}`;
      if (output) output.textContent = `${shown}${unit}`;
      const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
      input.style.setProperty("--fill", `${pct}%`);
      markChanged(shown);
      updateTesterTruncation();
    }

    function loop() {
      const force = (target - current) * SPRING_STIFFNESS;
      velocity = (velocity + force) * SPRING_DAMPING;
      current += velocity;

      const settled = Math.abs(velocity) < SETTLE_EPSILON && Math.abs(target - current) < SETTLE_EPSILON;
      if (settled) {
        current = target;
        velocity = 0;
      }

      render(current);

      if (!settled) {
        rafId = requestAnimationFrame(loop);
      } else {
        rafId = null;
      }
    }

    if (inputId === "testerSize") {
      let step = sizeStepFor(window.innerWidth);
      window.addEventListener("resize", () => {
        const next = sizeStepFor(window.innerWidth);
        if (next.value === step.value && next.max === step.max) return;
        step = next;
        applySizeStep(input, next);
        max = next.max;
        defaultValue = next.value;
        shownDefault = defaultValue.toFixed(decimals);
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        current = target = defaultValue;
        velocity = 0;
        render(current);
      });
    }

    input.addEventListener("input", () => {
      target = parseFloat(input.value);
      if (prefersReducedMotion()) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        current = target;
        velocity = 0;
        render(current);
        return;
      }
      if (!rafId) rafId = requestAnimationFrame(loop);
    });

    function setValueFromTouchX(clientX) {
      const rect = input.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const step = parseFloat(input.step) || 0;
      let value = min + ratio * (max - min);
      if (step > 0) value = Math.round(value / step) * step;
      value = Math.min(max, Math.max(min, value));
      if (Number(input.value) === value) return;
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    input.addEventListener(
      "touchstart",
      (e) => {
        if (!e.touches || !e.touches.length) return;
        setValueFromTouchX(e.touches[0].clientX);
      },
      { passive: true }
    );
    input.addEventListener(
      "touchmove",
      (e) => {
        if (!e.touches || !e.touches.length) return;
        setValueFromTouchX(e.touches[0].clientX);
      },
      { passive: true }
    );

    if (output) {
      function startEdit() {
        const editBox = document.createElement("input");
        editBox.type = "number";
        editBox.className = "tester__control-value-edit";
        editBox.min = String(min);
        editBox.max = String(max);
        editBox.step = input.step || "any";
        editBox.value = String(Number(current.toFixed(decimals)));
        output.replaceWith(editBox);
        editBox.focus();
        editBox.select();

        function commit() {
          let value = parseFloat(editBox.value);
          if (Number.isNaN(value)) value = current;
          value = Math.min(max, Math.max(min, value));
          input.value = String(value);
          target = value;
          current = value;
          velocity = 0;
          editBox.replaceWith(output);
          render(current);
        }

        editBox.addEventListener("blur", commit);
        editBox.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            editBox.blur();
          } else if (e.key === "Escape") {
            editBox.value = String(Number(current.toFixed(decimals)));
            editBox.blur();
          }
        });
      }

      output.addEventListener("click", startEdit);
      output.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startEdit();
        }
      });
    }

    render(current);

    resetters.push(() => {
      input.value = String(defaultValue);
      target = defaultValue;
      current = defaultValue;
      velocity = 0;
      render(current);
    });
  });

  const DEFAULT_COLS = window.innerWidth >= WIDE_MIN ? "2" : "1";
  const colsGroup = document.getElementById("testerCols");

  function setColumns(n) {
    preview.style.columnCount = n;
    if (!colsGroup) return;
    colsGroup.querySelectorAll(".tester__col-btn").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.cols === n));
    });
    updateTesterTruncation();
  }

  if (colsGroup) {
    colsGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".tester__col-btn");
      if (btn && colsGroup.contains(btn)) setColumns(btn.dataset.cols);
    });
    setColumns(DEFAULT_COLS);
  }

  const DEFAULT_ALIGN = "left";
  const alignGroup = document.getElementById("testerAlign");

  function setAlign(name) {
    preview.style.textAlign = name;
    if (!alignGroup) return;
    alignGroup.querySelectorAll(".tester__align-btn").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.align === name));
    });
  }

  if (alignGroup) {
    alignGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".tester__align-btn");
      if (btn && alignGroup.contains(btn)) setAlign(btn.dataset.align);
    });
    setAlign(DEFAULT_ALIGN);
    resetters.push(() => setAlign(DEFAULT_ALIGN));
  }

  const PREVIEW_COLORS = ["dark", "red", "light"];
  const PREVIEW_COLOR_KO = { dark: "다크", red: "레드", light: "라이트" };
  const colorBtn = document.getElementById("testerColorBtn");
  const panel = preview.closest(".tester");
  if (colorBtn && panel) {
    const siteTheme = () =>
      document.documentElement.getAttribute("data-theme") || PREVIEW_COLORS[0];

    const setPreviewColor = (name) => {
      if (name) panel.setAttribute("data-preview-theme", name);
      else panel.removeAttribute("data-preview-theme");
      colorBtn.setAttribute("aria-pressed", String(!!name));
      colorBtn.setAttribute(
        "aria-label",
        name
          ? `미리보기 색 전환 (현재 ${PREVIEW_COLOR_KO[name]})`
          : "미리보기 색 전환 (지금은 페이지와 같은 색)"
      );
    };

    onFirstTap(colorBtn, () => {
      const now = panel.getAttribute("data-preview-theme") || siteTheme();
      const at = PREVIEW_COLORS.indexOf(now);
      setPreviewColor(PREVIEW_COLORS[(at + 1) % PREVIEW_COLORS.length]);
    });
    resetters.push(() => setPreviewColor(null));
  }

  const resetBtn = document.getElementById("testerResetBtn");
  if (resetBtn) {
    onFirstTap(resetBtn, () => {
      resetters.forEach((reset) => reset());
      setColumns(DEFAULT_COLS);
      if (preview.dataset.ko) {
        preview.textContent = preview.dataset.ko;
        updateTesterTruncation();
      }
    });
  }

  const setPreviewScroll = (on) => {
    preview.toggleAttribute("data-lenis-prevent", on);
  };
  preview.addEventListener("focus", () => setPreviewScroll(true));
  preview.addEventListener("blur", () => setPreviewScroll(false));

  preview.addEventListener("input", updateTesterTruncation);
  fitSampleToBox();
  updateTesterTruncation();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      fitSampleToBox();
      updateTesterTruncation();
    });
  }

  const langBtn = document.getElementById("testerLangBtn");
  if (langBtn) {
    const langBtnLabel = langBtn.querySelector("span") || langBtn;
    let testerLang = "ko";
    function toggleTesterLang() {
      const next = testerLang === "en" ? "ko" : "en";
      const current = preview.textContent.trim();
      const isDefaultKo = current === (preview.dataset.ko || "").trim();
      const isDefaultEn = current === (preview.dataset.en || "").trim();
      if (isDefaultKo || isDefaultEn || current === "") {
        preview.textContent = next === "en" ? preview.dataset.en : preview.dataset.ko;
        updateTesterTruncation();
      }
      testerLang = next;
      preview.lang = next;
      langBtnLabel.textContent = next === "en" ? "KO" : "EN";
      langBtn.setAttribute("aria-pressed", String(next === "en"));
    }

    onFirstTap(langBtn, toggleTesterLang);
  }

  const otBtn = document.getElementById("testerOtBtn");
  if (otBtn) {
    const decl = (typeof OPENTYPE_SHARED === "object" && OPENTYPE_SHARED.css) || "";
    const feature = (decl.match(/font-feature-settings:\s*([^;]+)/) || [])[1] || '"ss01" 1';
    let otOn = false;
    const setOt = (on) => {
      otOn = on;
      preview.style.fontFeatureSettings = on ? feature : "";
      otBtn.setAttribute("aria-pressed", String(on));
    };
    onFirstTap(otBtn, () => setOt(!otOn));
    resetters.push(() => setOt(false));
  }

  const otInfoBtn = document.getElementById("testerOtInfoBtn");
  const otNote = document.getElementById("testerOtNote");
  if (otInfoBtn && otNote) {
    const NOTE_GAP = 8;
    const NOTE_EDGE = 12;
    const placeNote = () => {
      const panel = otNote.offsetParent;
      if (!panel) return;
      const pr = panel.getBoundingClientRect();
      const br = otInfoBtn.getBoundingClientRect();
      const w = otNote.offsetWidth;
      const max = Math.max(NOTE_EDGE, window.innerWidth - NOTE_EDGE - w);
      const left = Math.min(Math.max(br.right - w, NOTE_EDGE), max);
      otNote.style.left = `${left - pr.left}px`;
      otNote.style.top = `${br.bottom - pr.top + NOTE_GAP}px`;
    };

    const setNote = (open) => {
      if (open) {
        otNote.removeAttribute("hidden");
        placeNote();
      } else {
        otNote.setAttribute("hidden", "");
      }
      otInfoBtn.setAttribute("aria-expanded", String(open));
    };
    onFirstTap(otInfoBtn, () => setNote(otNote.hasAttribute("hidden")));

    const otCloseBtn = document.getElementById("testerOtCloseBtn");
    if (otCloseBtn) onFirstTap(otCloseBtn, () => setNote(false));

    const keepPlaced = () => {
      if (!otNote.hasAttribute("hidden")) placeNote();
    };
    window.addEventListener("scroll", keepPlaced, { passive: true });
    window.addEventListener("resize", keepPlaced);

    if ("IntersectionObserver" in window) {
      const row = otInfoBtn.closest(".tester__ot") || otInfoBtn;
      new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting && !otNote.hasAttribute("hidden")) setNote(false);
        });
      }).observe(row);
    }

    document.addEventListener("pointerdown", (e) => {
      if (otNote.hasAttribute("hidden")) return;
      if (otNote.contains(e.target) || otInfoBtn.contains(e.target)) return;
      setNote(false);
    });
  }
}

function onFirstTap(el, handler) {
  if (!el) return;
  let handledByTouch = false;
  let timer = null;
  el.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      handledByTouch = true;
      handler();
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        handledByTouch = false;
      }, 500);
    },
    { passive: false }
  );
  el.addEventListener("click", () => {
    if (handledByTouch) return;
    handler();
  });
}

const GLYPH_CATEGORIES = [
  {
    name: "Hangul",
    chars: [
        "가", "각", "갈", "감", "강", "개", "거", "건", "검", "것", "겠", "고", "골",
        "곳", "과", "관", "교", "구", "국", "굴", "궁", "귀", "그", "근", "글", "급",
        "기", "김", "깊", "낙", "날", "내", "녀", "노", "논", "농", "누", "눈", "다",
        "단", "담", "답", "대", "덕", "독", "돌", "두", "뒤", "들", "등", "따", "때",
        "락", "난", "람", "랑", "래", "력", "련", "령", "로", "론", "롱", "루", "류",
        "림", "마", "만", "말", "맞", "매", "명", "몇", "모", "몸", "못", "물", "미",
        "믿", "바", "반", "발", "배", "백", "벌", "범", "보", "복", "봉", "부", "북",
        "불", "비", "사", "산", "삶", "상", "색", "생", "석", "선", "성", "세", "속",
        "손", "수", "숙", "술", "숨", "숭", "식", "신", "심", "십", "악", "암", "어",
        "언", "오", "온", "의", "자", "재", "적", "조", "직", "집", "차", "착", "창",
        "체", "총", "최", "카", "타", "포", "피", "학", "한", "항", "해", "허", "헐",
        "홍", "회"
    ],
  },
  {
    name: "Uppercase",
    chars: [
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
        "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"
    ],
  },
  {
    name: "Lowercase",
    chars: [
        "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
        "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
    ],
  },
  {
    name: "Numbers",
    chars: [
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"
    ],
  },
];

function buildMixedGlyphList(categories) {
  const queues = categories.map((c) => c.chars.slice());
  const out = [];
  let remaining = queues.reduce((n, q) => n + q.length, 0);
  while (remaining > 0) {
    for (let i = 0; i < queues.length; i++) {
      const ch = queues[i].shift();
      if (ch !== undefined) {
        out.push({ ch, category: categories[i].name });
        remaining--;
      }
    }
  }
  return out;
}

const GROUP_ORDER_KO = ["Hangul", "Uppercase", "Lowercase", "Numbers", "Punctuation"];
const GROUP_ORDER_EN = ["Uppercase", "Lowercase", "Numbers", "Punctuation", "Hangul"];

function buildGroupedGlyphList(categories, lang) {
  const order = lang === "en" ? GROUP_ORDER_EN : GROUP_ORDER_KO;
  const rank = (name) => {
    const i = order.indexOf(name);
    return i === -1 ? order.length : i;
  };
  const sorted = categories.slice().sort((a, b) => rank(a.name) - rank(b.name));

  const out = [];
  sorted.forEach((c) => {
    c.chars.forEach((ch) => out.push({ ch, category: c.name }));
  });
  return out;
}

const GLYPH_LIMIT_NARROW = {
  Hangul: 91,
  Uppercase: 26,
  Lowercase: 26,
  Numbers: 10,
};

function narrowGlyphCategories(categories) {
  return categories.map((cat) => {
    const limit = GLYPH_LIMIT_NARROW[cat.name];
    if (limit === undefined || limit >= cat.chars.length) return cat;
    const n = cat.chars.length;
    const picked = [];
    for (let i = 0; i < limit; i++) {
      picked.push(cat.chars[Math.round((i * (n - 1)) / (limit - 1))]);
    }
    return Object.assign({}, cat, { chars: picked });
  });
}

function initGlyphBaseline() {
  const stage = document.getElementById("glyphStage");
  const bigChar = document.getElementById("glyphBigChar");
  if (!stage || !bigChar) return;

  function measure() {
    const size = parseFloat(getComputedStyle(bigChar).fontSize);
    if (!(size > 0)) return;
    const probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "display:inline-block;width:0;height:0;vertical-align:baseline";
    bigChar.appendChild(probe);
    const drop =
      (bigChar.getBoundingClientRect().bottom - probe.getBoundingClientRect().bottom) / size;
    bigChar.removeChild(probe);
    if (!(drop >= 0) || drop > 0.5) return;
    stage.style.setProperty("--glyph-baseline-drop", String(drop));
  }

  measure();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(measure).catch(() => {});
  }
}

function initGlyphBrowser() {
  const table = document.getElementById("glyphTable");
  const grid = document.getElementById("glyphGrid");
  const stage = document.getElementById("glyphStage");
  const bigChar = document.getElementById("glyphBigChar");
  const unicodeLabel = document.getElementById("glyphUnicode");
  const sortBtn = document.getElementById("glyphSortBtn");
  if (!table || !grid || !bigChar) return;

  const NARROW = "(max-width: 640px)";
  const isNarrow = () =>
    !!(window.matchMedia && window.matchMedia(NARROW).matches);
  const categories = () =>
    isNarrow() ? narrowGlyphCategories(GLYPH_CATEGORIES) : GLYPH_CATEGORIES;

  const mixedListFor = () => buildMixedGlyphList(categories());
  const groupedListFor = (lang) => buildGroupedGlyphList(categories(), lang);

  let sortMode = "grouped";
  let currentSelection = null;
  const categoryFirstButtons = {};

  function selectGlyph(ch, btn) {
    grid.querySelectorAll(".glyph-cell.is-active").forEach((el) => {
      el.classList.remove("is-active");
    });
    if (btn) btn.classList.add("is-active");
    currentSelection = ch;
    bigChar.textContent = ch;
    if (unicodeLabel) {
      const code = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
      unicodeLabel.textContent = `U+${code}`;
    }
  }

  function renderGrid() {
    grid.innerHTML = "";
    Object.keys(categoryFirstButtons).forEach((k) => delete categoryFirstButtons[k]);

    const list = sortMode === "grouped" ? groupedListFor(currentLang()) : mixedListFor();
    const fragment = document.createDocumentFragment();
    let firstButton = null;
    let selectedButton = null;

    list.forEach(({ ch, category }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "glyph-cell";
      btn.textContent = ch;
      btn.addEventListener("mouseenter", () => selectGlyph(ch, btn));
      btn.addEventListener("click", () => selectGlyph(ch, btn));
      fragment.appendChild(btn);
      if (!firstButton) firstButton = btn;
      if (!categoryFirstButtons[category]) categoryFirstButtons[category] = btn;
      if (ch === currentSelection && !selectedButton) selectedButton = btn;
    });

    grid.appendChild(fragment);

    const target = selectedButton || firstButton;
    if (target) selectGlyph(target.textContent, target);
  }

  renderGrid();

  const BROWSE_HOLD_MS = 260;
  const AXIS_SLOP = 8;
  let touchMode = null;
  let touchOrigin = null;
  let touchStartAt = 0;
  let holdTimer = 0;
  let lastTouched = null;

  function pickAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest ? el.closest(".glyph-cell") : null;
    if (!cell || cell === lastTouched || !grid.contains(cell)) return;
    lastTouched = cell;
    selectGlyph(cell.textContent, cell);
  }

  function endTouch() {
    clearTimeout(holdTimer);
    touchMode = null;
    touchOrigin = null;
    touchStartAt = 0;
    lastTouched = null;
  }

  grid.addEventListener("touchstart", (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    endTouch();
    touchOrigin = { x: t.clientX, y: t.clientY };
    touchStartAt = Date.now();
    holdTimer = setTimeout(() => {
      if (touchMode !== null || !touchOrigin) return;
      touchMode = "browse";
      pickAt(touchOrigin.x, touchOrigin.y);
    }, BROWSE_HOLD_MS);
  }, { passive: true });

  grid.addEventListener("touchmove", (e) => {
    const t = e.touches && e.touches[0];
    if (!t || !touchOrigin) return;
    if (touchMode === null) {
      const dx = Math.abs(t.clientX - touchOrigin.x);
      const dy = Math.abs(t.clientY - touchOrigin.y);
      if (dx < AXIS_SLOP && dy < AXIS_SLOP) return;
      clearTimeout(holdTimer);
      touchMode = dx > dy ? "browse" : "scroll";
    }
    if (touchMode !== "browse") return;
    if (Date.now() - touchStartAt < BROWSE_HOLD_MS) return;
    pickAt(t.clientX, t.clientY);
  }, { passive: true });

  grid.addEventListener("touchend", endTouch, { passive: true });
  grid.addEventListener("touchcancel", endTouch, { passive: true });

  if (window.matchMedia) {
    const mq = window.matchMedia(NARROW);
    if (mq.addEventListener) mq.addEventListener("change", renderGrid);
    else if (mq.addListener) mq.addListener(renderGrid);
  }

  if (sortBtn) {
    sortBtn.addEventListener("click", () => {
      sortMode = sortMode === "mixed" ? "grouped" : "mixed";
      const shuffled = sortMode === "mixed";
      sortBtn.setAttribute("aria-pressed", String(shuffled));
      sortBtn.classList.toggle("is-active", shuffled);
      renderGrid();
    });
  }

  document.addEventListener("apex:langchange", () => {
    if (sortMode === "grouped") renderGrid();
  });

  const outlineToggle = document.getElementById("glyphOutlineToggle");
  if (outlineToggle && stage) {
    outlineToggle.addEventListener("change", () => {
      stage.classList.toggle("is-outline", outlineToggle.checked);
    });
  }
}

const BANNER_SPLIT_MAX_WIDTH = 640;
let bannerSource = null;

function readBannerSource() {
  if (bannerSource) return bannerSource;
  const wrap = document.getElementById("specimen-banner");
  if (!wrap) return null;
  const words = wrap.querySelectorAll(".specimen__banner-word");
  if (!words.length) return null;
  bannerSource = Array.from(words).map((el) => {
    const fallback = el.textContent.trim();
    const split = (v) => (v || "").split("|").map((s) => s.trim()).filter(Boolean);
    return {
      ko: el.dataset.ko || fallback,
      en: el.dataset.en || fallback,
      koLines: split(el.dataset.koLines),
      enLines: split(el.dataset.enLines),
    };
  });
  return bannerSource;
}

function renderBannerWords() {
  const wrap = document.getElementById("specimen-banner");
  const src = readBannerSource();
  if (!wrap || !src) return;

  const en = currentLang() === "en";
  const split = window.innerWidth <= BANNER_SPLIT_MAX_WIDTH;

  const lines = [];
  src.forEach((item) => {
    const parts = en ? item.enLines : item.koLines;
    if (split && parts.length) lines.push(...parts);
    else lines.push(en ? item.en : item.ko);
  });

  const existing = Array.from(wrap.querySelectorAll(".specimen__banner-word"));
  const same =
    existing.length === lines.length &&
    existing.every((el, i) => el.textContent === lines[i]);
  if (same) return;

  wrap.textContent = "";
  lines.forEach((text) => {
    const span = document.createElement("span");
    span.className = "specimen__banner-word";
    span.textContent = text;
    wrap.appendChild(span);
  });
}

function fitBannerWord() {
  const wrap = document.getElementById("specimen-banner");
  if (!wrap) return;
  renderBannerWords();
  const words = wrap.querySelectorAll(".specimen__banner-word");
  if (!words.length) return;

  const styles = getComputedStyle(wrap);
  const paddingX = parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0");
  const available = wrap.clientWidth - paddingX;
  if (available <= 0) return;

  words.forEach((word) => {
    let fontSize = parseFloat(getComputedStyle(word).fontSize);
    if (!(fontSize > 0)) fontSize = 96;
    word.style.fontSize = `${fontSize}px`;

    for (let i = 0; i < 8; i++) {
      const currentWidth = word.getBoundingClientRect().width;
      if (currentWidth <= 0) break;
      const ratio = available / currentWidth;
      if (Math.abs(ratio - 1) < 0.001) break;
      fontSize *= ratio;
      if (!(fontSize > 0)) break;
      word.style.fontSize = `${fontSize}px`;
    }
  });
}

function initBannerFit() {
  fitBannerWord();
  window.addEventListener("resize", fitBannerWord);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitBannerWord).catch(() => {});
  }
  requestAnimationFrame(() => requestAnimationFrame(fitBannerWord));
}

const OPENTYPE_SUPPORT_KO =
  "웹: font-feature-settings / font-variant-* 속성을 지원하는 브라우저에서 사용 가능 · 인쇄: Photoshop, Illustrator, InDesign 등 OpenType 패널 지원 앱에서 사용 가능";
const OPENTYPE_SUPPORT_EN =
  "Web: available in browsers that support font-feature-settings / font-variant-* · Print: available in apps with an OpenType panel, such as Photoshop, Illustrator, and InDesign.";

const OPENTYPE_SHARED = {
  tag: "ss01",
  ko_desc: "특정 글자 조합의 획을 연결해 자연스러운 흐름을 만듭니다.",
  en_desc: "Connects the strokes of certain letter combinations for a natural flow.",
  css: 'font-feature-settings: "ss01" 1;',
};

const OPENTYPE_ART_RATIO = {
  "a-1": "1521.11 / 151.07",
  "a-2": "1518.53 / 151.07",
  "b-1": "975.43 / 151.07",
  "b-2": "975.43 / 151.07",
  "c-1": "1621.03 / 153.65",
  "c-2": "1616.52 / 153.65",
  "d-1": "730.87 / 61.58",
  "d-2": "730.87 / 61.58",
  "e-1": "756.36 / 61.58",
  "e-2": "756.36 / 61.58",
  "f-1": "1742.25 / 417.62",
  "f-2": "1742.25 / 417.62",
};

const ASSET_BASE = document.documentElement.getAttribute("data-asset-base") || "";

function assetURL(p) {
  const rel = `${ASSET_BASE}${p}`;
  try {
    return new URL(rel, document.baseURI).href;
  } catch (e) {
    return rel;
  }
}

const OPENTYPE_FEATURES = ["a", "b", "c", "d", "e", "f"].map((key) => ({
  id: key,
  on: assetURL(`assets/images/opentype-${key}-1.svg`),
  off: assetURL(`assets/images/opentype-${key}-2.svg`),
  ...OPENTYPE_SHARED,
}));

let otState = { id: OPENTYPE_FEATURES[0].id, on: true };

function currentLang() {
  return document.documentElement.getAttribute("data-lang") === "en" ? "en" : "ko";
}

function otFeature() {
  return OPENTYPE_FEATURES.find((f) => f.id === otState.id) || OPENTYPE_FEATURES[0];
}

function renderOpenType() {
  const feature = otFeature();
  const lang = currentLang();

  const tagEl = document.getElementById("otFeatureTag");
  const descEl = document.getElementById("otFeatureDesc");
  const stateEl = document.getElementById("otFeatureState");
  const imageEl = document.getElementById("otImage");
  const cssCode = document.getElementById("otCssCode");
  const supportText = document.getElementById("otSupportText");

  if (tagEl) tagEl.textContent = feature.tag;
  if (descEl) descEl.textContent = lang === "en" ? feature.en_desc : feature.ko_desc;
  if (stateEl) stateEl.textContent = otState.on ? "On" : "Off";

  if (imageEl) {
    if (!(otMorph && otMorphFor === feature.id)) {
      const src = otState.on ? feature.on : feature.off;
      imageEl.style.setProperty("--ot-art", `url("${src}")`);
      const ratio = OPENTYPE_ART_RATIO[`${feature.id}-${otState.on ? 1 : 2}`];
      if (ratio) imageEl.style.setProperty("--ot-ratio", ratio);
    }
    imageEl.classList.toggle("is-off", !otState.on);
    imageEl.setAttribute(
      "aria-label",
      `${otLabel(feature, lang)} — ${otState.on ? "On" : "Off"}`
    );
  }

  if (cssCode) cssCode.textContent = feature.css;
  if (supportText) supportText.textContent = lang === "en" ? OPENTYPE_SUPPORT_EN : OPENTYPE_SUPPORT_KO;
}

const OT_MORPH = { mode: "crossfade", duration: 900 };
let otMorph = null;
let otMorphFor = null;
let otMorphArmed = false;
const otSvgCache = new Map();

function otLoadSvg(url) {
  if (!otSvgCache.has(url)) {
    otSvgCache.set(url, window.ApexMorph.load([url]).then((list) => list[0]));
  }
  return otSvgCache.get(url);
}

function otUnionRatio(feature) {
  const box = (n) => (OPENTYPE_ART_RATIO[`${feature.id}-${n}`] || "").split("/").map(Number);
  const [w1, h1] = box(1);
  const [w2, h2] = box(2);
  if (!w1 || !w2) return null;
  return `${Math.max(w1, w2)} / ${Math.max(h1, h2)}`;
}

function otDetachMorph() {
  if (otMorph) otMorph.destroy();
  otMorph = null;
  otMorphFor = null;
  document.getElementById("otImage")?.classList.remove("is-morph");
}

function otAttachMorph() {
  const feature = otFeature();
  const imageEl = document.getElementById("otImage");
  if (!imageEl || !window.ApexMorph || otMorphFor === feature.id) return;

  Promise.all([otLoadSvg(feature.off), otLoadSvg(feature.on)])
    .then(([from, to]) => {
      if (otState.id !== feature.id) return;
      otDetachMorph();
      const m = window.ApexMorph.create(Object.assign({ from, to, mount: imageEl }, OT_MORPH));
      if (!m) return;
      m.svg.setAttribute("preserveAspectRatio", "xMinYMid meet");
      m.set(otState.on ? 1 : 0);
      otMorph = m;
      otMorphFor = feature.id;
      const ratio = otUnionRatio(feature);
      if (ratio) imageEl.style.setProperty("--ot-ratio", ratio);
      imageEl.classList.add("is-morph");
    })
    .catch(() => {
    });
}

function swapOpenTypeFeature() {
  if (otMorphFor !== otState.id) otDetachMorph();
  renderOpenType();
  if (otMorphArmed) otAttachMorph();
}

function otWatchMorph() {
  const host = document.getElementById("OpenType");
  if (!host || !window.ApexMorph || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      otMorphArmed = true;
      otAttachMorph();
    },
    { rootMargin: "300px" }
  );
  io.observe(host);
}

const OPENTYPE_NARROW_ORDER = ["d", "e", "b"];
const OT_NARROW = "(max-width: 640px)";
const otNarrowMq = window.matchMedia ? window.matchMedia(OT_NARROW) : null;

function openTypeVisible() {
  if (!otNarrowMq?.matches) return OPENTYPE_FEATURES;
  return OPENTYPE_NARROW_ORDER
    .map((id) => OPENTYPE_FEATURES.find((f) => f.id === id))
    .filter(Boolean);
}

function otLabel(feature, lang = currentLang()) {
  const list = openTypeVisible();
  const i = list.indexOf(feature);
  const n = (i < 0 ? OPENTYPE_FEATURES.indexOf(feature) : i) + 1;
  return lang === "en" ? `Example ${n}` : `예시 ${n}`;
}

function refreshOpenTypeSelectLabels() {
  const select = document.getElementById("otFeatureSelect");
  if (!select) return;
  const lang = currentLang();
  const list = openTypeVisible();
  const wanted = select.value || otState.id;
  const current = list.some((f) => f.id === wanted) ? wanted : list[0].id;

  select.innerHTML = "";
  list.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = otLabel(f, lang);
    select.appendChild(opt);
  });
  select.value = current;
  otState.id = current;
}

function refreshOpenTypeLang() {
  refreshOpenTypeSelectLabels();
  swapOpenTypeFeature();
}

function initOpenTypeFeatures() {
  const select = document.getElementById("otFeatureSelect");
  const toggle = document.getElementById("otFeatureToggle");
  const tabs = document.querySelectorAll(".opentype__tab");
  const panels = {
    example: document.getElementById("otPanelExample"),
    css: document.getElementById("otPanelCss"),
    support: document.getElementById("otPanelSupport"),
  };
  if (!select) return;

  refreshOpenTypeSelectLabels();

  otNarrowMq?.addEventListener("change", () => {
    refreshOpenTypeSelectLabels();
    swapOpenTypeFeature();
  });

  select.addEventListener("change", () => {
    otState.id = select.value;
    swapOpenTypeFeature();
  });

  toggle?.addEventListener("change", () => {
    otState.on = toggle.checked;
    renderOpenType();
    if (otMorph && otMorphFor === otState.id) otMorph.play(!otState.on);
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.panel;
      if (!panels[key]) return;
      const nextOpen = panels[key].hidden;

      tabs.forEach((other) => {
        const otherKey = other.dataset.panel;
        const otherPanel = panels[otherKey];
        if (!otherPanel) return;
        const open = otherKey === key && nextOpen;
        otherPanel.hidden = !open;
        other.classList.toggle("is-active", open);
        other.setAttribute("aria-expanded", String(open));
      });
    });
  });

  renderOpenType();
  otWatchMorph();
}

const MARK_SPAN_MS = 3250;
const MARK_SLOW_V = 400;
const MARK_FAST_V = 2600;
const MARK_MIN_SCALE = 0.14;

function initAnatomyReveal() {
  const section = document.getElementById("anatomySection");
  if (!section) return;
  if (!("IntersectionObserver" in window)) {
    section.classList.add("is-drawn");
    return;
  }

  let velocity = 0;
  let lastY = window.scrollY;
  let lastT = performance.now();
  let watching = true;
  let drawnAt = 0;
  let spanMs = MARK_SPAN_MS;

  scrollFrame.add(function () {
    if (!watching) return null;
    const now = performance.now();
    const y = window.scrollY;
    const dt = now - lastT;
    if (dt > 0) velocity = (Math.abs(y - lastY) / dt) * 1000;
    lastY = y;
    lastT = now;
    if (!drawnAt) return null;

    if (now - drawnAt >= spanMs) {
      watching = false;
      return null;
    }
    const r = section.getBoundingClientRect();
    if (r.top < 0 || velocity > MARK_FAST_V) {
      watching = false;
      return () => section.classList.add("is-rushed");
    }
    return null;
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const t = (velocity - MARK_SLOW_V) / (MARK_FAST_V - MARK_SLOW_V);
        const scale = 1 - Math.min(1, Math.max(0, t)) * (1 - MARK_MIN_SCALE);
        section.style.setProperty("--mark-scale", scale.toFixed(2));
        spanMs = MARK_SPAN_MS * scale;
        drawnAt = performance.now();
        section.classList.add("is-drawn");
        observer.disconnect();
      });
    },
    { threshold: 0.25 }
  );
  observer.observe(section);
}

function initMainStageVisibility() {
  const mainStage = document.getElementById("main-screen");
  if (!mainStage || !("IntersectionObserver" in window)) return;
  if (mainStage.hasAttribute("data-keep-header")) {
    document.body.classList.add("keep-header");
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        document.body.classList.toggle("main-screen-visible", entry.isIntersecting);
      });
    },
    { threshold: 0.4 }
  );
  observer.observe(mainStage);
}

const CONSENT_KEY = "site-storage-consent";
const THEME_KEY = "site-theme";

function hasConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY) === "granted";
  } catch (e) {
    return false;
  }
}

function storageSet(key, value) {
  if (!hasConsent()) return;
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
}

function storageGet(key) {
  if (!hasConsent()) return null;
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

const THEMES = ["dark", "red", "light"];
const THEME_LABELS = { red: "레드", dark: "다크", light: "라이트" };

function applyTheme(theme) {
  const next = THEMES.includes(theme) ? theme : THEMES[0];
  const root = document.documentElement;

  root.classList.add("theme-switching");
  root.setAttribute("data-theme", next);
  const unlock = () => root.classList.remove("theme-switching");
  requestAnimationFrame(() => requestAnimationFrame(unlock));
  window.setTimeout(unlock, 120);
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.setAttribute("aria-label", `색상 모드 전환 (현재 ${THEME_LABELS[next]} 모드)`);
  }

  syncThemeColor();
}

function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = window.getComputedStyle(document.body).backgroundColor;
  if (bg) meta.setAttribute("content", bg);
}

function initTheme() {
  const stored = storageGet(THEME_KEY);

  if (stored) {
    applyTheme(stored);
  } else {
    applyTheme(THEMES[0]);
  }

  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const now = document.documentElement.getAttribute("data-theme");
    const i = THEMES.indexOf(now);
    const next = THEMES[(i + 1) % THEMES.length];
    applyTheme(next);
    storageSet(THEME_KEY, next);
    showConsentBanner();
  });
}

const SNOOZE_KEY = "site-consent-snoozed-until";
const SNOOZE_MS = 10 * 60 * 1000;

function showConsentBanner() {
  const banner = document.getElementById("consentBanner");
  if (!banner) return;

  let decided = false;
  try {
    decided = localStorage.getItem(CONSENT_KEY) !== null;
  } catch (e) {
    decided = false;
  }

  let snoozedUntil = 0;
  try {
    snoozedUntil = Number(localStorage.getItem(SNOOZE_KEY)) || 0;
  } catch (e) {
    snoozedUntil = 0;
  }

  if (!decided && Date.now() > snoozedUntil) {
    banner.hidden = false;
    scheduleConsentAutoDismiss(banner);
  }
}

const CONSENT_AUTO_DISMISS_MS = 6000;
const CONSENT_FADE_MS = 400;
let consentDismissTimer = null;

function scheduleConsentAutoDismiss(banner) {
  if (consentDismissTimer) window.clearTimeout(consentDismissTimer);
  banner.classList.remove("is-leaving");

  consentDismissTimer = window.setTimeout(() => {
    if (banner.hidden) return;
    snoozeConsent();

    if (prefersReducedMotion()) {
      banner.hidden = true;
      return;
    }
    banner.classList.add("is-leaving");
    window.setTimeout(() => {
      banner.hidden = true;
      banner.classList.remove("is-leaving");
    }, CONSENT_FADE_MS);
  }, CONSENT_AUTO_DISMISS_MS);
}

function snoozeConsent() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch (e) {}
}

function initConsentBanner() {
  const banner = document.getElementById("consentBanner");
  if (!banner) return;

  const acceptBtn = document.getElementById("consentAccept");
  const closeBtn = document.getElementById("consentClose");

  function clearAutoDismiss() {
    if (consentDismissTimer) {
      window.clearTimeout(consentDismissTimer);
      consentDismissTimer = null;
    }
    banner.classList.remove("is-leaving");
  }

  acceptBtn?.addEventListener("click", () => {
    clearAutoDismiss();
    try {
      localStorage.setItem(CONSENT_KEY, "granted");
    } catch (e) {}
    banner.hidden = true;
    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
    storageSet(THEME_KEY, currentTheme);
  });

  closeBtn?.addEventListener("click", () => {
    clearAutoDismiss();
    snoozeConsent();
    banner.hidden = true;
  });
}

const LANG_KEY = "site-lang";

function initLanguageToggle() {
  const toggleBtn = document.getElementById("langToggle");

  function applyLang(lang) {
    document.documentElement.setAttribute("lang", lang === "en" ? "en" : "ko");
    document.documentElement.setAttribute("data-lang", lang);

    document.querySelectorAll("[data-href-ko][data-href-en]").forEach((el) => {
      el.setAttribute("href", lang === "en" ? el.dataset.hrefEn : el.dataset.hrefKo);
    });

    document.querySelectorAll("[data-ko][data-en]").forEach((el) => {
      if (el.id === "testerPreview") return;
      const next = lang === "en" ? el.dataset.en : el.dataset.ko;
      if (next !== undefined) el.textContent = next;
    });
    if (toggleBtn) {
      toggleBtn.textContent = lang === "en" ? "KR" : "EN";
      toggleBtn.setAttribute(
        "aria-label",
        lang === "en" ? "언어 전환 (현재 영어)" : "언어 전환 (현재 한국어)"
      );
    }

    fitBannerWord();
    refreshOpenTypeLang();

    document.dispatchEvent(new CustomEvent("apex:langchange", { detail: { lang } }));
  }

  const stored = storageGet(LANG_KEY);
  applyLang(stored === "en" ? "en" : "ko");

  if (!toggleBtn) return;
  toggleBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-lang") === "en" ? "ko" : "en";
    applyLang(next);
    storageSet(LANG_KEY, next);
  });
}

const HEADER_OFFSET = 80;

function initAnchorJumps() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const id = link.getAttribute("href").slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;

    link.addEventListener("click", (e) => {
      e.preventDefault();
      const rect = target.getBoundingClientRect();
      const targetY = Math.max(0, rect.top + window.scrollY - HEADER_OFFSET);
      scrollPageTo(targetY, { immediate: true });
    });
  });
}

function initMainStage() {
  const mainStage = document.getElementById("main-screen");
  if (!mainStage) return;

  const skidCv = document.getElementById("cursor-trail");
  const gaugeOverlay = document.getElementById("intro-overlay");
  const gaugeCv = document.getElementById("intro-canvas");
  if (!skidCv || !gaugeOverlay || !gaugeCv) return;

  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
  scrollPageTo(0, { immediate: true });

  lockPageScroll(true, "intro-lock");

  const skidCtx = skidCv.getContext("2d");
  const velBarEl = document.getElementById("speed-meter-bar");
  const VEL_DOT_COUNT = 18;
  const velDots = [];
  if (velBarEl) {
    velBarEl.innerHTML = "";
    for (let i = 0; i < VEL_DOT_COUNT; i++) {
      const dot = document.createElement("span");
      dot.className = "speed-meter__dot";
      velBarEl.appendChild(dot);
      velDots.push(dot);
    }
  }
  const cursorEl = document.getElementById("cursor-dot");
  const STAGE_MQ_MOBILE = "(max-width: 640px)";
  const STAGE_VARIANTS = {
    desktop: {
      artId: "mainTitleArt",
      line1Id: "titleLine1",
      line2Id: "titleLine2",
      vbWidth: 2032.94,
    },
    mobile: {
      artId: "mainTitleArtMobile",
      line1Id: "titleLine1Mobile",
      line2Id: "titleLine2Mobile",
      vbWidth: 1179,
    },
  };

  let stageVariant = "desktop";
  let titleArt = null;
  let line1El = null;
  let line2El = null;
  let TITLE_VB_W = STAGE_VARIANTS.desktop.vbWidth;
  let titleParts = [];
  let partPhase = [];
  let pSX = [];
  let pSY = [];
  let partTrailPts = [];
  const activePartTrail = [];
  let skidLeftPart = null;
  let skidRightPart = null;

  const LINE_PROX_RADIUS = 420;
  let line1Prox = 0.5;
  let line2Prox = 0.5;
  let shakeCharge = 0;
  const STAGE_SHAKE = {
    desktop: { amp: 1, light: 0.9, parts: 1, idle: 1 },
    mobile: { amp: 0.4, light: 0.35, parts: 0.35, idle: 0.5 }
  };

  function resolveStageVariant() {
    if (!window.matchMedia || !window.matchMedia(STAGE_MQ_MOBILE).matches) return "desktop";
    const el = document.getElementById(STAGE_VARIANTS.mobile.artId);
    return el && el.querySelector(".title-part") ? "mobile" : "desktop";
  }

  function bindStageVariant(name) {
    const v = STAGE_VARIANTS[name] || STAGE_VARIANTS.desktop;
    stageVariant = name;
    const textGroup = document.getElementById("title-art-group");
    if (textGroup) textGroup.dataset.stageVariant = name;
    titleArt = document.getElementById(v.artId);
    line1El = document.getElementById(v.line1Id);
    line2El = document.getElementById(v.line2Id);
    TITLE_VB_W = v.vbWidth;
    SKID = SKID_PRESETS[name] || SKID_PRESETS.desktop;

    titleParts = titleArt ? Array.from(titleArt.querySelectorAll(".title-part")) : [];
    partPhase = titleParts.map((g) => {
      try {
        const b = g.getBBox();
        return (b.x + b.width / 2) / TITLE_VB_W;
      } catch (e) {
        return 0.5;
      }
    });
    pSX = titleParts.map(() => 0);
    pSY = titleParts.map(() => 0);
    partTrailPts = titleParts.map(() => []);
    activePartTrail.length = 0;

    skidLeftPart = null;
    skidRightPart = null;
    let minPh = Infinity;
    let maxPh = -Infinity;
    titleParts.forEach((g, i) => {
      if (partPhase[i] < minPh) {
        minPh = partPhase[i];
        skidLeftPart = g;
      }
      if (partPhase[i] > maxPh) {
        maxPh = partPhase[i];
        skidRightPart = g;
      }
    });

    Object.keys(STAGE_VARIANTS).forEach((key) => {
      if (key === name) return;
      const o = STAGE_VARIANTS[key];
      const el = document.getElementById(o.artId);
      if (el) el.querySelectorAll(".title-part").forEach((g) => (g.style.transform = ""));
      [o.line1Id, o.line2Id].forEach((id) => {
        const l = document.getElementById(id);
        if (l) l.style.transform = "";
      });
    });
  }

  let W = window.innerWidth;
  let H = window.innerHeight;
  skidCv.width = W;
  skidCv.height = H;
  const gc = gaugeCv.getContext("2d");

  function sizeGauge() {
    const r = gaugeCv.getBoundingClientRect();
    const w = Math.round(r.width) || window.innerWidth;
    const h = Math.round(r.height) || window.innerHeight;
    if (gaugeCv.width === w && gaugeCv.height === h) return;
    gaugeCv.width = w;
    gaugeCv.height = h;
  }
  sizeGauge();

  window.addEventListener("resize", () => {
    const nw = window.innerWidth;
    const nh = window.innerHeight;
    sizeGauge();
    if (nw === W && Math.abs(nh - H) <= H * URL_BAR_TOLERANCE) return;
    W = nw;
    H = nh;
    skidCv.width = W;
    skidCv.height = H;
    const next = resolveStageVariant();
    if (next !== stageVariant) bindStageVariant(next);
  });

  let curX = W / 2,
    curY = H / 2,
    prevX = W / 2,
    prevY = H / 2,
    mVX = 0,
    mVY = 0,
    mSpeed = 0;

  let isTouchInput = false;
  const TOUCH_VELOCITY_BOOST = 3.2;
  const TOUCH_AXIS_THRESHOLD = 6;
  let touchGestureAxis = null;
  let stageTouchStartX = 0,
    stageTouchStartY = 0;

  function onMove(x, y) {
    curX = x;
    curY = y;
    if (cursorEl) {
      cursorEl.style.transform =
        "translate3d(" + x + "px," + y + "px,0) translate(-50%,-50%)";
    }
  }

  mainStage.addEventListener("mousemove", (e) => {
    isTouchInput = false;
    onMove(e.clientX, e.clientY);
  });
  mainStage.addEventListener("mouseenter", () => cursorEl && cursorEl.classList.add("is-visible"));
  mainStage.addEventListener("mouseleave", () => cursorEl && cursorEl.classList.remove("is-visible"));

  mainStage.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches || !e.touches.length) return;
      isTouchInput = true;
      touchGestureAxis = null;
      const t = e.touches[0];
      stageTouchStartX = t.clientX;
      stageTouchStartY = t.clientY;
      onMove(t.clientX, t.clientY);
    },
    { passive: true }
  );

  mainStage.addEventListener(
    "touchmove",
    (e) => {
      if (!e.touches || !e.touches.length) return;
      isTouchInput = true;
      const t = e.touches[0];
      if (touchGestureAxis === null) {
        const dx = t.clientX - stageTouchStartX;
        const dy = t.clientY - stageTouchStartY;
        if (Math.abs(dx) > TOUCH_AXIS_THRESHOLD || Math.abs(dy) > TOUCH_AXIS_THRESHOLD) {
          touchGestureAxis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        }
      }
      if (touchGestureAxis === "y") return;
      onMove(t.clientX, t.clientY);
    },
    { passive: true }
  );

  const SKID_PRESETS = {
    desktop: {
      fade: 0.028,
      blur: 1.6,
      color: "232,0,45",
      edge: {
        minSpeed: 0.9,
        widthScale: 0.085,
        widthMax: 2.4,
        alphaScale: 1 / 26,
        alphaMax: 0.6,
        jitter: 1.6,
      },
      part: {
        tiltOn: 0.7,
        proxRadius: 340,
        widthBase: 0.35,
        widthScale: 1.4,
        widthMax: 5.5,
        alphaBase: 0.13,
        alphaScale: 0.15,
        alphaMax: 0.62,
        jitter: 1.3,
      },
    },

    mobile: {
      fade: 0.028,
      blur: 1.6,
      color: "232,0,45",
      edge: {
        minSpeed: 0.9,
        widthScale: 0.085,
        widthMax: 2.4,
        alphaScale: 1 / 26,
        alphaMax: 0.6,
        jitter: 1.6,
      },
      part: {
        tiltOn: 0.7,
        proxRadius: 220,
        widthBase: 0.35,
        widthScale: 1.4,
        widthMax: 5.5,
        alphaBase: 0.13,
        alphaScale: 0.15,
        alphaMax: 0.62,
        jitter: 1.3,
      },
    },
  };

  let SKID = SKID_PRESETS.desktop;

  bindStageVariant(resolveStageVariant());

  const TRAIL_KEEP = 3;
  const tL = [], tR = [];

  function makeSkidPoint(x, y, jitter, extra) {
    const p = {
      x: x + (Math.random() - 0.5) * jitter,
      y: y + (Math.random() - 0.5) * jitter,
    };
    if (extra) Object.assign(p, extra);
    return p;
  }

  function pushSkidPoint(trail, point) {
    trail.push(point);
    if (trail.length > TRAIL_KEEP) trail.shift();
    trail.pending = true;
  }

  function strokeNewSkidSegment(trail, styleFor) {
    if (!trail.pending) return;
    trail.pending = false;
    if (trail.length < 3) return;

    const [a, b, c] = trail.slice(-3);
    const style = styleFor(b);
    if (!style) return;

    skidCtx.strokeStyle = `rgba(${SKID.color},${Math.max(style.a, 0).toFixed(3)})`;
    skidCtx.lineWidth = Math.max(style.w, 0.1);
    skidCtx.beginPath();
    skidCtx.moveTo((a.x + b.x) * 0.5, (a.y + b.y) * 0.5);
    skidCtx.quadraticCurveTo(b.x, b.y, (b.x + c.x) * 0.5, (b.y + c.y) * 0.5);
    skidCtx.stroke();
  }

  function recT(s) {
    if (!skidLeftPart || !skidRightPart) return;
    if (!fontsReady) return;
    const rL = skidLeftPart.getBoundingClientRect();
    const rR = skidRightPart.getBoundingClientRect();
    const dx = mSpeed > 0.5 ? (mVX / mSpeed) * Math.min(mSpeed * 0.3, 6) : 0;
    const dy = mSpeed > 0.5 ? (mVY / mSpeed) * Math.min(mSpeed * 0.3, 6) : 0;
    const j = SKID.edge.jitter;

    pushSkidPoint(tL, makeSkidPoint(rL.left + rL.width * 0.5 - dx, rL.bottom - rL.height * 0.06 - dy, j, { speed: s }));
    pushSkidPoint(tR, makeSkidPoint(rR.left + rR.width * 0.5 - dx, rR.bottom - rR.height * 0.06 - dy, j, { speed: s }));
  }

  function drawSk() {
    if (SKID.fade > 0) {
      skidCtx.fillStyle = `rgba(0,0,0,${SKID.fade})`;
      skidCtx.fillRect(0, 0, W, H);
    }

    skidCtx.filter = SKID.blur > 0 ? `blur(${SKID.blur}px)` : "none";
    skidCtx.lineCap = "round";
    skidCtx.lineJoin = "round";

    const E = SKID.edge;
    const edgeStyle = (p) => {
      if (p.speed < E.minSpeed) return null;
      return {
        a: Math.min(p.speed * E.alphaScale, E.alphaMax),
        w: Math.min(p.speed * E.widthScale, E.widthMax),
      };
    };
    strokeNewSkidSegment(tL, edgeStyle);
    strokeNewSkidSegment(tR, edgeStyle);

    const P = SKID.part;
    const partStyle = (p) => {
      const sizeF = Math.min(p.tilt / 2.2 + p.spd / 12 + (p.prox || 0) * 2.6, 4.5);
      return {
        a: Math.min(P.alphaBase + sizeF * P.alphaScale, P.alphaMax),
        w: Math.min(P.widthBase + sizeF * P.widthScale, P.widthMax),
      };
    };
    partTrailPts.forEach((trail) => strokeNewSkidSegment(trail, partStyle));

    skidCtx.filter = "none";
  }

  let ox = 0,
    oy = 0,
    vx = 0,
    vy = 0,
    rotX = 0,
    rotY = 0;

  let blipCD = 3.5 + Math.random() * 2.5;
  let lastA = 0;

  function stepA(now) {
    const dt = Math.max(0, Math.min((now - lastA) * 0.001, 0.05));
    lastA = now;
    const t = now * 0.001;
    const vBoost = isTouchInput ? TOUCH_VELOCITY_BOOST : 1;
    mVX = mVX * 0.72 + (curX - prevX) * vBoost * 0.28;
    mVY = mVY * 0.72 + (curY - prevY) * vBoost * 0.28;
    mSpeed = Math.sqrt(mVX * mVX + mVY * mVY);
    prevX = curX; prevY = curY;
    const shake = STAGE_SHAKE[stageVariant] || STAGE_SHAKE.desktop;
    const iS = Math.max(0, 1 - mSpeed / 14) * shake.idle;

    const eH = Math.sin(t * 26.0) * 0.70 + Math.sin(t * 52.1) * 0.28 + Math.sin(t * 78.3) * 0.11;
    const eV = Math.cos(t * 25.8) * 0.46 + Math.cos(t * 51.7) * 0.17;
    const eng = { x: eH * 1.7 * iS, y: eV * 1.0 * iS, rx: eV * 0.22 * iS, ry: eH * 0.14 * iS };

    const beat = (Math.sin(t * 12.6) + Math.sin(t * 13.0)) * 0.5;
    const sX = beat * 0.7 * iS, sY = beat * 0.8 * iS;
    const sRX = beat * 0.10 * iS, sRY = beat * 0.06 * iS;

    blipCD -= dt;
    if (blipCD <= 0 && iS > 0.55) {
      vx += (Math.random() - 0.5) * 20 * iS;
      vy += (Math.random() - 0.5) * 6 * iS;
      blipCD = 3.2 + Math.random() * 2.8;
    }

    if (mSpeed > 1.5) {
      const f = Math.min(mSpeed * 0.21, 25);
      vx += (mVX / mSpeed) * f;
      vy += (mVY / mSpeed) * f;
    }

    vx += (sX - ox) * 0.055; vy += (sY - oy) * 0.055;
    vx *= 0.52; vy *= 0.52;
    ox += vx; oy += vy;

    rotY += (Math.max(-8, Math.min(8, -vx * 0.20 + sRY)) - rotY) * 0.22;
    rotX += (Math.max(-4, Math.min(4, vy * 0.13 + sRX)) - rotX) * 0.22;

    const lightBoost = 1 + shakeCharge * shake.light;
    const baseAmp1 = (0.55 + line1Prox * 0.85) * lightBoost * shake.amp;
    const baseAmp2 = (0.55 + line2Prox * 0.85) * lightBoost * shake.amp;
    if (shake.amp && line1El) {
      line1El.style.transform = `translate(${((ox + eng.x) * baseAmp1).toFixed(2)}px,${((oy + eng.y) * baseAmp1).toFixed(2)}px) rotateY(${((rotY + eng.ry) * baseAmp1).toFixed(2)}deg) rotateX(${((rotX + eng.rx) * baseAmp1).toFixed(2)}deg)`;
    }
    if (shake.amp && line2El) {
      line2El.style.transform = `translate(${((ox + eng.x) * baseAmp2).toFixed(2)}px,${((oy + eng.y) * baseAmp2).toFixed(2)}px) rotateY(${((rotY + eng.ry) * baseAmp2).toFixed(2)}deg) rotateX(${((rotX + eng.rx) * baseAmp2).toFixed(2)}deg)`;
    }

    if (titleParts.length && shake.parts) {
      const in2 = Math.min(mSpeed / 22, 1);
      activePartTrail.length = 0;
      titleParts.forEach((g, i) => {
        const ph = partPhase[i];
        const dX = (mVX * 0.9 + Math.sin(t * 9.5 + ph * 6.283) * 2.2 * in2) * (0.4 + ph * 0.6);
        const dY = (mVY * 0.5 + Math.cos(t * 8.7 + ph * 6.283) * 1.4 * in2) * (0.4 + (1 - ph) * 0.6);
        pSX[i] += (dX * 0.05 - pSX[i]) * 0.16;
        pSY[i] += (dY * 0.05 - pSY[i]) * 0.16;
        g.style.transform = `skewX(${pSX[i].toFixed(2)}deg) skewY(${pSY[i].toFixed(2)}deg)`;

        const tilt = Math.abs(pSX[i]) + Math.abs(pSY[i]);
        if (tilt > SKID.part.tiltOn) {
          activePartTrail.push({ i, tilt });
        } else if (partTrailPts[i].length) {
          partTrailPts[i].length = 0;
        }
      });
    }
    if (mSpeed > 1.5) {
      recT(mSpeed);
    } else if (tL.length) {
      tL.length = 0;
      tR.length = 0;
    }
    activePartTrail.forEach(({ i, tilt }) => {
      const g = titleParts[i];
      const r = g.getBoundingClientRect();
      const cx = r.left + r.width * 0.5;
      const cy = r.top + r.height * 0.5;
      const dist = Math.hypot(cx - curX, cy - curY);
      const prox = Math.max(0, 1 - dist / SKID.part.proxRadius);
      pushSkidPoint(
        partTrailPts[i],
        makeSkidPoint(cx, r.bottom - r.height * 0.08, SKID.part.jitter, { tilt, spd: mSpeed, prox })
      );
    });

    if (line1El) {
      const r1 = line1El.getBoundingClientRect();
      const d1 = Math.hypot(r1.left + r1.width * 0.5 - curX, r1.top + r1.height * 0.5 - curY);
      line1Prox = Math.max(0, 1 - d1 / LINE_PROX_RADIUS);
    }
    if (line2El) {
      const r2 = line2El.getBoundingClientRect();
      const d2 = Math.hypot(r2.left + r2.width * 0.5 - curX, r2.top + r2.height * 0.5 - curY);
      line2Prox = Math.max(0, 1 - d2 / LINE_PROX_RADIUS);
    }

    drawSk();

    const pct = Math.min((mSpeed / 160) * 100, 100);
    if (velDots.length) {
      const litCount = Math.round((pct / 100) * velDots.length);
      velDots.forEach((dot, i) => {
        dot.classList.toggle("is-lit", i < litCount);
      });
    }
  }

  const infoFontFamily =
    getComputedStyle(document.documentElement).getPropertyValue("--info-font").trim() ||
    "sans-serif";
  const MAX_RPM = 16000;
  const PEAK_RPM = 15500;
  const REDLINE = 14500;
  const INTRO_HOLD_MS = 1500;
  const INTRO_FADE_MS = 500;
  const INTRO_WAIT_HINT_MS = 2000;
  const INTRO_MAX_WAIT_MS = 12000;

  const waitNote = document.getElementById("intro-wait");
  let waitHintTimer = null;
  function showWaitHint(on) {
    if (!waitNote) return;
    waitNote.hidden = !on;
  }
  const S_RAD = (150 * Math.PI) / 180;
  const SPAN_RAD = (240 * Math.PI) / 180;
  const PI2 = Math.PI * 2;

  function rpmToAngle(rpm) {
    return S_RAD + Math.min(rpm / MAX_RPM, 1) * SPAN_RAD;
  }

  let gaugeDone = false;
  let screensaverActive = false;
  const hasGsap = typeof window.gsap !== "undefined";
  const gs = { rpm: 0, gear: 1 };

  let needleAngle = S_RAD;
  let needleVel = 0;
  let lastGT = 0;
  let gearFlash = 0;

  function shiftGear(g) {
    gs.gear = g;
    gearFlash = 1;
  }

  function drawF1Info(cx, cy, R) {
    const fs = Math.max(6.5, R * 0.086);
    const fsS = Math.max(5.5, R * 0.068);
    const DIM = (a) => `rgba(255,255,255,${a})`;
    const RED = (a) => `rgba(232,0,45,${a})`;

    const LH = 1.15;
    const SIDE = 0.82;
    const fsSide = fs * SIDE;
    const fsSideS = fsS * SIDE;
    const lead = fsSide * LH;
    const blockTop = cy - lead * 1.5;
    const lineY = (i) => blockTop + lead * i;

    gc.textBaseline = "middle";

    gc.textAlign = "center";
    gc.font = `${fs}px ${infoFontFamily}`;
    gc.fillStyle = DIM(0.2);
    gc.fillText("APEX GRAND PRIX", cx, cy - R * 1.3);
    gc.font = `${fsS}px ${infoFontFamily}`;
    gc.fillStyle = DIM(0.11);
    gc.fillText("CIRCUIT LENGTH  5.412 KM       LAP 41 / 58", cx, cy - R * 1.18);

    const SIDE_GAP = 1.75;
    const lx = cx - R * SIDE_GAP;
    const rx = cx + R * SIDE_GAP;

    gc.textAlign = "left";
    gc.font = `${fsSideS}px ${infoFontFamily}`;
    gc.fillStyle = DIM(0.14);
    gc.fillText("DRIVER", lx, lineY(0));
    gc.font = `${fsSideS}px ${infoFontFamily}`;
    gc.fillStyle = DIM(0.13);
    gc.fillText("CAR #07 / RS-X", lx, lineY(1));
    gc.fillStyle = DIM(0.1);
    gc.fillText("COMPOUND  ● SOFT", lx, lineY(2));

    gc.textAlign = "right";
    gc.font = `${fsSideS}px ${infoFontFamily}`;
    gc.fillStyle = DIM(0.14);
    gc.fillText("TELEMETRY", rx, lineY(0));
    const spd = Math.round((gs.rpm / MAX_RPM) * 341);
    gc.font = `${fsSide}px ${infoFontFamily}`;
    gc.fillStyle = DIM(0.28);
    gc.fillText(`${spd}  km/h`, rx, lineY(1));
    gc.font = `${fsSideS}px ${infoFontFamily}`;
    gc.fillStyle = DIM(0.13);
    gc.fillText("POSITION  P1", rx, lineY(2));
    gc.fillStyle = gs.rpm >= REDLINE ? RED(0.38) : DIM(0.1);
    gc.fillText("ENGINE MODE  11", rx, lineY(3));

    if (W > 900) {
      gc.textAlign = "center";
      gc.font = `${fsS}px ${infoFontFamily}`;
      gc.font = `${Math.max(5, R * 0.056)}px ${infoFontFamily}`;
      gc.fillStyle = DIM(0.18);
      gc.fillText("POWER UNIT — HYBRID  1.6L TURBO V6  +  MGU-K / MGU-H", cx, cy + R * 1.24);
    }
  }

  function renderGauge(now) {
    if (gaugeDone) return;

    const dt = lastGT ? Math.max(0, Math.min((now - lastGT) / 1000, 0.05)) : 0.016;
    lastGT = now;

    const GW = gaugeCv.width;
    const GH = gaugeCv.height;
    const cx = GW / 2;
    const cy = GH / 2;
    const R_SCALE = GW > 900 ? 0.495 : 1;
    const R = Math.min(GW, GH) * 0.28 * R_SCALE;

    gc.clearRect(0, 0, GW, GH);
    gc.fillStyle = "#000";
    gc.fillRect(0, 0, GW, GH);

    const rpm = gs.rpm;
    const inRedline = rpm >= REDLINE;
    const arcAngle = rpmToAngle(rpm);
    const redAngle = rpmToAngle(REDLINE);
    const bw = Math.max(1, R * 0.0035);

    const K = 190;
    const DAMP = 42;
    const acc = K * (arcAngle - needleAngle) - DAMP * needleVel;
    needleVel += acc * dt;
    const MAX_NEEDLE_VEL = 60;
    if (needleVel > MAX_NEEDLE_VEL) needleVel = MAX_NEEDLE_VEL;
    else if (needleVel < -MAX_NEEDLE_VEL) needleVel = -MAX_NEEDLE_VEL;
    needleAngle += needleVel * dt;

    const shake = inRedline ? (Math.random() - 0.5) * 0.013 : 0;
    const nAngle = needleAngle + shake;

    gearFlash = Math.max(0, gearFlash - dt * 7);

    gc.beginPath();
    gc.arc(cx, cy, R, S_RAD, S_RAD + SPAN_RAD, false);
    gc.strokeStyle = "rgba(255,255,255,0.06)";
    gc.lineWidth = bw;
    gc.stroke();

    if (rpm > 0) {
      gc.beginPath();
      gc.arc(cx, cy, R, S_RAD, Math.min(arcAngle, redAngle), false);
      gc.strokeStyle = "rgba(255,255,255,0.85)";
      gc.lineWidth = bw * 1.1;
      gc.stroke();
    }

    if (inRedline) {
      gc.beginPath();
      gc.arc(cx, cy, R, redAngle, arcAngle, false);
      gc.strokeStyle = "rgba(200,0,0,0.88)";
      gc.lineWidth = bw * 1.25;
      gc.stroke();
    }

    for (let r = 0; r <= MAX_RPM; r += 500) {
      const a = rpmToAngle(r);
      const isMajor = r % 2000 === 0;
      const isRed = r >= REDLINE;
      const len = isMajor ? R * 0.068 : R * 0.034;
      const lw = isMajor ? Math.max(1.5, R * 0.0042) : Math.max(0.5, R * 0.0018);

      gc.beginPath();
      gc.moveTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len));
      gc.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      gc.strokeStyle = isRed
        ? `rgba(200,0,0,${isMajor ? 0.78 : 0.4})`
        : `rgba(255,255,255,${isMajor ? 0.62 : 0.26})`;
      gc.lineWidth = lw;
      gc.stroke();
    }

    gc.textAlign = "center";
    gc.textBaseline = "middle";
    gc.font = `${Math.max(7, R * 0.076)}px ${infoFontFamily}`;
    for (let r = 0; r <= MAX_RPM; r += 2000) {
      const a = rpmToAngle(r);
      const lx = cx + Math.cos(a) * R * 0.82;
      const ly = cy + Math.sin(a) * R * 0.82;
      gc.fillStyle = r >= REDLINE ? "rgba(200,60,60,0.50)" : "rgba(255,255,255,0.30)";
      gc.fillText(String(r / 1000), lx, ly);
    }
    gc.font = `${Math.max(5.5, R * 0.056)}px ${infoFontFamily}`;
    gc.fillStyle = "rgba(255,255,255,0.24)";
    gc.fillText("× 1000  r/min", cx, cy + R * 0.54);

    gc.beginPath();
    gc.moveTo(cx + Math.cos(nAngle + Math.PI) * R * 0.13, cy + Math.sin(nAngle + Math.PI) * R * 0.13);
    gc.lineTo(cx + Math.cos(nAngle) * R * 0.86, cy + Math.sin(nAngle) * R * 0.86);
    gc.strokeStyle = "rgba(255,255,255,0.95)";
    gc.lineWidth = Math.max(1.5, R * 0.006);
    gc.lineCap = "round";
    gc.stroke();

    gc.beginPath();
    gc.arc(cx, cy, R * 0.022, 0, PI2);
    gc.fillStyle = "#fff";
    gc.fill();

    if (!screensaverActive) {
      const gear = String(
        Math.min(100, Math.max(1, Math.round((gs.rpm / PEAK_RPM) * 100)))
      );
      const gAlpha = 0.38 + gearFlash * 0.32;
      const gG = Math.round(255 - gearFlash * 160);
      const gB = Math.round(255 - gearFlash * 200);
      gc.font = `${Math.max(8, R * (W > 640 ? 0.082 : 0.115))}px ${infoFontFamily}`;
      gc.fillStyle = `rgba(255,${gG},${gB},${gAlpha.toFixed(2)})`;
      gc.textAlign = "center";
      gc.textBaseline = "middle";
      gc.fillText(gear, cx, cy + R * 0.2 + 8);
    }

    drawF1Info(cx, cy, R);
  }

  let gaugeTL = null;

  function fadeOutIntro() {
    if (gaugeDone || !gaugeOverlay) return;
    if (hasGsap) {
      document.body.classList.add("intro-fading");
      gaugeOverlay.style.willChange = "opacity";
      window.gsap.to(gaugeOverlay, {
        opacity: 0,
        duration: INTRO_FADE_MS / 1000,
        ease: "power1.in",
        onComplete: endIntro,
      });
    } else {
      endIntro();
    }
  }

  window.setTimeout(function () {
    document.documentElement.removeAttribute("data-morph-defer");
  }, 15000);

  function endIntro() {
    if (gaugeDone) return;
    document.removeEventListener("keydown", onIntroKey);
    window.clearTimeout(waitHintTimer);
    showWaitHint(false);
    if (gaugeOverlay) {
      gaugeOverlay.style.display = "none";
      gaugeOverlay.style.willChange = "";
    }
    document.body.classList.remove("intro-fading");
    gaugeDone = true;
    lockPageScroll(false, "intro-lock");
    document.dispatchEvent(new CustomEvent("intro:done"));
    document.documentElement.removeAttribute("data-morph-defer");
  }

  function skipIntro() {
    if (gaugeTL) gaugeTL.kill();
    endIntro();
  }
  if (gaugeOverlay) {
    gaugeOverlay.addEventListener("click", (e) => {
      e.stopPropagation();
      skipIntro();
    });
  }

  function onIntroKey(e) {
    if (e.key !== "Escape" && e.key !== "Tab") return;
    skipIntro();
  }
  document.addEventListener("keydown", onIntroKey);

  window.setTimeout(endIntro, INTRO_MAX_WAIT_MS + INTRO_HOLD_MS + INTRO_FADE_MS + 8000);

  const GEAR_STEPS = [
    { gear: 2, rpm: 7400, dip: 5200, duration: 0.42, ease: "power1.inOut" },
    { gear: 3, rpm: 9800, dip: 7300, duration: 0.36, ease: "sine.inOut" },
    { gear: 4, rpm: 11200, dip: 9000, duration: 0.3, ease: "sine.inOut" },
    { gear: 5, rpm: 12300, dip: 10400, duration: 0.26, ease: "sine.inOut" },
    { gear: 6, rpm: 13100, dip: 11600, duration: 0.22, ease: "sine.inOut" },
    { gear: 7, rpm: 13700, dip: 12500, duration: 0.19, ease: "sine.inOut" },
    { gear: 8, rpm: 14200, dip: 13200, duration: 0.17, ease: "sine.inOut" },
    { gear: 9, rpm: 14600, dip: 13800, duration: 0.15, ease: "sine.inOut" },
    { gear: 10, rpm: 14900, dip: 14300, duration: 0.13, ease: "sine.inOut" },
  ];

  function whenPageReady(cb) {
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      cb();
    };
    const waits = [];
    if (document.readyState === "complete") waits.push(Promise.resolve());
    else waits.push(new Promise((r) => window.addEventListener("load", r, { once: true })));
    if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready.catch(() => {}));
    Promise.all(waits).then(fire, fire);
    window.setTimeout(fire, INTRO_MAX_WAIT_MS);
  }

  function buildGaugeTimeline(onFinish) {
    const tl = window.gsap.timeline({ onComplete: onFinish });

    tl.call(() => shiftGear(1))
      .to(gs, { rpm: 1900, duration: 0.28, ease: "power2.out" })
      .to(gs, { rpm: 1900, duration: 0.12 });

    GEAR_STEPS.forEach((step, i) => {
      tl.call(() => shiftGear(step.gear));
      if (i > 0) {
        tl.to(gs, { rpm: step.dip, duration: Math.max(0.05, step.duration * 0.3), ease: "sine.out" });
      }
      tl.to(gs, { rpm: step.rpm, duration: step.duration, ease: step.ease });
    });

    tl.to(gs, { rpm: 14100, duration: 0.08, ease: "power1.out" })
      .addPause(undefined, () => {
        waitHintTimer = window.setTimeout(() => showWaitHint(true), INTRO_WAIT_HINT_MS);
        whenPageReady(() => {
          window.clearTimeout(waitHintTimer);
          showWaitHint(false);
          tl.play();
        });
      })
      .to(gs, { rpm: PEAK_RPM, duration: 0.18, ease: "power3.in" })
      .to(gs, { rpm: PEAK_RPM, duration: INTRO_HOLD_MS / 1000 });

    return tl;
  }

  const IDLE_LO = 900;
  const IDLE_HI = 2600;

  function buildIdleTimeline() {
    const tl = window.gsap.timeline({ repeat: -1 });
    tl.to(gs, { rpm: IDLE_HI, duration: 1.6, ease: "sine.inOut" })
      .to(gs, { rpm: IDLE_LO + 260, duration: 1.9, ease: "sine.inOut" })
      .to(gs, { rpm: IDLE_HI - 420, duration: 1.4, ease: "sine.inOut" })
      .to(gs, { rpm: IDLE_LO, duration: 2.1, ease: "sine.inOut" });
    return tl;
  }

  if (hasGsap) {
    gaugeTL = buildGaugeTimeline(fadeOutIntro);
  } else {
    endIntro();
  }

  const SCREENSAVER_IDLE_MS = 60 * 1000;

  function showScreensaver() {
    if (screensaverActive || !gaugeOverlay || !hasGsap) return;
    if (prefersReducedMotion()) return;
    screensaverActive = true;

    gs.rpm = IDLE_LO;
    gs.gear = 1;
    gearFlash = 0;
    needleAngle = rpmToAngle(IDLE_LO);
    needleVel = 0;
    gaugeDone = false;
    gaugeOverlay.style.display = "";
    gaugeOverlay.style.opacity = "1";
    sizeGauge();

    if (gaugeTL) gaugeTL.kill();
    gaugeTL = buildIdleTimeline();

    wakeLoop();
  }

  function hideScreensaver() {
    if (!screensaverActive) return;
    screensaverActive = false;
    if (gaugeTL) gaugeTL.kill();
    gaugeTL = null;
    gaugeDone = true;
    if (gaugeOverlay) {
      gaugeOverlay.style.display = "none";
      gaugeOverlay.style.opacity = "";
    }
  }

  function initScreensaver() {
    if (!gaugeOverlay || !hasGsap) return;
    let idleTimer = null;

    function resetIdleTimer() {
      hideScreensaver();
      if (idleTimer) window.clearTimeout(idleTimer);
      if (prefersReducedMotion()) return;
      idleTimer = window.setTimeout(showScreensaver, SCREENSAVER_IDLE_MS);
    }

    ["mousemove", "mousedown", "keydown", "click", "scroll", "wheel", "touchstart", "resize"].forEach((type) => {
      window.addEventListener(type, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();
  }

  let isStageVisible = true;
  let loopRunning = false;

  function loop(now) {
    lastA = lastA || now;
    stepA(now);
    if (!gaugeDone) renderGauge(now);
    if (isStageVisible || screensaverActive) {
      requestAnimationFrame(loop);
    } else {
      loopRunning = false;
    }
  }

  function wakeLoop() {
    if (!loopStarted || loopRunning) return;
    loopRunning = true;
    lastA = performance.now();
    requestAnimationFrame(loop);
  }

  let fontsReady = false;

  let loopStarted = false;
  function startLoop() {
    if (loopStarted) return;
    loopStarted = true;
    loopRunning = true;
    lastA = performance.now();
    requestAnimationFrame(loop);
  }

  if ("IntersectionObserver" in window) {
    const stageVisObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isStageVisible = entry.isIntersecting;
          if (isStageVisible) wakeLoop();
        });
      },
      { threshold: 0 }
    );
    stageVisObserver.observe(mainStage);
  }

  if (document.fonts && document.fonts.ready) {
    const markFontsReady = () => { fontsReady = true; };
    document.fonts.ready.then(markFontsReady).catch(markFontsReady);
    window.setTimeout(markFontsReady, 2000);
  } else {
    fontsReady = true;
  }
  startLoop();

  const SHAKE_RAMP_AT = 12000;

  function rampShakeCharge() {
    const DURATION = 1200;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / DURATION);
      shakeCharge = t * t * (3 - 2 * t);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  window.setTimeout(rampShakeCharge, SHAKE_RAMP_AT);

  initScreensaver();
}

const SHARE_FEEDBACK_MS = 1600;

function initShareButton() {
  const btn = document.getElementById("shareBtn");
  if (!btn) return;

  const MESSAGES = {
    copied: { ko: "링크 복사됨", en: "Link copied" },
    noCopy: { ko: "복사할 수 없음", en: "Copying unavailable" },
    failed: { ko: "공유하지 못함", en: "Couldn't share" },
  };
  const say = (key) => MESSAGES[key][currentLang() === "en" ? "en" : "ko"];

  const label = () =>
    (currentLang() === "en" ? btn.dataset.en : btn.dataset.ko) || btn.textContent;
  let restoreTimer = null;
  function flash(key) {
    btn.textContent = say(key);
    if (restoreTimer) window.clearTimeout(restoreTimer);
    restoreTimer = window.setTimeout(() => {
      btn.textContent = label();
    }, SHARE_FEEDBACK_MS);
  }

  btn.addEventListener("click", async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url: url });
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        flash("copied");
        return;
      }
      flash("noCopy");
    } catch (err) {
      if (err && err.name === "AbortError") return;
      flash("failed");
    }
  });
}

function initMailCopyButton() {
  const btn = document.getElementById("mailCopyBtn");
  const addr = document.getElementById("ctaMailAddress");
  if (!btn || !addr) return;

  const MESSAGES = {
    copied: { ko: "복사됨", en: "Copied" },
    noCopy: { ko: "복사할 수 없음", en: "Copying unavailable" },
  };
  const say = (key) => MESSAGES[key][currentLang() === "en" ? "en" : "ko"];
  const label = () =>
    (currentLang() === "en" ? btn.dataset.en : btn.dataset.ko) || btn.textContent;

  let restoreTimer = null;
  function flash(key) {
    btn.textContent = say(key);
    if (restoreTimer) window.clearTimeout(restoreTimer);
    restoreTimer = window.setTimeout(() => {
      btn.textContent = label();
    }, SHARE_FEEDBACK_MS);
  }

  btn.addEventListener("click", async () => {
    const mail = addr.textContent.trim();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(mail);
        flash("copied");
        return;
      }
      flash("noCopy");
    } catch (err) {
      flash("noCopy");
    }
  });
}

const GLYPH_DUO_POOL =
  "에르마노스로드리게스스즈카마리나베이스트리트서킷스쿠데리아페라리다운포스드래그에어로다이나믹스드리프트탑스피드레코드라인그랜드스탠드서스펜션슬립스트리밍그리드리타이어포메이션랩슬릭타이어팀오더머신섀시윙렛모노코크파크페르메바디워크터뷸런스바지보드세이프티카포디엄블리스터마샬타이어배리어드라이브스루오스카피아스트리81아르비드린드블라드포뮬러원월드챔피언십";

function initSectionNavAlign() {
  var nav = document.getElementById("sectionNav");
  var grid = document.getElementById("glyphGrid");
  if (!nav || !grid) return;

  function apply() {
    var box = grid.getBoundingClientRect();
    if (!box.width) return;
    document.documentElement.style.setProperty(
      "--section-nav-left", Math.round(box.left) + "px"
    );
  }

  apply();
  window.addEventListener("resize", apply);
  document.addEventListener("intro:done", apply);
}

function initStackBuyCta() {
  var btn = document.getElementById("stackBuy");
  var target = document.getElementById("Buy");
  if (!btn || !target || typeof window.IntersectionObserver !== "function") return;

  new window.IntersectionObserver(function (entries) {
    var top = entries[entries.length - 1].boundingClientRect.top;
    btn.classList.toggle("is-at-target", top < window.innerHeight);
  }, { threshold: 0 }).observe(target);
}

function initSectionNav() {
  const nav = document.getElementById("sectionNav");
  if (!nav) return;
  const items = [...nav.querySelectorAll(".section-nav__item")];
  const targets = items.map((a) => document.querySelector(a.getAttribute("href")));
  let current = -1;

  const END_SLACK = 60;

  function read() {
    const mid = window.innerHeight / 2;
    const first = targets[0];
    const beforeStart = !first || first.getBoundingClientRect().top > mid;

    const doc = document.documentElement;
    const atEnd =
      window.innerHeight + window.scrollY >= doc.scrollHeight - END_SLACK;

    if (beforeStart || atEnd) {
      if (nav.classList.contains("is-hidden")) return null;
      return () => {
        nav.classList.add("is-hidden");
        items.forEach((a) => {
          a.classList.remove("is-active");
          a.removeAttribute("aria-current");
        });
      };
    }

    let found = -1;
    targets.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) found = i;
    });
    const wasHidden = nav.classList.contains("is-hidden");
    const sectionChanged = found >= 0 && found !== current;
    if (!wasHidden && !sectionChanged) return null;
    if (sectionChanged) current = found;
    const active = current;
    return () => {
      nav.classList.remove("is-hidden");
      items.forEach((a, i) => {
        a.classList.toggle("is-active", i === active);
        if (i === active) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    };
  }

  scrollFrame.add(read);
  const w = read();
  if (w) w();
}

function initGlyphDuo() {
  const cells = document.querySelectorAll(
    ".glyph-duo:not([data-duo-static]) .glyph-duo__cell span"
  );
  if (!cells.length) return;

  const MIN_MS = 600;
  const MAX_MS = 2000;

  function tick(el) {
    let next = el.textContent;
    while (next === el.textContent) {
      next = GLYPH_DUO_POOL.charAt(Math.floor(Math.random() * GLYPH_DUO_POOL.length));
    }
    el.textContent = next;
    window.setTimeout(() => tick(el), MIN_MS + Math.random() * (MAX_MS - MIN_MS));
  }

  if (prefersReducedMotion()) return;

  cells.forEach((el) => {
    window.setTimeout(() => tick(el), 200 + Math.random() * (MAX_MS - MIN_MS));
  });
}

function initFlipGrid() {
  const grid = document.getElementById("flip-grid");
  if (!grid) return;
  const turns = new WeakMap();

  const MODE = grid.dataset.flipMode === "turn" ? "turn" : "swap";

  function turn(cell) {
    if (!cell || !grid.contains(cell)) return;
    const n = (turns.get(cell) || 0) + 1;
    turns.set(cell, n);
    cell.style.setProperty("--turn", n * 90 + "deg");
  }

  function swap(cell) {
    if (!cell || !grid.contains(cell)) return;
    const el = cell.querySelector("span i") || cell.querySelector("span") || cell;
    let next = el.textContent;
    while (next === el.textContent) {
      next = GLYPH_DUO_POOL.charAt(Math.floor(Math.random() * GLYPH_DUO_POOL.length));
    }
    el.textContent = next;
  }

  const change = MODE === "turn" ? turn : swap;

  grid.querySelectorAll(".flip-cell").forEach((cell) => {
    cell.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") change(cell);
    });
  });

  let last = null;
  grid.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      if (!t) return;
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const cell = el && el.closest && el.closest(".flip-cell");
      if (cell && cell !== last) {
        last = cell;
        change(cell);
      }
    },
    { passive: true }
  );
  grid.addEventListener("touchend", () => { last = null; }, { passive: true });

  const STEP_MS = Number(grid.dataset.flipStep) || 130;

  const EXACT = grid.hasAttribute("data-flip-exact");
  const cells = [...grid.querySelectorAll(".flip-cell")];

  let inView = [];

  function layout() {
    const cs = getComputedStyle(grid);
    const cols = parseInt(cs.getPropertyValue("--flip-cols"), 10) || 5;
    const box = grid.getBoundingClientRect();
    const measured = cells[0] ? cells[0].getBoundingClientRect().width : 0;
    const cell = measured > 0 ? measured : box.width / Math.max(1, cols - 1);
    if (cell <= 0) return;
    const rows = EXACT
      ? Math.max(1, Math.round(box.height / cell))
      : Math.ceil(box.height / cell) + 1;
    const shown = Math.min(cells.length, cols * rows);
    cells.forEach((c, i) => {
      if (i < shown) c.removeAttribute("hidden");
      else c.setAttribute("hidden", "");
    });

    const view = grid.parentElement
      ? grid.parentElement.getBoundingClientRect()
      : box;
    const SLACK = 2;
    const shownCells = cells.filter((c) => !c.hasAttribute("hidden"));
    inView = shownCells.filter((c) => {
      const r = c.getBoundingClientRect();
      return (
        r.left >= view.left - SLACK &&
        r.right <= view.right + SLACK &&
        r.top >= view.top - SLACK &&
        r.bottom <= view.bottom + SLACK
      );
    });
    if (!inView.length) inView = shownCells;
  }

  layout();
  window.addEventListener("resize", layout);

  function reveal() {
    const shown = cells.filter((c) => !c.hasAttribute("hidden"));
    shown.forEach((cell, i) => {
      cell.style.setProperty("--in-delay", (i * 0.028).toFixed(3) + "s");
    });
    requestAnimationFrame(() => grid.classList.add("is-in"));
  }
  reveal();
  let stepTimer = null;

  function stopAuto() {
    if (stepTimer) window.clearInterval(stepTimer);
    stepTimer = null;
  }

  function startAuto() {
    if (stepTimer) return;
    stepTimer = window.setInterval(() => {
      if (!inView.length) return;
      change(inView[Math.floor(Math.random() * inView.length)]);
    }, STEP_MS);
  }

  if (!prefersReducedMotion()) {
    startAuto();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopAuto();
      else startAuto();
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) {
            stopAuto();
            return;
          }
          layout();
          startAuto();
        });
      }).observe(grid);
    }
  }
}

const HSHIFT_RUN_RATIO = 0.6;

const HSHIFT_DIRS = [
  [0, -1],
  [1, 1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
];
const HSHIFT_TRAVEL_Y = 100;
const HSHIFT_TRAVEL_X = 20;
const HSHIFT_PUSH = 18;
const HSHIFT_ARRIVE = 0.7;
const HSHIFT_HIT = 0.05;
const HSHIFT_SETTLE = 0.25;

const HSHIFT_STEP_LIFT = "random(-180, 180, 45)";
const HSHIFT_STEP_TURN = "random([-90, 90])";
const HSHIFT_STEPS = 4;

function initHorizontalType() {
  const line = document.getElementById("hshiftLine");
  if (!line) return;
  const stage = line.parentElement;
  const track = line.closest(".hshift-track");
  if (!stage || !track) return;

  const hard = line.dataset.hshift === "hard";

  const words = Array.prototype.slice.call(
    line.querySelectorAll(".hshift__word")
  );
  if (!words.length) return;

  const sentence = words
    .map(function (w) { return w.textContent.trim(); })
    .join(" ");

  const chars = [];
  words.forEach(function (word) {
    const text = word.textContent.trim();
    word.textContent = "";
    Array.from(text).forEach(function (ch) {
      const span = document.createElement("span");
      span.className = "hshift__char";
      const inner = document.createElement("span");
      inner.className = "hshift__jolt";
      inner.textContent = ch;
      span.appendChild(inner);
      word.appendChild(span);
      chars.push(span);
    });
  });

  const alt = document.createElement("p");
  alt.className = "visually-hidden";
  alt.textContent = sentence;
  stage.insertBefore(alt, line);
  line.setAttribute("aria-hidden", "true");

  const gsapLib = window.gsap;
  const ST = window.ScrollTrigger;
  if (!gsapLib || !ST) return;
  gsapLib.registerPlugin(ST);

  let dist = 0;
  function measure() {
    dist = Math.max(0, line.scrollWidth - stage.clientWidth);
    const floor = window.innerHeight * 0.6;
    track.style.setProperty(
      "--hshift-run",
      Math.round(Math.max(dist * HSHIFT_RUN_RATIO, floor)) + "px"
    );
  }
  measure();
  ST.addEventListener("refreshInit", measure);

  const scrollTween = gsapLib.to(line, {
    x: function () { return -dist; },
    ease: "none",
    scrollTrigger: {
      trigger: track,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      invalidateOnRefresh: true,
    },
  });

  if (!prefersReducedMotion()) {
    const stFor = function (ch) {
      return {
        trigger: ch,
        containerAnimation: scrollTween,
        start: "left 100%",
        end: "left 40%",
        scrub: true,
      };
    };

    if (hard) {
      chars.forEach(function (ch, i) {
        const dir = HSHIFT_DIRS[i % HSHIFT_DIRS.length];
        const tl = gsapLib.timeline({ scrollTrigger: stFor(ch) });

        tl.fromTo(
          ch,
          {
            xPercent: dir[0] * HSHIFT_TRAVEL_X,
            yPercent: dir[1] * HSHIFT_TRAVEL_Y,
          },
          {
            xPercent: 0,
            yPercent: 0,
            ease: "none",
            duration: HSHIFT_ARRIVE,
          }
        );

        const next = chars[i + 1];
        const jolt = next && next.firstElementChild;
        if (jolt) {
          tl.fromTo(
            jolt,
            { xPercent: 0 },
            { xPercent: HSHIFT_PUSH, ease: "none", duration: HSHIFT_HIT }
          ).to(jolt, { xPercent: 0, ease: "none", duration: HSHIFT_SETTLE });
        }
      });
    } else {
      chars.forEach(function (ch) {
        gsapLib.from(ch, {
          yPercent: HSHIFT_STEP_LIFT,
          rotation: HSHIFT_STEP_TURN,
          ease: "steps(" + HSHIFT_STEPS + ")",
          scrollTrigger: stFor(ch),
        });
      });
    }
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ST.refresh(); });
  }
  document.addEventListener("intro:done", function () { ST.refresh(); });
}

const MORPH_UNITS = {
  slide1Morph: { w: 555.63, h: 398.42 },
  slide2Morph: { w: 492.39, h: 358.62 },
  slide3Morph: { w: 715.14, h: 220.46 },
};
const MORPH_K_MAX_VH = 0.134;
const MORPH_W_LIMIT = 0.96;

function initSlideMorphFit() {
  const inners = Array.prototype.slice.call(
    document.querySelectorAll(".slide__inner--pinned")
  );
  if (!inners.length) return;

  function measure() {
    let k = (MORPH_K_MAX_VH / 100) * window.innerHeight;

    inners.forEach(function (inner) {
      const morph = inner.querySelector(".slide__morph");
      if (!morph) return;
      const units = MORPH_UNITS[morph.id];
      if (!units) return;

      const cs = getComputedStyle(inner);
      const ms = getComputedStyle(morph);
      let avail =
        inner.clientHeight -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom) -
        parseFloat(ms.marginTop) -
        parseFloat(ms.marginBottom);

      Array.prototype.forEach.call(inner.children, function (el) {
        if (el === morph) return;
        const pos = getComputedStyle(el).position;
        if (pos === "absolute" || pos === "fixed") return;
        avail -= el.offsetHeight;
      });

      if (avail > 0) k = Math.min(k, avail / units.h);
      k = Math.min(k, (window.innerWidth * MORPH_W_LIMIT) / units.w);
    });

    if (!(k > 0) || !isFinite(k)) return;
    inners.forEach(function (inner) {
      inner.style.setProperty("--morph-k", k + "px");
    });
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      measure();
    });
  }

  schedule();
  window.addEventListener("resize", schedule);
  document.addEventListener("apex:langchange", schedule);
  document.addEventListener("intro:done", schedule);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(schedule);
  }
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(schedule);
    inners.forEach(function (inner) {
      ro.observe(inner);
      const text = inner.querySelector(".slide__text");
      if (text) ro.observe(text);
    });
  }
}

function initFooterYear() {
  const el = document.getElementById("copyrightYear");
  if (!el) return;
  el.textContent = String(new Date().getFullYear());
}

function initUseCasesCarousel() {
  const section = document.querySelector(".use-cases");
  const row = document.querySelector(".use-cases__row");
  const viewport = section ? section.querySelector(".use-cases__viewport") : null;
  const dotsEl = document.getElementById("useCasesDots");
  const capsEl = document.getElementById("useCasesCaptions");
  const prevBtn = document.getElementById("useCasesPrev");
  const nextBtn = document.getElementById("useCasesNext");
  if (!section || !row) return;
  const items = Array.from(row.children);
  if (items.length < 2) return;

  const AUTO_MS_WIDE = 9000;
  const AUTO_MS_NARROW = 6400;
  const WIDE_MQ = "(min-width: 641px)";
  const isWide = () => !!(window.matchMedia && window.matchMedia(WIDE_MQ).matches);
  const autoMs = () => (isWide() ? AUTO_MS_WIDE : AUTO_MS_NARROW);
  let index = 0;
  let perView = 1;
  let pages = 1;
  let timer = null;
  let dots = [];

  let capKey = "";

  function buildCaptions() {
    if (!capsEl) return;
    capsEl.innerHTML = "";
    for (let i = 0; i < perView; i++) {
      capsEl.appendChild(document.createElement("span"));
    }
    capKey = "";
  }

  function paintCaptions() {
    if (!capsEl) return;
    Array.prototype.forEach.call(capsEl.children, (slot, j) => {
      const item = items[index + j];
      const cap = item ? item.querySelector(".use-cases__caption") : null;
      slot.textContent = "";

      const buy = item ? item.querySelector(".use-cases__buy[data-show]") : null;
      if (buy) {
        const copy = buy.cloneNode(true);
        copy.removeAttribute("hidden");
        const txt = currentLang() === "en" ? copy.dataset.en : copy.dataset.ko;
        if (txt !== undefined) copy.textContent = txt;
        const mail = currentLang() === "en" ? copy.dataset.hrefEn : copy.dataset.hrefKo;
        if (mail) copy.setAttribute("href", mail);
        slot.appendChild(copy);

        const money = cap
          ? cap.dataset[currentLang() === "en" ? "priceEn" : "priceKo"]
          : "";
        if (money) {
          const price = document.createElement("span");
          price.className = "use-cases__price";
          price.textContent = money;
          slot.appendChild(price);
        }
      }

      const text = document.createElement("span");
      text.className = "use-cases__cap-text";
      text.setAttribute("aria-hidden", "true");
      text.textContent = cap ? cap.textContent : "";
      slot.appendChild(text);
    });
    capKey = `${index}/${perView}`;
  }

  function swapCaptions() {
    if (!capsEl) return;
    if (capKey === `${index}/${perView}`) return;
    paintCaptions();
  }

  function readPerView() {
    const raw = getComputedStyle(section).getPropertyValue("--uc-per-view");
    const n = parseInt(raw, 10);
    return Math.min(Math.max(Number.isFinite(n) && n > 0 ? n : 1, 1), items.length);
  }

  function buildDots() {
    if (!dotsEl) return;
    dotsEl.innerHTML = "";
    dots = [];
    for (let i = 0; i < pages; i++) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "use-cases__dot dot-nav__dot";
      dot.setAttribute("aria-label", `${i + 1}번째 이미지 보기`);
      const target = i;
      dot.addEventListener("click", () => goTo(target, true));
      dotsEl.appendChild(dot);
      dots.push(dot);
    }
  }

  function render() {
    row.style.transform = `translateX(-${(index * 100) / perView}%)`;
    swapCaptions();
    dots.forEach((d, i) => {
      const active = i === index;
      d.classList.toggle("is-active", active);
      if (active) d.setAttribute("aria-current", "true");
      else d.removeAttribute("aria-current");
    });
  }

  const WRAP_FADE_MS = 160;

  function fadeToIndex(nextIndex) {
    row.style.setProperty("--uc-wrap-fade", `${WRAP_FADE_MS}ms`);
    row.classList.add("is-wrapping");
    window.setTimeout(() => {
      row.style.transition = "none";
      index = nextIndex;
      render();
      void row.offsetWidth;
      row.classList.remove("is-wrapping");
      row.style.transition = "";
    }, WRAP_FADE_MS);
  }

  function goTo(i, userInitiated) {
    const nextIndex = ((i % pages) + pages) % pages;
    const wrapping = index === pages - 1 && nextIndex === 0 && pages > 1;
    if (isWide() || wrapping) {
      fadeToIndex(nextIndex);
    } else {
      index = nextIndex;
      render();
    }
    if (userInitiated) restartTimer();
  }

  function restartTimer() {
    if (timer) clearInterval(timer);
    timer = null;
    if (prefersReducedMotion()) return;
    if (pages < 2) return;
    timer = setInterval(() => goTo(index + 1), autoMs());
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function layout() {
    const next = readPerView();
    if (next === perView && dots.length === pages) return;
    perView = next;
    pages = Math.max(items.length - perView + 1, 1);
    if (index > pages - 1) index = pages - 1;
    buildDots();
    buildCaptions();
    render();
    paintCaptions();
    restartTimer();
  }

  let touchStartX = 0;
  let touchStartY = 0;
  let touching = false;
  let swipeGuardUntil = 0;

  const swipeTarget = viewport || row;

  swipeTarget.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touching = true;
      row.style.transition = "none";
    },
    { passive: true }
  );

  swipeTarget.addEventListener(
    "touchmove",
    (e) => {
      if (!touching) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      if (Math.abs(dy) > Math.abs(dx)) return;
      const percent = (dx / row.clientWidth) * 100;
      row.style.transform = `translateX(calc(-${(index * 100) / perView}% + ${percent}%))`;
    },
    { passive: true }
  );

  swipeTarget.addEventListener("touchend", (e) => {
    if (!touching) return;
    touching = false;
    row.style.transition = "";
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const SWIPE_THRESHOLD = 40;
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      swipeGuardUntil = Date.now() + 400;
      goTo(index + (dx < 0 ? 1 : -1), true);
    } else {
      render();
    }
  });

  const step = (delta) => {
    if (Date.now() < swipeGuardUntil) return;
    goTo(index + delta, true);
  };
  if (prevBtn) prevBtn.addEventListener("click", () => step(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => step(1));

  window.addEventListener("resize", layout);
  document.addEventListener("apex:langchange", paintCaptions);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });

  perView = readPerView();
  pages = Math.max(items.length - perView + 1, 1);
  buildDots();
  buildCaptions();
  render();
  paintCaptions();

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            index = 0;
            render();
            restartTimer();
          } else {
            stop();
          }
        });
      },
      { threshold: 0.35 }
    );
    io.observe(section);
  } else {
    restartTimer();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const stack = document.getElementById("slide-stack");
  if (stack && stack.dataset.stack !== "sticky") {
    stackedScrollInstance = new StackedScroll(stack, ".slide");
  }

  initTypeTester();
  initGlyphBaseline();
  initGlyphBrowser();
  initAnatomyReveal();
  initOpenTypeFeatures();
  initBannerFit();
  initTheme();
  initConsentBanner();
  initLanguageToggle();
  initAnchorJumps();
  initSlideMorphFit();
  initFooterYear();
  initGlyphDuo();
  initFlipGrid();
  initHorizontalType();
  initSectionNav();
  initSectionNavAlign();
  initStackBuyCta();
  initShareButton();
  initMailCopyButton();
  initUseCasesCarousel();
  initMainStage();
  initMainStageVisibility();
});

(function () {
  "use strict";

  var stack = document.querySelector('.stack[data-stack="sticky"]');
  if (!stack) return;

  var tracks = Array.prototype.slice.call(stack.querySelectorAll(".slide-track"));
  var slides = tracks.map(function (t) { return t.querySelector(".slide"); });
  if (!slides.length) return;

  stack.style.height = "";

  slides.forEach(function (slide, i) {
    slide.style.zIndex = String(slides.length - i);
  });

  function reducedMotion() {
    return !!(window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function flowMode() {
    return (getComputedStyle(stack).getPropertyValue("--stack-mode") || "").trim() === "flow";
  }

  var indexAsideEl = document.querySelector(".stack__index");
  var ctaEl = document.getElementById("stackCta");
  var buyEl = document.getElementById("stackBuy");

  var indexDotsEl = document.querySelector(".stack__index-dots");
  var indexLabelEl = document.querySelector(".stack__index-label");
  var liveEl = document.getElementById("stackLiveRegion");
  var dots = [];

  if (indexDotsEl) {
    indexDotsEl.innerHTML = "";
    slides.forEach(function (slide, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "stack__index-dot dot-nav__dot";
      var title = slide.dataset.title || "";
      dot.setAttribute("aria-label",
        "슬라이드 " + (i + 1) + (title ? " — " + title : "") + "(으)로 이동");
      dot.addEventListener("click", function () { goTo(i); });
      indexDotsEl.appendChild(dot);
      dots.push(dot);
    });
  }

  function trackTop(i) {
    var y = 0;
    var el = tracks[i];
    while (el) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }

  var tops = [];
  var holdLen = 0;
  function measure() {
    tops = tracks.map(function (_, i) { return trackTop(i); });
    holdLen = Math.max(0, tracks[0].offsetHeight - window.innerHeight);
  }

  function verify() {
    if (!tracks[0]) return false;
    if (flowMode()) {
      stack.dataset.stickyOk = "flow";
      return true;
    }
    var stickRange = tracks[0].offsetHeight - window.innerHeight;
    var ok = stickRange >= window.innerHeight - 1;
    if (!tracks[0].offsetHeight) return false;
    stack.dataset.stickyOk = ok ? "yes" : "no";
    if (!ok && window.console) {
      console.warn(
        "[스택] 고정 거리가 부족합니다 — " + Math.round(stickRange) +
        "px, 화면 " + window.innerHeight + "px 이상이어야 합니다. " +
        "style.css의 .slide-track height를 확인하세요."
      );
    }
    return ok;
  }

  function showDiagnostics() {
    if (location.search.indexOf("debug") < 0) return;
    var cs = getComputedStyle;
    var slide = slides[0];
    var track = tracks[0];
    var rows = [
      ["화면", window.innerWidth + " × " + window.innerHeight],
      ["트랙 height", cs(track).height + "  (offsetHeight " + track.offsetHeight + ")"],
      ["트랙 margin-top", cs(tracks[1] || track).marginTop],
      ["슬라이드 position", cs(slide).position + "   ← sticky여야 한다"],
      ["슬라이드 height", cs(slide).height],
      ["슬라이드 top", cs(slide).top],
      ["슬라이드 inset", cs(slide).insetBlockStart + " / " + cs(slide).insetBlockEnd],
      ["--slide-hold", cs(stack).getPropertyValue("--slide-hold").trim() || "(없음)"],
      ["--slide-view", cs(stack).getPropertyValue("--slide-view").trim() || "(없음)"],
    ];
    var el = slide.parentElement;
    while (el) {
      var o = cs(el).overflow + " " + cs(el).overflowY;
      if (o.indexOf("hidden") >= 0 || o.indexOf("auto") >= 0 || o.indexOf("scroll") >= 0) {
        rows.push(["조상 overflow", (el.tagName + (el.id ? "#" + el.id : "")) + " → " + o + "  ← sticky를 막는다"]);
      }
      el = el.parentElement;
    }

    var box = document.createElement("pre");
    box.style.cssText =
      "position:fixed;left:0;top:0;z-index:9999;margin:0;padding:8px 10px;" +
      "background:rgba(0,0,0,.88);color:#0f0;font:11px/1.5 ui-monospace,monospace;" +
      "max-width:100vw;white-space:pre-wrap;pointer-events:none";
    box.textContent = rows.map(function (r) {
      return r[0].padEnd(18) + r[1];
    }).join("\n");
    document.body.appendChild(box);
    if (window.console) console.table(rows);
  }

  var currentIndex = -1;

  function readState() {
    var y = window.scrollY;

    var idx = 0;
    for (var i = 0; i < tops.length; i++) {
      if (i > 0 && tops[i] <= tops[i - 1]) break;
      if (y >= tops[i] - 1) idx = i;
    }
    var lastEnd = tops[tops.length - 1] + holdLen;
    var pastAll = y >= lastEnd;

    if (flowMode()) {
      var mid = window.innerHeight / 2;
      idx = 0;
      for (var k = 0; k < slides.length; k++) {
        if (slides[k].getBoundingClientRect().top <= mid) idx = k;
      }
      pastAll = slides[slides.length - 1].getBoundingClientRect().bottom <= 0;
    }

    var flow = flowMode();
    var marks = slides.map(function (slide, i) {
      if (flow) {
        return { leaving: false, passed: slide.getBoundingClientRect().bottom <= 0 };
      }
      var started = y >= tops[i] - 1;
      return {
        leaving: started && y > tops[i] + holdLen && i === idx,
        passed: i < idx
      };
    });
    return { y: y, idx: idx, pastAll: pastAll, marks: marks };
  }

  function applyState(st) {
    var y = st.y, idx = st.idx, pastAll = st.pastAll;
    slides.forEach(function (slide, i) {
      slide.classList.toggle("is-current", i === idx && !pastAll);
      slide.classList.toggle("is-leaving", st.marks[i].leaving);
      slide.classList.toggle("is-passed", st.marks[i].passed);
    });

    if (indexAsideEl) indexAsideEl.classList.toggle("is-hidden", pastAll);
    if (ctaEl) ctaEl.classList.toggle("is-hidden", pastAll);
    if (buyEl) buyEl.classList.toggle("is-hidden", !pastAll);

    if (idx !== currentIndex) {
      currentIndex = idx;
      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === idx);
        dot.classList.toggle("is-passed", i < idx);
        if (i === idx) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
      if (indexLabelEl) indexLabelEl.textContent = slides[idx].dataset.title || "";
      if (liveEl) {
        liveEl.textContent = "슬라이드 " + (idx + 1) + " / " + slides.length +
          (slides[idx].dataset.title ? " — " + slides[idx].dataset.title : "");
      }
    }

    updateDuo(idx, y);
  }

  function update() {
    applyState(readState());
  }

  function updateDuo(idx, y) {
    tracks.forEach(function (track, i) {
      if (!track.classList.contains("slide-track--duo")) return;
      var inner = track.querySelector(".slide__duo-track");
      if (!inner) return;
      var panels = inner.children.length || 1;
      var p = holdLen > 0 ? (y - tops[i]) / holdLen : 0;
      p = Math.max(0, Math.min(1, p));
      inner.style.transform = "translateY(" + (-(p * (panels - 1) / panels) * 100) + "%)";
    });
  }

  function goTo(i) {
    var y = tops[Math.max(0, Math.min(slides.length - 1, i))];
    scrollPageTo(y, { immediate: reducedMotion() });
  }

  function onKeyDown(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;

    var fwd = ["ArrowDown", "PageDown", " ", "Spacebar"].indexOf(e.key) >= 0;
    var back = ["ArrowUp", "PageUp"].indexOf(e.key) >= 0;
    var home = e.key === "Home";
    var end = e.key === "End";
    if (!fwd && !back && !home && !end) return;

    var y = window.scrollY;
    var lastEnd = tops[tops.length - 1] + holdLen + window.innerHeight;
    if (y < tops[0] - window.innerHeight * 0.5 || y >= lastEnd) return;

    var target = currentIndex;
    if (fwd) target = currentIndex + 1;
    else if (back) target = currentIndex - 1;
    else if (home) target = 0;
    else if (end) target = slides.length - 1;
    if (target < 0 || target > slides.length - 1) return;

    e.preventDefault();
    goTo(target);
  }

  var lastW = window.innerWidth;
  var lastH = window.innerHeight;
  function onResize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (w === lastW && Math.abs(h - lastH) <= lastH * 0.2) return;
    lastW = w;
    lastH = h;
    measure();
    verify();
    update();
  }

  function initViewportReadout() {
    if (location.search.indexOf("debug") < 0) return;
    document.documentElement.setAttribute("data-debug", "");
    var box = document.createElement("pre");
    box.style.cssText =
      "position:fixed;left:0;top:0;z-index:9999;margin:0;padding:6px 8px;" +
      "background:rgba(0,0,0,.85);color:#0f0;font:11px/1.45 ui-monospace,monospace;" +
      "white-space:pre;pointer-events:none";
    document.body.appendChild(box);

    var ruler = document.createElement("div");
    ruler.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;pointer-events:none";
    var svh = document.createElement("div"); svh.style.height = "100svh";
    var lvh = document.createElement("div"); lvh.style.height = "100lvh";
    var dvh = document.createElement("div"); dvh.style.height = "100dvh";
    ruler.appendChild(svh); ruler.appendChild(lvh); ruler.appendChild(dvh);
    document.body.appendChild(ruler);

    function draw() {
      var slideH = slides[0] ? Math.round(slides[0].getBoundingClientRect().height) : 0;
      var gap = window.innerHeight - slideH;
      box.textContent = [
        "화면(innerHeight) " + window.innerHeight,
        "100svh " + svh.offsetHeight + "   100lvh " + lvh.offsetHeight +
          "   100dvh " + dvh.offsetHeight,
        "툴바가 가린 높이 " + (lvh.offsetHeight - dvh.offsetHeight),
        "슬라이드 키 " + slideH + "   트랙 " + (tracks[0] ? tracks[0].offsetHeight : 0),
        "화면 − 슬라이드 = " + gap + (gap > 2 ? "  ← 이만큼 틈이 생겨 다음 장이 보인다" : "  (틈 없음)"),
        "현재 장 " + (currentIndex + 1) + " / " + slides.length
      ].join("\n");
    }
    draw();
    window.addEventListener("scroll", draw, { passive: true });
    window.addEventListener("resize", draw);
    setInterval(draw, 250);
  }

  measure();
  verify();
  update();
  initViewportReadout();
  showDiagnostics();
  scrollFrame.add(function () {
    var st = readState();
    return function () { applyState(st); };
  });
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("load", function () { measure(); verify(); update(); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () {
      measure();
      verify();
      update();
    });
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { measure(); update(); }).catch(function () {});
  }
})();
