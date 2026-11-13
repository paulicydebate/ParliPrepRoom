// Adapted from Flowist (by Elli; used with permission): ui/fuzzy-match.ts, the match the slash commands and the doc
// outline search share. matchName and nearStart are theirs; matchWord below is this app's, to search flow cells.

export type MatchedRange = readonly [start: number, end: number];

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

export function isWordCharacter(text: string, index: number) {
  const code = text.charCodeAt(index);
  if (code < 128) return (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || (code >= 65 && code <= 90);
  return WORD_CHARACTER.test(text[index]);
}

/**
 * The slash commands' match (sheet/editor/command-match.ts), shared with the doc outline's search: the query
 * at the name's start ranks 0, at a later word's start 1, and its letters in order anywhere 2.
 */
export function matchName(query: string, name: string): { rank: number; ranges: MatchedRange[] } | null {
  const needle = query.toLowerCase();
  const text = name.toLowerCase();
  if (!needle) return { rank: 0, ranges: [] };
  if (text.startsWith(needle)) return { rank: 0, ranges: [[0, needle.length]] };
  for (let index = text.indexOf(needle, 1); index > 0; index = text.indexOf(needle, index + 1)) {
    if (!isWordCharacter(text, index - 1)) return { rank: 1, ranges: [[index, index + needle.length]] };
  }
  const ranges: [number, number][] = [];
  let from = 0;
  for (const character of needle) {
    const found = text.indexOf(character, from);
    if (found < 0) return null;
    const last = ranges.at(-1);
    if (last && last[1] === found) last[1] = found + 1;
    else ranges.push([found, found + 1]);
    from = found + 1;
  }
  return { rank: 2, ranges };
}

const MOST_TERM = 32;
const rows = [0, 1, 2].map(() => new Int32Array(MOST_TERM + 4));

/**
 * How much of the word at `text[start, end)` a misspelled `term` stands for, or 0: the longest start of the
 * word at least as long as the term (the term half typed), or the whole word, within `most` edits by
 * Damerau-Levenshtein distance, as DialKit's search (packages/dialkit) allows a near spelling.
 */
export function nearStart(term: string, text: string, start: number, end: number, most: number) {
  const length = end - start;
  const columns = Math.min(length, term.length + most);
  if (term.length > MOST_TERM || columns < term.length - most) return 0;
  let [before, last, row] = rows;
  for (let column = 0; column <= columns; column += 1) last[column] = column;
  for (let line = 1; line <= term.length; line += 1) {
    const typed = term.charCodeAt(line - 1);
    row[0] = line;
    let best = line;
    for (let column = 1; column <= columns; column += 1) {
      const there = text.charCodeAt(start + column - 1);
      let value = Math.min(last[column] + 1, row[column - 1] + 1, last[column - 1] + (typed === there ? 0 : 1));
      if (line > 1 && column > 1 && typed === text.charCodeAt(start + column - 2) && term.charCodeAt(line - 2) === there) {
        value = Math.min(value, before[column - 2] + 1);
      }
      row[column] = value;
      if (value < best) best = value;
    }
    if (best > most) return 0;
    [before, last, row] = [last, row, before];
  }
  let found = 0;
  let fewest = most;
  for (let column = Math.min(length, term.length); column <= columns; column += 1) {
    if (last[column] <= fewest) {
      fewest = last[column];
      found = column;
    }
  }
  return found;
}

/** One typed word against some text: the best way it matches (lower rank is better), or null. Allows a near spelling. */
export function matchWord(term: string, text: string): { rank: number; ranges: MatchedRange[] } | null {
  const exact = matchName(term, text);
  if (exact && exact.rank < 2) return exact;
  const needle = term.toLowerCase();
  const lower = text.toLowerCase();
  const most = needle.length >= 7 ? 2 : needle.length >= 4 ? 1 : 0;
  if (most > 0) {
    let i = 0;
    while (i < lower.length) {
      if (!isWordCharacter(lower, i)) {
        i++;
        continue;
      }
      let end = i;
      while (end < lower.length && isWordCharacter(lower, end)) end++;
      const len = nearStart(needle, lower, i, end, most);
      if (len > 0) return { rank: 2, ranges: [[i, i + len]] };
      i = end;
    }
  }
  // Letters in order, anywhere, only for longer words (a short word spread across a sentence is noise).
  return exact && needle.length >= 4 ? { rank: 3, ranges: exact.ranges } : null;
}
