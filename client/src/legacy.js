// Smart-TV browsers before Chrome 66 have no AbortController. This stand-in keeps
// timeouts and reconnects working there; gameApi stops waiting on its own when
// the browser's fetch ignores the signal.
if (typeof window.AbortController === "undefined") {
  class Signal {
    constructor() {
      this.aborted = false;
      this.listeners = [];
    }
    addEventListener(type, listener) {
      if (type === "abort") this.listeners.push(listener);
    }
    removeEventListener(type, listener) {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    }
  }
  window.AbortController = class AbortController {
    constructor() {
      this.signal = new Signal();
    }
    abort() {
      const { signal } = this;
      if (signal.aborted) return;
      signal.aborted = true;
      signal.listeners.slice().forEach((listener) => listener({ type: "abort", target: signal }));
    }
  };
}

// Flex gap arrived in Chrome 84; older TVs get margins instead (see legacy.css).
const probe = document.createElement("div");
probe.style.cssText = "display:flex;flex-direction:column;row-gap:1px;position:absolute";
probe.appendChild(document.createElement("div"));
probe.appendChild(document.createElement("div"));
document.documentElement.appendChild(probe);
if (probe.scrollHeight !== 1) document.documentElement.classList.add("no-flex-gap");
probe.remove();
