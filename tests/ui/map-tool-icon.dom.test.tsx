// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { MapToolIcon } from "../../src/ui/studio/MapToolIcon";

it("draws each tool picture inline in currentColor, hidden from screen readers, and nothing for an unknown name", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <>
          <MapToolIcon name="select-move.svg" />
          <MapToolIcon name="edit-nodes.svg" />
          <MapToolIcon name="connect-entities.svg" />
          <MapToolIcon name="brush.svg" />
          <MapToolIcon name="unknown.svg" />
        </>,
      ),
    );
    const icons = Array.from(host.querySelectorAll(".world-map__tool-icon"));
    expect(icons).toHaveLength(4);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden")).toBe("true");
      expect(icon.querySelector("svg")).not.toBeNull();
      expect(icon.innerHTML).toContain("currentColor");
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
