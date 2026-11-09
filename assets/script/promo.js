/* Apex Cap 판매 알림 (test.html 전용) */
(function () {
const CAP_PROMO_KEY = "apex-cap-promo-closed";
const CAP_PROMO_DELAY_MS = 600;

function initCapPromo() {
  const promo = document.getElementById("capPromo");
  const closeBtn = document.getElementById("capPromoClose");
  if (!promo) return;
  try {
    if (localStorage.getItem(CAP_PROMO_KEY) === "1") return;
  } catch (e) {}

  const consent = document.getElementById("consentBanner");
  let wanted = false;
  let closed = false;
  let inGoods = false;
  let hideTimer = null;

  // 쿠키 안내와 겹치면(모바일) 숨기지 않고 그 위로 올린다.
  function lift() {
    let px = 0;
    if (consent && !consent.hidden && !promo.hidden) {
      const c = consent.getBoundingClientRect();
      const p = promo.getBoundingClientRect();
      if (c.left < p.right && c.right > p.left) px = Math.ceil(c.height) + 8;
    }
    promo.style.setProperty("--promo-lift", px + "px");
  }

  function sync() {
    const show = !closed && wanted && !inGoods;
    if (show) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
      promo.classList.remove("is-leaving");
      promo.hidden = false;
    } else if (!promo.hidden && !hideTimer) {
      promo.classList.add("is-leaving");
      hideTimer = window.setTimeout(() => {
        hideTimer = null;
        promo.hidden = true;
        promo.classList.remove("is-leaving");
      }, 400);
    }
    lift();
  }

  // 슬라이드를 다 본 뒤 — 슬라이드 다음 구간(Glyphs)이 화면에 들어오면 띄운다.
  const after = document.getElementById("Glyphs");
  function arm() {
    window.setTimeout(() => { wanted = true; sync(); }, CAP_PROMO_DELAY_MS);
  }
  if (after && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting || e.boundingClientRect.top < 0)) return;
      io.disconnect();
      arm();
    });
    io.observe(after);
  } else {
    arm();
  }

  // 굿즈 슬라이드가 화면 가운데에 오면 비켜 준다(닫은 것으로 치지 않는다).
  const goods = document.getElementById("UseCases");
  if (goods && "IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        inGoods = entries[entries.length - 1].isIntersecting;
        sync();
      },
      { rootMargin: "-35% 0px -35% 0px" }
    ).observe(goods);
  }

  if (consent) {
    new MutationObserver(lift).observe(consent, { attributes: true, attributeFilter: ["hidden"] });
  }
  window.addEventListener("resize", lift, { passive: true });

  function dismiss() {
    if (closed) return;
    closed = true;
    try {
      localStorage.setItem(CAP_PROMO_KEY, "1");
    } catch (e) {}
    sync();
  }
  if (closeBtn) closeBtn.addEventListener("click", dismiss);
  const cta = document.getElementById("capPromoCta");
  if (cta) cta.addEventListener("click", dismiss);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCapPromo);
} else {
  initCapPromo();
}
})();
