/**
 * Splitting a stored sentence around the word it was captured for, so the words
 * list can mark it. Plain substring matching: sentence and word come from the
 * same lookup.
 */

export interface SentencePart {
  text: string;
  /** True for the word itself. */
  hit: boolean;
}

const KANA = /[ぁ-ゖァ-ヺー]/;

/**
 * Shortest prefixes of a dictionary form that can still stand for it in a
 * sentence, longest first: 溢れる also appears as 溢れた / 溢れない, and only the
 * stem is common to all of them. Kana stems stop at two characters (す would
 * match half the language); a lone kanji is specific enough to keep.
 */
function stems(word: string): string[] {
  const out: string[] = [];
  for (let len = word.length - 1; len >= 1; len--) {
    if (len < 2 && KANA.test(word[0])) break;
    out.push(word.slice(0, len));
  }
  return out;
}

/**
 * Splits `sentence` on the first term that occurs in it, marking every
 * occurrence. Terms are tried in order, so callers pass the inflected surface
 * before the dictionary form (食べさせられた before 食べる); when none occurs
 * verbatim, the first term's stem is tried, which catches an inflection no
 * surface was stored for.
 */
export function splitOnTerm(sentence: string, terms: (string | null | undefined)[]): SentencePart[] {
  const candidates = terms.filter((t): t is string => !!t);
  const fallback = () =>
    candidates
      .flatMap(stems)
      .sort((a, b) => b.length - a.length)
      .find((t) => sentence.includes(t));
  const term = candidates.find((t) => sentence.includes(t)) ?? fallback();
  if (!term) return [{ text: sentence, hit: false }];
  return sentence
    .split(term)
    .flatMap((part, i) => (i === 0 ? [{ text: part, hit: false }] : [{ text: term, hit: true }, { text: part, hit: false }]))
    .filter((part) => part.text !== "");
}
