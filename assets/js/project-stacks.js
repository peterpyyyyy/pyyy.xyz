(function () {
  const STATE_KEY = "__pyyyProjectStacks";
  const HEIGHT_CLOSE_MS = 720;
  const CLOSE_HEIGHT_EASING = "cubic-bezier(0.2, 0.82, 0.18, 1)";

  function clearCloseState(stack) {
    stack.classList.remove("frc-stack--closing", "frc-stack--height-closing");
    stack.style.height = "";
    stack.style.overflow = "";
    stack.style.transition = "";
  }

  function measureClosedHeight(stack) {
    const clone = stack.cloneNode(true);
    const rect = stack.getBoundingClientRect();

    clone.open = false;
    clone.classList.add("frc-stack--measuring");
    clone.style.position = "absolute";
    clone.style.visibility = "hidden";
    clone.style.pointerEvents = "none";
    clone.style.width = `${rect.width}px`;
    clone.style.height = "auto";
    clone.style.inset = "auto auto 0 0";
    clone.style.transition = "none";

    document.body.appendChild(clone);
    const height = Math.ceil(clone.getBoundingClientRect().height);
    clone.remove();

    return Math.max(1, height);
  }

  function installProjectStacks() {
    if (window[STATE_KEY] && typeof window[STATE_KEY].destroy === "function") {
      window[STATE_KEY].destroy();
    }

    const stacks = document.querySelectorAll("details.frc-stack");
    if (!stacks.length) {
      window[STATE_KEY] = null;
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timers = new Set();

    stacks.forEach(function (stack) {
      const summary = stack.querySelector("summary");
      if (!summary) return;

      summary.addEventListener("click", function (event) {
        if (event.defaultPrevented || event.target.closest("a")) return;
        if (stack.classList.contains("frc-stack--height-closing")) {
          event.preventDefault();
          return;
        }

        if (reducedMotion.matches || !stack.open) return;

        event.preventDefault();

        const startHeight = Math.ceil(stack.getBoundingClientRect().height);
        const endHeight = measureClosedHeight(stack);
        stack.style.height = `${startHeight}px`;
        stack.style.overflow = "hidden";
        stack.getBoundingClientRect();

        stack.classList.add("frc-stack--height-closing");
        stack.open = false;
        stack.style.transition = `height ${HEIGHT_CLOSE_MS}ms ${CLOSE_HEIGHT_EASING}`;

        let isDone = false;
        const finishClose = function () {
          if (isDone) return;
          isDone = true;
          clearCloseState(stack);
          timers.delete(timer);
        };

        stack.addEventListener("transitionend", function (transitionEvent) {
          if (transitionEvent.target === stack && transitionEvent.propertyName === "height") {
            finishClose();
          }
        }, { once: true, signal });

        window.requestAnimationFrame(function () {
          stack.style.height = `${endHeight}px`;
        });

        const timer = window.setTimeout(function () {
          finishClose();
        }, HEIGHT_CLOSE_MS + 120);
        timers.add(timer);
      }, { signal });

      stack.addEventListener("toggle", function () {
        if (stack.open) clearCloseState(stack);
      }, { signal });
    });

    window[STATE_KEY] = {
      destroy() {
        controller.abort();
        timers.forEach(function (timer) {
          window.clearTimeout(timer);
        });
        timers.clear();
        stacks.forEach(function (stack) {
          clearCloseState(stack);
        });
      }
    };
  }

  function scheduleInstall() {
    window.requestAnimationFrame(installProjectStacks);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleInstall, { once: true });
  } else {
    scheduleInstall();
  }

  window.addEventListener("pageshow", scheduleInstall);
})();
