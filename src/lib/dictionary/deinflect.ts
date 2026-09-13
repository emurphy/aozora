/**
 * Japanese deinflection: thin wrapper over the ported Yomitan language
 * transformer (substring-scan + rules, no tokenizer/MeCab). Exposes candidate
 * dictionary forms with grammatical conditions (for POS validation) and a
 * readable inflection reason per candidate. GPL-3.0 engine/rules from Yomitan.
 */

import { LanguageTransformer } from "./transforms/language-transformer";
import { japaneseTransforms } from "./transforms/japanese-transforms";
import { lookupVariants } from "./text-variants";
import type { TransformedText } from "./transforms/types";

const transformer = new LanguageTransformer();
transformer.addDescriptor(japaneseTransforms);

/** Maps each transform id to its display name (e.g. "-te" → "-て"). */
const transformNames = new Map<string, string>(Object.entries(japaneseTransforms.transforms).map(([id, t]) => [id, t.name]));

export interface Deinflection {
  term: string;
  /** Grammatical condition flags of the candidate (0 = the uninflected source). */
  conditions: number;
  /** Inflection reasons applied, outermost (most recently stripped) first. */
  reasons: string[];
}

function traceToReasons(trace: TransformedText["trace"]): string[] {
  return trace.map((frame) => transformNames.get(frame.transform) ?? frame.transform);
}

/**
 * Returns every candidate dictionary form for a surface form, including the
 * surface form itself (conditions 0, no reasons).
 */
export function deinflect(word: string): Deinflection[] {
  return transformer.transform(word).map((t) => ({
    term: t.text,
    conditions: t.conditions,
    reasons: traceToReasons(t.trace),
  }));
}

/**
 * Like `deinflect`, but first expands the surface form into its length-preserving
 * kana variants (katakana↔hiragana) and deinflects each, so a word written in an
 * unexpected kana form still reaches its dictionary entry (e.g. a katakana-written
 * verb サボる → さぼる). Candidates are deduped by term + conditions + reasons.
 */
export function deinflectVariants(word: string): Deinflection[] {
  const seen = new Set<string>();
  const out: Deinflection[] = [];
  for (const variant of lookupVariants(word)) {
    for (const d of deinflect(variant)) {
      const key = `${d.term} ${d.conditions} ${d.reasons.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

export function conditionFlagsForPartsOfSpeech(partsOfSpeech: string[]): number {
  return transformer.getConditionFlagsFromPartsOfSpeech(partsOfSpeech);
}

export function conditionsMatch(candidateConditions: number, definitionConditions: number): boolean {
  return LanguageTransformer.conditionsMatch(candidateConditions, definitionConditions);
}
