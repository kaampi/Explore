import { describe, expect, it } from "vitest";
import { findChromium } from "./chromium";

describe("the browser-test guard", () => {
  const missing = "/no/such/chromium";

  it("throws when the browser tests are required and there is no Chromium", () => {
    expect(() =>
      findChromium({ REQUIRE_BROWSER_TESTS: "1", CHROMIUM_EXECUTABLE: missing }),
    ).toThrow(/REQUIRE_BROWSER_TESTS=1.*no Chromium.*\/no\/such\/chromium/);
  });

  it("lets the tests skip themselves when they are not required", () => {
    expect(findChromium({ CHROMIUM_EXECUTABLE: missing }).chromium).toBeUndefined();
    expect(
      findChromium({ REQUIRE_BROWSER_TESTS: "0", CHROMIUM_EXECUTABLE: missing }).chromium,
    ).toBeUndefined();
  });

  it("uses the Chromium named in CHROMIUM_EXECUTABLE", () => {
    const here = process.execPath; // any file that exists
    const found = findChromium({ REQUIRE_BROWSER_TESTS: "1", CHROMIUM_EXECUTABLE: here });
    expect(found.executablePath).toBe(here);
    expect(found.chromium).toBeDefined();
  });
});
