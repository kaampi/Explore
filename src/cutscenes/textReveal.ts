const wordSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : undefined;
const graphemeSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

export function textGraphemes(text: string) {
  return graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment)
    : Array.from(text);
}

/** Keep punctuation and line breaks in the exact positions the writer entered. */
export function revealWords(text: string) {
  const source = text.trim();
  const words = wordSegmenter
    ? Array.from(wordSegmenter.segment(source)).filter(({ isWordLike }) => isWordLike)
    : Array.from(source.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’]*/gu), (match) => ({
        segment: match[0],
        index: match.index,
      }));
  return words.map(({ segment, index }, i) => ({
    label: segment,
    content: source.slice(i === 0 ? 0 : index, words[i + 1]?.index),
  }));
}
