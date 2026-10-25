import { describe, expect, it } from "vitest";
import { formatAppearanceList } from "@library/appearanceText";
import { reviewFromCardData } from "@library/sillyTavernImport";

describe("imported appearance lists", () => {
  it("formats the supplied list without dropping physical traits", () => {
    const source = "Short, Black hair + black bangs+ Red Eyes + Small Chest + Flat Chest + Small Round Butt + Smooth, Fair skin + Very Cute Face";
    const expected = "Short black hair with black bangs, red eyes, smooth, fair skin, and a very cute face. A small, flat chest and a small, round butt.";
    expect(formatAppearanceList(source)).toBe(expected);
    for (const field of [`Appearance(${source})`, `Body/Appearance=${source}`]) {
      const raw = { name: "Alice", description: field };
      const review = reviewFromCardData(raw);
      expect(review.character.appearance).toBe(expected);
      expect(review.rawText).toBe(field);
      expect(raw.description).toBe(field);
    }
  });
  it("preserves ordinary prose, punctuation and names without treating description text as a list", () => {
    const source = "Her eyes recall the Red Sea. A NASA badge and a C++ tattoo.";
    expect(formatAppearanceList(source)).toBe(source);
    const review = reviewFromCardData({ name: "Ada", description: "Dark eyes + a NASA badge. She stands 180 cm tall." });
    expect(review.character.appearance).toBe("Dark eyes + a NASA badge. She stands 180 cm tall.");
    expect(formatAppearanceList('Green Eyes + Dunbaar Tattoo + 180 cm tall')).toBe("Green eyes; Dunbaar Tattoo; 180 cm tall.");
  });
  it("keeps conflicting traits and unknown names instead of choosing or inferring", () => {
    expect(formatAppearanceList("Small Chest + Large Chest")).toBe("A small chest and a large chest.");
    expect(formatAppearanceList("Brown Eyes + Green Eyes")).toBe("Brown eyes and green eyes.");
    expect(formatAppearanceList("Red Sea tattoo + Black Hair")).toBe("Red Sea tattoo; black hair.");
  });
  it("keeps quantities, repeated pluses and parenthetical or quoted text intact", () => {
    expect(formatAppearanceList('C++ tattoo + 5+ scars + mark (+) + "A+B"')).toBe("C++ tattoo; 5+ scars; mark (+); A+B.");
    expect(formatAppearanceList('"Black Hair" + "Red Eyes" + Black Hair')).toBe("Black hair and red eyes.");
    expect(formatAppearanceList("Black Hair + + Red Eyes + ")).toBe("Black hair and red eyes.");
  });
});
