// The slider (v4.13).
//
// The rule that matters: a TAP changes nothing. The value only moves
// when the thumb is dragged, or when a key is pressed. A setting the
// reader is feeling their way to must not jump because a finger landed
// on it.
import { describe, it, expect } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { createElement } from "react";
import Slider, { trackValue } from "../src/components/Slider";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("the maths of a drag", () => {
  it("moves with the finger", () => {
    // Half way along a 200px track, over a 0–100 range.
    expect(trackValue(50, 100, 200, 0, 100, 1)).toBe(100);
    expect(trackValue(50, -25, 200, 0, 100, 1)).toBe(38);
  });

  it("never leaves the range", () => {
    expect(trackValue(50, 9999, 200, 0, 100, 1)).toBe(100);
    expect(trackValue(50, -9999, 200, 0, 100, 1)).toBe(0);
  });

  it("snaps to the step", () => {
    expect(trackValue(0, 51, 200, 0, 100, 10)).toBe(30);
    expect(trackValue(0, 49, 200, 0, 100, 10)).toBe(20);
  });

  it("does nothing without a width to measure", () => {
    expect(trackValue(42, 30, 0, 0, 100, 1)).toBe(42);
  });
});

async function mount(props: Partial<React.ComponentProps<typeof Slider>>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(Slider, {
        value: 50,
        min: 0,
        max: 100,
        onChange: () => {},
        label: "Test",
        ...props,
      }),
    );
  });
  return { container, root };
}

function q(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing ${id}`);
  return el;
}

describe("the slider in the hand", () => {
  it("is a slider to a screen reader", async () => {
    const { container, root } = await mount({ testid: "s1" });
    const el = q(container, "s1");
    expect(el.getAttribute("role")).toBe("slider");
    expect(el.getAttribute("aria-valuemin")).toBe("0");
    expect(el.getAttribute("aria-valuemax")).toBe("100");
    expect(el.getAttribute("aria-valuenow")).toBe("50");
    expect(el.getAttribute("aria-label")).toBe("Test");
    expect(el.getAttribute("tabindex")).toBe("0");
    await act(async () => root.unmount());
  });

  it("moves with the arrow keys", async () => {
    const seen: number[] = [];
    const { container, root } = await mount({
      testid: "s2",
      value: 50,
      onChange: (v: number) => seen.push(v),
    });
    const el = q(container, "s2");
    await act(async () => {
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    await act(async () => {
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    expect(seen).toEqual([51, 49, 100]);
    await act(async () => root.unmount());
  });

  it("does not move on a plain press", async () => {
    const seen: number[] = [];
    const { container, root } = await mount({
      testid: "s3",
      onChange: (v: number) => seen.push(v),
    });
    const el = q(container, "s3");
    await act(async () => {
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    await act(async () => {
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    expect(seen).toEqual([]);
    await act(async () => root.unmount());
  });

  it("is quiet when it is disabled", async () => {
    const seen: number[] = [];
    const { container, root } = await mount({
      testid: "s4",
      disabled: true,
      onChange: (v: number) => seen.push(v),
    });
    const el = q(container, "s4");
    await act(async () => {
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(seen).toEqual([]);
    expect(el.getAttribute("aria-disabled")).toBe("true");
    await act(async () => root.unmount());
  });
});
