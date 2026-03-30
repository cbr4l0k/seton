import "@testing-library/jest-dom/vitest";

class ResizeObserverStub {
  observe() {}

  unobserve() {}

  disconnect() {}
}

if (!("ResizeObserver" in window)) {
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverStub,
    writable: true,
  });
}

if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () =>
    ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    ({
      item: () => null,
      length: 0,
      [Symbol.iterator]: function* iterator() {},
    }) as DOMRectList;
}
