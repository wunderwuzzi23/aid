#!/usr/bin/env python3
"""
Acrostic Detector — Comprehensive hidden message scanner.

Modes detected:
  1. First letter of every word (across entire text)
  2. First letter of every sentence
  3. Last letter of every word
  4. Last letter of every sentence
  5. First letter of every line
  6. Last letter of every line
  7. Nth letter of every word (configurable)
  8. Nth letter of every sentence (configurable)
  9. First word of every sentence
 10. Last word of every sentence
 11. First letter of every word, per sentence (shows each sentence's hidden word)
 12. Diagonal / positional (word N, letter N per sentence)

Usage:
    python acrostic_detector.py                        # interactive prompt
    python acrostic_detector.py -f myfile.txt          # from file
    python acrostic_detector.py -t "Your text here"    # inline text
    python acrostic_detector.py -f myfile.txt --all    # show all modes
    python acrostic_detector.py -f myfile.txt --mode 1 # specific mode
"""

import re
import sys
import argparse
from textwrap import wrap


# ─────────────────────────────────────────────
# Text helpers
# ─────────────────────────────────────────────

def clean_word(w: str) -> str:
    """Strip punctuation from a word, keeping only alpha chars."""
    return re.sub(r"[^a-zA-Z]", "", w)


def tokenize_words(text: str) -> list[str]:
    """Return all words (stripped of punctuation) from text."""
    return [w for w in text.split() if clean_word(w)]


