import type { HighlightSegment } from './highlightSegments';

export interface FuzzyMatch {
  score: number;
  /** Positions of the matched characters in the text, ascending */
  indices: number[];
}

const WORD_SEPARATOR = /[\s_\-.:/\\()[\],#@$]/;

function isUpper(char: string) {
  return char != char.toLowerCase() && char == char.toUpperCase();
}

function isDigit(char: string) {
  return char >= '0' && char <= '9';
}

/** Start of a word: after a separator, a lower to upper case change (camelCase) or a letter / digit change */
function isWordStart(text: string, index: number) {
  if (index == 0) return true;
  const prev = text[index - 1];
  const char = text[index];
  if (WORD_SEPARATOR.test(prev)) return true;
  if (isUpper(char) && !isUpper(prev)) return true;
  return isDigit(char) != isDigit(prev);
}

function findLetters(text: string, lower: string, letters: string, preferWordStarts: boolean): number[] {
  const indices = [];
  let from = 0;
  for (const letter of letters) {
    let index = lower.indexOf(letter, from);
    if (index < 0) return null;
    const previous = indices[indices.length - 1];
    if (preferWordStarts && (previous == null || index != previous + 1)) {
      for (let next = index; next >= 0; next = lower.indexOf(letter, next + 1)) {
        if (isWordStart(text, next)) {
          index = next;
          break;
        }
      }
    }
    indices.push(index);
    from = index + 1;
  }
  return indices;
}

function scoreLetters(text: string, indices: number[]) {
  let score = 100 - indices[0] - text.length / 2;
  for (let i = 0; i < indices.length; i++) {
    if (isWordStart(text, indices[i])) score += 12;
    if (i > 0) {
      const gap = indices[i] - indices[i - 1] - 1;
      score += gap == 0 ? 8 : -Math.min(gap, 10);
    }
  }
  return score;
}

/**
 * Matches the query against a name, Spotlight style: a contiguous match ranks first (exact, then prefix,
 * then start of a word), then the query letters in order from the start of a word, preferring starts of words,
 * so "oi" finds order_items. Returns null when the text doesn't match.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch {
  const needle = (query || '').trim().toLowerCase();
  if (!needle) return { score: 0, indices: [] };
  if (!text) return null;
  const lower = text.toLowerCase();

  let position = -1;
  for (let index = lower.indexOf(needle); index >= 0; index = lower.indexOf(needle, index + 1)) {
    if (position < 0) position = index;
    if (isWordStart(text, index)) {
      position = index;
      break;
    }
  }
  if (position >= 0) {
    let score = 1000 - position - text.length / 2;
    if (needle.length == lower.length) score += 2000;
    else if (position == 0) score += 1000;
    else if (isWordStart(text, position)) score += 500;
    return { score, indices: Array.from({ length: needle.length }, (_, i) => position + i) };
  }

  // scattered letters only count from the start of a word, so "ord" doesn't find "Import data"
  const letters = needle.replace(/\s+/g, '');
  const indices = findLetters(text, lower, letters, true) ?? findLetters(text, lower, letters, false);
  if (!indices || !isWordStart(text, indices[0])) return null;
  return { score: scoreLetters(text, indices), indices };
}

/** Splits the text into plain and highlighted runs, for rendering the matched letters */
export function fuzzySegments(text: string, indices: number[]): HighlightSegment[] {
  const res: HighlightSegment[] = [];
  const matched = new Set(indices || []);
  for (let i = 0; i < (text || '').length; i++) {
    const highlighted = matched.has(i);
    const last = res[res.length - 1];
    if (last && last.highlighted == highlighted) last.text += text[i];
    else res.push({ text: text[i], highlighted });
  }
  return res;
}
