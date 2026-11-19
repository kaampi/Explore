// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Button, IconButton } from "../../src/ui/components/Button";

async function render(node: React.ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("makes a button of each kind and size, and is a plain button by default", async () => {
  const ui = await render(
    <>
      <Button variant="primary">Save</Button>
      <Button>Cancel</Button>
      <Button variant="quiet" size="compact">
        Edit
      </Button>
      <Button variant="danger" filled>
        Delete
      </Button>
      <Button variant="idea">Save idea</Button>
    </>,
  );
  try {
    const buttons = Array.from(ui.host.querySelectorAll("button"));
    expect(buttons.map((b) => b.className)).toEqual([
      "ui-button ui-button--primary",
      "ui-button ui-button--secondary",
      "ui-button ui-button--quiet ui-button--compact",
      "ui-button ui-button--danger ui-button--filled",
      "ui-button ui-button--idea",
    ]);
    expect(buttons.every((b) => b.type === "button")).toBe(true);
  } finally {
    await ui.close();
  }
});

it("fills red only for a danger button", async () => {
  const ui = await render(<Button filled>Plain</Button>);
  try {
    expect(ui.host.querySelector("button")!.className).not.toContain("ui-button--filled");
  } finally {
    await ui.close();
  }
});

it("shows a spinner in place of the icon and says it is busy", async () => {
  const ui = await render(
    <Button busy icon={<span data-icon />}>
      Saving
    </Button>,
  );
  try {
    const button = ui.host.querySelector("button")!;
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector(".ui-button__spinner")).toBeTruthy();
    expect(button.querySelector("[data-icon]")).toBeNull();
    expect(button.textContent).toBe("Saving");
  } finally {
    await ui.close();
  }
});

it("names an icon button and uses the name as its tooltip", async () => {
  const ui = await render(<IconButton label="More options for Mona" icon={<span>⋯</span>} />);
  try {
    const button = ui.host.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("More options for Mona");
    expect(button.title).toBe("More options for Mona");
    expect(button.className).toBe("ui-button ui-button--secondary ui-button--icon");
  } finally {
    await ui.close();
  }
});
