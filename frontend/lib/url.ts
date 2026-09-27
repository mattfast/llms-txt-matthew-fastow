/** Normalizes user input (e.g. "amazon.com" or "https://amazon.com/") into a full,
 * backend-acceptable URL, or returns null if the input isn't a plausible domain/URL. */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
