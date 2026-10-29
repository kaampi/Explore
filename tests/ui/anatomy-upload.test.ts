// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { anatomyImageFromFile } from "../../src/ui/studio/anatomyUpload";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("scales oversized illustrations proportionally and preserves PNG transparency", async () => {
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3200, height: 1600, close })));
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  const output = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (this: HTMLCanvasElement, type) {
    expect(this.width).toBe(1600);
    expect(this.height).toBe(800);
    expect(type).toBe("image/png");
    return "data:image/png;base64,AA==";
  });
  expect(await anatomyImageFromFile(new File(["image"], "body.png", { type: "image/png" }))).toContain("image/png");
  expect(output).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

it("rejects unsupported files before decoding", async () => {
  await expect(anatomyImageFromFile(new File(["text"], "body.txt", { type: "text/plain" }))).rejects.toThrow("PNG, JPEG or WebP");
});
