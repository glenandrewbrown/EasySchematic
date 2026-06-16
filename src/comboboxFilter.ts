// Pure, immutable suggestion filtering for the Combobox / TagInput UI primitives.
// Kept dependency-free and node-testable so the matching logic is verified in
// isolation from the React components that consume it.

const DEFAULT_LIMIT = 8;

export interface FilterSuggestionsOptions {
  /** Maximum number of results to return. Defaults to 8. */
  limit?: number;
  /** Drop a suggestion that exactly equals the query (case-insensitive). */
  excludeExact?: boolean;
}

/**
 * Case-insensitive substring filter over a list of suggestions.
 *
 * Ordering: suggestions whose value *starts with* the query come first (in
 * their original relative order), followed by other substring matches. Results
 * are de-duplicated (first occurrence wins) and sliced to `opts.limit ?? 8`.
 *
 * An empty/whitespace query returns the first N suggestions (de-duplicated),
 * which makes the control usable as a plain "show me the options" dropdown.
 *
 * Pure and immutable: never mutates the input array.
 */
export function filterSuggestions(
  query: string,
  suggestions: readonly string[],
  opts?: FilterSuggestionsOptions,
): string[] {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  if (limit <= 0) return [];

  const trimmed = query.trim().toLowerCase();

  const seen = new Set<string>();
  const prefixMatches: string[] = [];
  const otherMatches: string[] = [];

  for (const suggestion of suggestions) {
    const lower = suggestion.toLowerCase();

    if (seen.has(lower)) continue;

    if (trimmed === "") {
      // No query: surface everything, in order, de-duplicated.
      seen.add(lower);
      prefixMatches.push(suggestion);
      continue;
    }

    const matchIndex = lower.indexOf(trimmed);
    if (matchIndex === -1) continue;

    if (opts?.excludeExact && lower === trimmed) continue;

    seen.add(lower);
    if (matchIndex === 0) {
      prefixMatches.push(suggestion);
    } else {
      otherMatches.push(suggestion);
    }
  }

  return [...prefixMatches, ...otherMatches].slice(0, limit);
}
