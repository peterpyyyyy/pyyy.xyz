(function () {
  const STATE_KEY = "__pyyyHomeSnap";
  const INPUT_RESET_MS = 90;
  const SETTLE_MS = 160;
  const MOMENTUM_LOCK_MS = 320;
  const WHEEL_TRIGGER = 34;
  const WHEEL_STRONG_TRIGGER = 80;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function installHomeSnap() {
    if (window[STATE_KEY] && typeof window[STATE_KEY].destroy === "function") {
      window[STATE_KEY].destroy();
    }

    const cover = document.querySelector('[data-home-panel="cover"]');
    const projects = document.querySelector('[data-home-panel="projects"]');

    if (!cover || !projects) {
      document.documentElement.classList.remove("home-snap-ready", "home-snap-animating");
      window[STATE_KEY] = null;
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let rafId = 0;
    let animating = false;
    let wheelDelta = 0;
    let wheelTimer = 0;
    let settleTimer = 0;
    let touchStartY = 0;
    let touchStartScroll = 0;
    let inputLockUntil = 0;
    let previousRootScrollBehavior = "";
    let previousBodyScrollBehavior = "";

    document.documentElement.classList.add("home-snap-ready");

    function headerOffset() {
      const header = document.querySelector(".fixed.inset-x-0.z-100");
      return header ? Math.round(header.getBoundingClientRect().height) : 0;
    }

    function anchorGap() {
      return Math.round(clamp(window.innerHeight * 0.026, 16, 24));
    }

    function snapOffset() {
      return headerOffset() + anchorGap();
    }

    function projectAnchor() {
      return projects.querySelector(".projects-grid > *") || projects;
    }

    function projectTop() {
      const anchor = projectAnchor();
      return Math.max(0, Math.round(anchor.getBoundingClientRect().top + window.scrollY - snapOffset()));
    }

    function betweenPanels(y = window.scrollY, top = projectTop()) {
      return y > 2 && y < top - 2;
    }

    function canSnapDown(top = projectTop()) {
      return window.scrollY < top - 2;
    }

    function canSnapUp(top = projectTop()) {
      const exitRange = Math.round(clamp(window.innerHeight * 0.42, 150, 280));
      return window.scrollY > 2 && window.scrollY <= top + exitRange;
    }

    function easeInOutQuadToTarget(t) {
      return t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    function clearTimers() {
      window.clearTimeout(wheelTimer);
      window.clearTimeout(settleTimer);
      wheelTimer = 0;
      settleTimer = 0;
    }

    function setNativeSmoothScroll(disabled) {
      if (disabled) {
        previousRootScrollBehavior = document.documentElement.style.scrollBehavior;
        previousBodyScrollBehavior = document.body.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = "auto";
        document.body.style.scrollBehavior = "auto";
        return;
      }

      document.documentElement.style.scrollBehavior = previousRootScrollBehavior;
      document.body.style.scrollBehavior = previousBodyScrollBehavior;
    }

    function stopAnimation() {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }

      if (animating) {
        animating = false;
        setNativeSmoothScroll(false);
        document.documentElement.classList.remove("home-snap-animating");
      }
    }

    function animateTo(target) {
      target = Math.round(target);
      const start = window.scrollY;
      const distance = target - start;

      clearTimers();
      wheelDelta = 0;
      stopAnimation();

      if (reducedMotion.matches || Math.abs(distance) < 2) {
        window.scrollTo(0, target);
        return;
      }

      const duration = clamp(620 + Math.abs(distance) * 0.26, 760, 1080);
      const startTime = performance.now();

      animating = true;
      setNativeSmoothScroll(true);
      document.documentElement.classList.add("home-snap-animating");

      function frame(now) {
        const progress = clamp((now - startTime) / duration, 0, 1);
        window.scrollTo(0, start + distance * easeInOutQuadToTarget(progress));

        if (progress < 1) {
          rafId = window.requestAnimationFrame(frame);
          return;
        }

        window.scrollTo(0, target);
        inputLockUntil = performance.now() + MOMENTUM_LOCK_MS;
        rafId = 0;
        animating = false;
        setNativeSmoothScroll(false);
        document.documentElement.classList.remove("home-snap-animating");
      }

      rafId = window.requestAnimationFrame(frame);
    }

    function snapToProjects() {
      animateTo(projectTop());
    }

    function snapToCover() {
      animateTo(0);
    }

    function settleIfBetweenPanels() {
      if (animating) return;

      const top = projectTop();
      const y = window.scrollY;

      if (!betweenPanels(y, top)) return;
      animateTo(y > top * 0.42 ? top : 0);
    }

    function queueSettle() {
      if (animating) return;
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settleIfBetweenPanels, SETTLE_MS);
    }

    function consumeWheel(direction) {
      direction > 0 ? snapToProjects() : snapToCover();
    }

    window.addEventListener("wheel", function (event) {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      if (animating || performance.now() < inputLockUntil) {
        event.preventDefault();
        return;
      }

      const top = projectTop();
      const direction = event.deltaY > 0 ? 1 : -1;
      const shouldCatch = direction > 0 ? canSnapDown(top) : canSnapUp(top);

      if (!shouldCatch) return;

      event.preventDefault();
      if (animating) return;

      wheelDelta += event.deltaY;
      window.clearTimeout(wheelTimer);

      if (Math.abs(event.deltaY) >= WHEEL_STRONG_TRIGGER || Math.abs(wheelDelta) >= WHEEL_TRIGGER) {
        consumeWheel(wheelDelta > 0 ? 1 : -1);
        return;
      }

      wheelTimer = window.setTimeout(function () {
        if (wheelDelta !== 0) consumeWheel(wheelDelta > 0 ? 1 : -1);
        wheelDelta = 0;
      }, INPUT_RESET_MS);
    }, { passive: false, signal });

    window.addEventListener("touchstart", function (event) {
      if (event.touches.length !== 1) return;
      touchStartY = event.touches[0].clientY;
      touchStartScroll = window.scrollY;
    }, { passive: true, signal });

    window.addEventListener("touchmove", function (event) {
      if (event.touches.length !== 1 || !touchStartY) return;

      if (animating || performance.now() < inputLockUntil) {
        event.preventDefault();
        return;
      }

      const delta = touchStartY - event.touches[0].clientY;
      const direction = delta > 0 ? 1 : -1;
      const top = projectTop();
      const shouldCatch = direction > 0
        ? touchStartScroll < top - 2
        : touchStartScroll > 2 && touchStartScroll <= top + 96;

      if (!shouldCatch) return;

      if (animating) {
        event.preventDefault();
        return;
      }

      if (Math.abs(delta) < 46) return;

      event.preventDefault();
      direction > 0 ? snapToProjects() : snapToCover();
      touchStartY = 0;
    }, { passive: false, signal });

    window.addEventListener("touchend", queueSettle, { passive: true, signal });
    window.addEventListener("touchcancel", queueSettle, { passive: true, signal });

    window.addEventListener("keydown", function (event) {
      if (event.defaultPrevented || event.metaKey || event.altKey || event.ctrlKey) return;

      const tagName = document.activeElement ? document.activeElement.tagName : "";
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tagName)) return;

      if ((event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") && canSnapDown()) {
        event.preventDefault();
        snapToProjects();
      }

      if ((event.key === "ArrowUp" || event.key === "PageUp") && canSnapUp()) {
        event.preventDefault();
        snapToCover();
      }
    }, { signal });

    window.addEventListener("scroll", queueSettle, { passive: true, signal });
    window.addEventListener("resize", function () {
      stopAnimation();
      queueSettle();
    }, { passive: true, signal });

    window[STATE_KEY] = {
      destroy() {
        stopAnimation();
        clearTimers();
        controller.abort();
        document.documentElement.classList.remove("home-snap-animating");
      }
    };
  }

  function scheduleInstall() {
    window.requestAnimationFrame(installHomeSnap);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleInstall, { once: true });
  } else {
    scheduleInstall();
  }

  window.addEventListener("pageshow", scheduleInstall);

  document.addEventListener("click", function (event) {
    if (!event.target.closest("#appearance-switcher, #appearance-switcher-mobile")) return;
    window.setTimeout(scheduleInstall, 0);
  }, true);
})();
