import re

from collections import Counter

_GENERIC_TERMS = {
    "about",
    "above",
    "after",
    "also",
    "always",
    "another",
    "any",
    "back",
    "best",
    "between",
    "both",
    "button",
    "click",
    "contact",
    "could",
    "each",
    "email",
    "every",
    "find",
    "first",
    "free",
    "from",
    "get",
    "have",
    "help",
    "here",
    "home",
    "into",
    "just",
    "learn",
    "like",
    "link",
    "make",
    "more",
    "most",
    "next",
    "open",
    "over",
    "page",
    "read",
    "right",
    "same",
    "shop",
    "some",
    "start",
    "than",
    "that",
    "their",
    "then",
    "there",
    "these",
    "they",
    "this",
    "through",
    "time",
    "under",
    "view",
    "want",
    "ways",
    "what",
    "when",
    "where",
    "which",
    "while",
    "with",
    "within",
    "work",
    "your",
    "yours",
}


def is_salient_topic(term: str) -> bool:
    normalized = term.strip().lower()
    return (
        len(normalized) >= 4
        and bool(re.fullmatch(r"[a-z]+", normalized))
        and normalized not in _GENERIC_TERMS
    )


def extract_topics(pages, limit: int = 25) -> list[tuple[str, int]]:
    """Rank title terms above description terms while excluding generic UI language."""
    scores: Counter[str] = Counter()
    for page in pages:
        for word in re.findall(r"[a-zA-Z]{4,}", page.title or ""):
            normalized = word.lower()
            if is_salient_topic(normalized):
                scores[normalized] += 3
        for word in re.findall(r"[a-zA-Z]{4,}", page.description or ""):
            normalized = word.lower()
            if is_salient_topic(normalized):
                scores[normalized] += 1
    return scores.most_common(limit)
