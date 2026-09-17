import { describe, it, expect } from "vitest";
import { callName, formatPersonName, namesFromStored, personNameTerms, splitPersonName } from "@library/personName";

describe("personName", () => {
  it("treats the first token as given and the last as family", () => {
    expect(splitPersonName("Emma")).toEqual({ given: "Emma", middle: "", family: "" });
    expect(splitPersonName("Emma Knucklewood")).toEqual({ given: "Emma", middle: "", family: "Knucklewood" });
    expect(splitPersonName("Emma Therese Knucklewood")).toEqual({
      given: "Emma",
      middle: "Therese",
      family: "Knucklewood"
    });
    expect(splitPersonName("Mary Jane Watson")).toEqual({ given: "Mary", middle: "Jane", family: "Watson" });
  });

  it("keeps stored given/middle/family instead of re-splitting", () => {
    expect(namesFromStored("Mary Jane", "Watson")).toEqual({
      given: "Mary Jane",
      middle: "",
      family: "Watson"
    });
    expect(namesFromStored("Emma", "Knucklewood", "Therese")).toEqual({
      given: "Emma",
      middle: "Therese",
      family: "Knucklewood"
    });
    expect(namesFromStored("Emma Therese Knucklewood", "")).toEqual({
      given: "Emma",
      middle: "Therese",
      family: "Knucklewood"
    });
  });

  it("calls them by given name in ordinary narration", () => {
    expect(callName("Emma", "Knucklewood", "Therese")).toBe("Emma");
    expect(callName("Emma Knucklewood")).toBe("Emma");
    expect(formatPersonName("Emma", "Knucklewood", "Therese")).toBe("Emma Therese Knucklewood");
  });

  it("lists given, middle, family, and full name for agency matching", () => {
    expect(personNameTerms("Emma", "Knucklewood", "Therese")).toEqual(
      expect.arrayContaining(["Emma", "Therese", "Knucklewood", "Emma Therese Knucklewood"])
    );
  });
});