def tokenize_sentences(text: str) -> list[str]:
    """Split text into sentences."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in sentences if s.strip()]


def tokenize_lines(text: str) -> list[str]:
    """Split text into non-empty lines."""
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def words_in(sentence: str) -> list[str]:
    return [w for w in sentence.split() if clean_word(w)]


# ─────────────────────────────────────────────
# Extraction functions  →  each returns a list of (token_label, char/word)
# ─────────────────────────────────────────────

def extract_first_letter_every_word(text):
    words = tokenize_words(text)
    return [(w, clean_word(w)[0].upper()) for w in words if clean_word(w)]


def extract_last_letter_every_word(text):
    words = tokenize_words(text)
    return [(w, clean_word(w)[-1].upper()) for w in words if clean_word(w)]


def extract_first_letter_every_sentence(text):
    sentences = tokenize_sentences(text)
    result = []
    for s in sentences:
        ws = words_in(s)
        if ws:
            result.append((s[:60] + ("…" if len(s) > 60 else ""),
                           clean_word(ws[0])[0].upper()))
    return result


def extract_last_letter_every_sentence(text):
    sentences = tokenize_sentences(text)
    result = []
    for s in sentences:
        ws = words_in(s)
        if ws:
            result.append((s[:60] + ("…" if len(s) > 60 else ""),
                           clean_word(ws[-1])[-1].upper()))
    return result


def extract_first_letter_every_line(text):
    lines = tokenize_lines(text)
    result = []
    for ln in lines:
        ws = words_in(ln)
        if ws:
            result.append((ln[:60] + ("…" if len(ln) > 60 else ""),
                           clean_word(ws[0])[0].upper()))
    return result


def extract_last_letter_every_line(text):
    lines = tokenize_lines(text)
    result = []
    for ln in lines:
        ws = words_in(ln)
        if ws:
            result.append((ln[:60] + ("…" if len(ln) > 60 else ""),
                           clean_word(ws[-1])[-1].upper()))
    return result


def extract_nth_letter_every_word(text, n=2):
    """1-indexed. n=2 → second letter of each word."""
    words = tokenize_words(text)
    result = []
    for w in words:
        cw = clean_word(w)
        if len(cw) >= n:
            result.append((w, cw[n - 1].upper()))
    return result


def extract_nth_letter_every_sentence(text, n=2):
    sentences = tokenize_sentences(text)
    result = []
    for s in sentences:
        ws = words_in(s)
        if len(ws) >= n:
            cw = clean_word(ws[n - 1])
            if cw:
                result.append((s[:60] + ("…" if len(s) > 60 else ""),
                               cw[0].upper()))
    return result


def extract_first_word_every_sentence(text):
    sentences = tokenize_sentences(text)
    result = []
    for s in sentences:
        ws = words_in(s)
        if ws:
            result.append((s[:60] + ("…" if len(s) > 60 else ""),
                           clean_word(ws[0]).upper()))
    return result


def extract_last_word_every_sentence(text):
    sentences = tokenize_sentences(text)
    result = []
    for s in sentences:
        ws = words_in(s)
        if ws:
            result.append((s[:60] + ("…" if len(s) > 60 else ""),
                           clean_word(ws[-1]).upper()))
    return result


def extract_first_letter_per_word_per_sentence(text):
    """
    Per sentence: collect first letters of each word → shows if individual
    sentences encode a word.
    Returns list of (sentence_preview, encoded_string).
    """
    sentences = tokenize_sentences(text)
    result = []
    for s in sentences:
        ws = words_in(s)
        letters = "".join(clean_word(w)[0].upper() for w in ws if clean_word(w))
        result.append((s[:60] + ("…" if len(s) > 60 else ""), letters))
    return result


def extract_diagonal(text):
    """
    Sentence N, word N, first letter.
    i.e. sentence 1 → word 1, sentence 2 → word 2, etc.
    """
    sentences = tokenize_sentences(text)
    result = []
    for i, s in enumerate(sentences):
        ws = words_in(s)
        if len(ws) > i:
            cw = clean_word(ws[i])
            if cw:
                result.append((f"S{i+1} W{i+1}: {s[:50]}…",
                               cw[0].upper()))
    return result


# ─────────────────────────────────────────────
# Scoring / readability heuristic
# ─────────────────────────────────────────────

COMMON_ENGLISH = set("""
the be to of and a in that have it for not on with he as you do at
this but his by from they we say her she or an will my one all would
there their what so up out if about who get which go me when make can
like time no just him know take people into year your good some could
them see other than then now look only come its over think also back
after use two how our work first well way even new want because any
these give day most us
""".split())


def score_message(msg: str) -> float:
    """
    Heuristic score for how 'meaningful' a letter string looks.
    Higher = more likely intentional.
    """
    if not msg:
        return 0.0
    msg_lower = msg.lower()
    score = 0.0

    # Favour strings that contain common English words (min length 3)
    for length in range(3, min(len(msg_lower) + 1, 12)):
        for start in range(len(msg_lower) - length + 1):
            substr = msg_lower[start:start + length]
            if substr in COMMON_ENGLISH:
                score += length * 1.5

    # Penalise runs of uncommon consonant clusters
    consonant_run = max((len(m.group()) for m in re.finditer(r'[bcdfghjklmnpqrstvwxyz]{4,}', msg_lower)), default=0)
    score -= consonant_run * 2

    # Reward if it looks like real words separated by spaces (word extraction modes)
    words = msg.split()
    if len(words) > 1:
        score += len(words) * 3

    return round(score, 2)


# ─────────────────────────────────────────────
# Display helpers
# ─────────────────────────────────────────────

COL_W = 72

def hr(char="─"):
    return char * COL_W

def print_mode(title, pairs, show_tokens=True, top_n=None):
    message = "".join(ch for _, ch in pairs)
    score = score_message(message)

    print(hr())
    print(f"  {title}")
    print(f"  Message : {message}")
    print(f"  Score   : {score}")
    print(hr("·"))

    if show_tokens:
        display = pairs if top_n is None else pairs[:top_n]
        for token, ch in display:
            token_disp = token if len(token) <= 45 else token[:42] + "…"
            print(f"    {ch}  ←  {token_disp}")
        if top_n and len(pairs) > top_n:
            print(f"    … ({len(pairs) - top_n} more)")
    print()


def print_sentence_mode(title, pairs):
    """For per-sentence word-level extractions."""
    print(hr())
    print(f"  {title}")
    print(hr("·"))
    for token, word in pairs:
        token_disp = token if len(token) <= 40 else token[:37] + "…"
        score = score_message(word)
        flag = "  ★" if score > 5 else ""
        print(f"    {word:<20}  ←  {token_disp}{flag}")
    all_words = " ".join(w for _, w in pairs)
    print(f"\n  All first-words : {all_words}")
    print()


# ─────────────────────────────────────────────
# Main runner
# ─────────────────────────────────────────────

MODES = {
    1:  ("First letter of every WORD",               extract_first_letter_every_word,        "letter"),
    2:  ("Last letter of every WORD",                extract_last_letter_every_word,          "letter"),
    3:  ("First letter of every SENTENCE",           extract_first_letter_every_sentence,     "letter"),
    4:  ("Last letter of every SENTENCE",            extract_last_letter_every_sentence,      "letter"),
    5:  ("First letter of every LINE",               extract_first_letter_every_line,         "letter"),
    6:  ("Last letter of every LINE",                extract_last_letter_every_line,          "letter"),
    7:  ("2nd letter of every WORD",                 lambda t: extract_nth_letter_every_word(t, 2), "letter"),
    8:  ("3rd letter of every WORD",                 lambda t: extract_nth_letter_every_word(t, 3), "letter"),
    9:  ("2nd letter of every SENTENCE",             lambda t: extract_nth_letter_every_sentence(t, 2), "letter"),
    10: ("3rd letter of every SENTENCE",             lambda t: extract_nth_letter_every_sentence(t, 3), "letter"),
    11: ("First WORD of every sentence",             extract_first_word_every_sentence,       "word"),
    12: ("Last WORD of every sentence",              extract_last_word_every_sentence,        "word"),
    13: ("First letters of each word PER SENTENCE",  extract_first_letter_per_word_per_sentence, "per_sentence"),
    14: ("Diagonal (sentence N → word N → letter 1)",extract_diagonal,                        "letter"),
}


def run_all(text: str, verbose=True):
    print(hr("═"))
    print("  ACROSTIC DETECTOR — Full Scan")
    print(hr("═"))
    print()

    results = []

    for mode_id, (title, fn, kind) in MODES.items():
        pairs = fn(text)
        if not pairs:
            continue

        if kind == "per_sentence":
            if verbose:
                print_sentence_mode(f"Mode {mode_id}: {title}", pairs)
        else:
            message = "".join(ch for _, ch in pairs)
            score = score_message(message)
            results.append((score, mode_id, title, pairs, kind))
            if verbose:
                print_mode(f"Mode {mode_id}: {title}", pairs,
                           show_tokens=(mode_id in (1, 2) and len(pairs) <= 80)
                                        or mode_id not in (1, 2))

    # Summary: ranked by score
    print(hr("═"))
    print("  RANKED RESULTS (by message-readability score)")
    print(hr("═"))
    results.sort(reverse=True)
    for score, mode_id, title, pairs, kind in results:
        message = "".join(ch for _, ch in pairs)
        print(f"  [{score:6.1f}]  Mode {mode_id:2d}: {title}")
        print(f"           → {message[:80]}{'…' if len(message)>80 else ''}")
    print()


def run_single(text: str, mode_id: int):
    if mode_id not in MODES:
        print(f"Unknown mode {mode_id}. Choose 1–{max(MODES)}.")
        return
    title, fn, kind = MODES[mode_id]
    pairs = fn(text)
    if kind == "per_sentence":
        print_sentence_mode(f"Mode {mode_id}: {title}", pairs)
    else:
        print_mode(f"Mode {mode_id}: {title}", pairs)


# ─────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Acrostic Detector — find hidden messages in text.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument("-f", "--file",   help="Path to input text file")
    parser.add_argument("-t", "--text",   help="Inline text to analyse")
    parser.add_argument("--mode",  type=int, default=None,
                        help="Run a single mode (1–14). Default: all modes.")
    parser.add_argument("--all",   action="store_true",
                        help="Show full token list for all modes (default: smart truncate)")
    parser.add_argument("--list-modes", action="store_true",
                        help="List all available modes and exit")

    args = parser.parse_args()

    if args.list_modes:
        print("\nAvailable modes:")
        for mid, (title, _, _) in MODES.items():
            print(f"  {mid:2d}. {title}")
        print()
        return

    # Get text
    text = None
    if args.file:
        try:
            with open(args.file, "r", encoding="utf-8") as f:
                text = f.read()
        except FileNotFoundError:
            print(f"File not found: {args.file}")
            sys.exit(1)
    elif args.text:
        text = args.text
    else:
        print("Paste your text below (press Enter twice when done):\n")
        lines = []
        while True:
            try:
                line = input()
                if line == "" and lines and lines[-1] == "":
                    break
                lines.append(line)
            except EOFError:
                break
        text = "\n".join(lines).strip()

    if not text:
        print("No text provided.")
        sys.exit(1)

    print(f"\nAnalysing {len(text)} characters, "
          f"{len(tokenize_words(text))} words, "
          f"{len(tokenize_sentences(text))} sentences, "
          f"{len(tokenize_lines(text))} lines.\n")

    if args.mode:
        run_single(text, args.mode)
    else:
        run_all(text, verbose=True)


if __name__ == "__main__":
    main()
