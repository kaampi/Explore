import { describe, it, expect, vi } from "vitest";
import { retryWithBackoff, RetryExhaustedError } from "@llm/retry";

const instantSleep = async () => {};

describe("retryWithBackoff", () => {
  it("returns the result on the first successful attempt without sleeping", async () => {
    const sleepImpl = vi.fn(instantSleep);
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 100, sleepImpl });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("retries after a failure and succeeds on a later attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("first fail"))
      .mockRejectedValueOnce(new Error("second fail"))
      .mockResolvedValueOnce("ok");

    const result = await retryWithBackoff(fn, { maxAttempts: 5, baseDelayMs: 0, sleepImpl: instantSleep });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws RetryExhaustedError after exhausting all attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(
      retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 0, sleepImpl: instantSleep })
    ).rejects.toThrow(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("calls onRetry with the attempt number and error for every failed attempt", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValue(new Error("nope"));

    await expect(
      retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 0, sleepImpl: instantSleep, onRetry })
    ).rejects.toThrow();

    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
    expect(onRetry).toHaveBeenNthCalledWith(3, 3, expect.any(Error));
  });

  it("sleeps with exponentially increasing delay between attempts", async () => {
    const sleepImpl = vi.fn(async (_ms: number) => {});
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(
      retryWithBackoff(fn, { maxAttempts: 4, baseDelayMs: 100, sleepImpl })
    ).rejects.toThrow();

    // 3 sleeps between 4 attempts: 100, 200, 400
    expect(sleepImpl.mock.calls.map((c) => c[0])).toEqual([100, 200, 400]);
  });

  it("preserves the last error on RetryExhaustedError", async () => {
    const lastError = new Error("final failure");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(lastError);

    try {
      await retryWithBackoff(fn, { maxAttempts: 2, baseDelayMs: 0, sleepImpl: instantSleep });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RetryExhaustedError);
      expect((err as RetryExhaustedError).lastError).toBe(lastError);
    }
  });
});
