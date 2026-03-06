/**
 * AID – ASCII Smuggling Detector
 * Character mappings, category sets, and detection utilities.
 * Ported from the Python `aid` CLI tool with full parity.
 *
 * NOTE: Uses `var` instead of `const` so that re-injection into the same
 * page context (e.g. re-scan) doesn't throw "already been declared".
 */

// ─── Primary Detection Set (always active) ──────────────────────────────────

var INVISIBLE_CHARS = {
  // Format controls and joiners
  '\u034F': 'COMBINING GRAPHEME JOINER',
  '\u061C': 'ARABIC LETTER MARK',
  '\u180E': 'MONGOLIAN VOWEL SEPARATOR',

  // Zero-width characters
  '\u200B': 'ZERO WIDTH SPACE',
  '\u200C': 'ZERO WIDTH NON-JOINER',
  '\u200D': 'ZERO WIDTH JOINER',
  '\u2060': 'WORD JOINER',

  // Directional / bidi marks
  '\u200E': 'LEFT-TO-RIGHT MARK',
  '\u200F': 'RIGHT-TO-LEFT MARK',
  '\u202A': 'LEFT-TO-RIGHT EMBEDDING',
  '\u202B': 'RIGHT-TO-LEFT EMBEDDING',
  '\u202C': 'POP DIRECTIONAL FORMATTING',
  '\u202D': 'LEFT-TO-RIGHT OVERRIDE',
  '\u202E': 'RIGHT-TO-LEFT OVERRIDE',
  '\u2066': 'LEFT-TO-RIGHT ISOLATE',
  '\u2067': 'RIGHT-TO-LEFT ISOLATE',
  '\u2068': 'FIRST STRONG ISOLATE',
  '\u2069': 'POP DIRECTIONAL ISOLATE',

  // Invisible operators (math/layout)
  '\u2061': 'FUNCTION APPLICATION',
  '\u2062': 'INVISIBLE TIMES',
  '\u2063': 'INVISIBLE SEPARATOR',
  '\u2064': 'INVISIBLE PLUS',

  // Deprecated format controls
  '\u206A': 'INHIBIT SYMMETRIC SWAPPING',
  '\u206B': 'ACTIVATE SYMMETRIC SWAPPING',
  '\u206C': 'INHIBIT ARABIC FORM SHAPING',
  '\u206D': 'ACTIVATE ARABIC FORM SHAPING',
  '\u206E': 'NATIONAL DIGIT SHAPES',
  '\u206F': 'NOMINAL DIGIT SHAPES',

  // BOM / ZWNBSP
  '\uFEFF': 'ZERO WIDTH NO-BREAK SPACE',

  // Variation Selectors (VS1–VS16)
  '\uFE00': 'VARIATION SELECTOR-1',
  '\uFE01': 'VARIATION SELECTOR-2',
  '\uFE02': 'VARIATION SELECTOR-3',
  '\uFE03': 'VARIATION SELECTOR-4',
  '\uFE04': 'VARIATION SELECTOR-5',
  '\uFE05': 'VARIATION SELECTOR-6',
  '\uFE06': 'VARIATION SELECTOR-7',
  '\uFE07': 'VARIATION SELECTOR-8',
  '\uFE08': 'VARIATION SELECTOR-9',
  '\uFE09': 'VARIATION SELECTOR-10',
  '\uFE0A': 'VARIATION SELECTOR-11',
  '\uFE0B': 'VARIATION SELECTOR-12',
  '\uFE0C': 'VARIATION SELECTOR-13',
  '\uFE0D': 'VARIATION SELECTOR-14',
  '\uFE0E': 'VARIATION SELECTOR-15',
  '\uFE0F': 'VARIATION SELECTOR-16',
};

// ─── Optional: Confusable / Suspicious Spaces and Fillers ────────────────────

var CONFUSABLE_SPACE_CHARS = {
  '\u00A0': 'NO-BREAK SPACE',
  '\u00AD': 'SOFT HYPHEN',
  '\u2000': 'EN QUAD',
  '\u2001': 'EM QUAD',
  '\u2002': 'EN SPACE',
  '\u2003': 'EM SPACE',
  '\u2004': 'THREE-PER-EM SPACE',
  '\u2005': 'FOUR-PER-EM SPACE',
  '\u2006': 'SIX-PER-EM SPACE',
  '\u2007': 'FIGURE SPACE',
  '\u2008': 'PUNCTUATION SPACE',
  '\u2009': 'THIN SPACE',
  '\u200A': 'HAIR SPACE',
  '\u202F': 'NARROW NO-BREAK SPACE',
  '\u205F': 'MEDIUM MATHEMATICAL SPACE',
  '\u2800': 'BRAILLE PATTERN BLANK',
  '\u3000': 'IDEOGRAPHIC SPACE',
  '\u3164': 'HANGUL FILLER',
  '\uFFA0': 'HALFWIDTH HANGUL FILLER',
};

// ─── Unicode Tags (U+E0000 – U+E007F) ───────────────────────────────────────

var TAG_START = 0xE0000;
var TAG_END = 0xE007F;

function isUnicodeTag(codePoint) {
  return codePoint >= TAG_START && codePoint <= TAG_END;
}

function decodeUnicodeTag(codePoint) {
  if (codePoint === 0xE0001) return '[TAG_START]';
  if (codePoint === 0xE007F) return '[TAG_END]';
  if (codePoint >= 0xE0020 && codePoint <= 0xE007E) {
    return String.fromCharCode(codePoint - 0xE0000);
  }
  return `[TAG:${codePoint.toString(16)}]`;
}

// ─── Variation Selector Supplements (VS17–VS256) ────────────────────────────

var VS_SUPPLEMENT_START = 0xE0100;
var VS_SUPPLEMENT_END = 0xE01EF;

function isVariationSelectorSupplement(codePoint) {
  return codePoint >= VS_SUPPLEMENT_START && codePoint <= VS_SUPPLEMENT_END;
}

function variationSelectorName(codePoint) {
  return `VARIATION SELECTOR-${codePoint - VS_SUPPLEMENT_START + 17}`;
}

// ─── Optional: Control Characters (Cc) ──────────────────────────────────────

var SKIP_CC = new Set(['\t', '\n', '\r']);

function isControlChar(char) {
  const cp = char.codePointAt(0);
  return ((cp <= 0x1F) || (cp >= 0x7F && cp <= 0x9F)) && !SKIP_CC.has(char);
}

function controlCharName(char) {
  const cp = char.codePointAt(0);
  return `CONTROL CHARACTER U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

// ─── Optional: Space Separators (Zs) ────────────────────────────────────────

var ZS_CHARS = new Set([
  '\u00A0', '\u1680', '\u2000', '\u2001', '\u2002', '\u2003', '\u2004',
  '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200A', '\u202F',
  '\u205F', '\u3000',
]);

function isSpaceSeparator(char) {
  return ZS_CHARS.has(char);
}

function zsCharName(char) {
  const cp = char.codePointAt(0);
  return `SPACE SEPARATOR U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

// ─── Category Sets (for summary breakdown) ──────────────────────────────────

var ZERO_WIDTH_CHARS = new Set(['\u034F', '\u180E', '\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF']);
var DIRECTIONAL_MARKS = new Set(['\u061C', '\u200E', '\u200F', '\u202A', '\u202B', '\u202C',
  '\u202D', '\u202E', '\u2066', '\u2067', '\u2068', '\u2069']);
var INVISIBLE_OPERATORS = new Set(['\u2061', '\u2062', '\u2063', '\u2064']);
var DEPRECATED_CONTROLS = new Set(['\u206A', '\u206B', '\u206C', '\u206D', '\u206E', '\u206F']);
var SPACE_LIKE_CHARS = new Set(Object.keys(CONFUSABLE_SPACE_CHARS));
var VS_BASIC = new Set(Array.from({ length: 16 }, (_, i) => String.fromCharCode(0xFE00 + i)));

// ─── Suspicion Thresholds ───────────────────────────────────────────────────

var HIGH_CONSECUTIVE_RUN_THRESHOLD = 10;
var CRITICAL_CONSECUTIVE_RUN_THRESHOLD = 40;
var SPARSE_HIGH_TOTAL_THRESHOLD = 100;

/**
 * Classify a finding into a category for the summary breakdown.
 * Mirrors the Python main() category classification.
 */
function classifyCategory(finding) {
  const char = finding.char;
  if (finding.type === 'tag') return 'Unicode Tags';
  if (ZERO_WIDTH_CHARS.has(char)) return 'Zero-Width & Joiners';
  if (DIRECTIONAL_MARKS.has(char)) return 'Directional & Bidi Marks';
  if (VS_BASIC.has(char)) return 'Variation Selectors';
  if (finding.type === 'invisible' && isVariationSelectorSupplement(char.codePointAt(0)))
    return 'Variation Selectors';
  if (INVISIBLE_OPERATORS.has(char)) return 'Invisible Operators';
  if (DEPRECATED_CONTROLS.has(char)) return 'Deprecated Format Controls';
  if (finding.type === 'space_like') return 'Space-Like / Blank Chars';
  if (finding.type === 'cc') return 'Control Characters (Cc)';
  if (finding.type === 'zs') return 'Space Separators (Zs)';
  return 'Other Invisible';
}

// ─── Dictionary for Autocomplete ────────────────────────────────────────────

var _allKnownCharacters = null;

/**
 * Returns a comprehensive array of all known characters to power the 
 * autocomplete filter UI. Format: { char, name, codeStr }
 */
function getAllKnownCharacters() {
  if (_allKnownCharacters) return _allKnownCharacters;

  const list = [];

  function add(char, name, searchCategory) {
    const cp = char.codePointAt(0);
    const codeStr = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    list.push({ char, name, codeStr, searchCategory, type: classifyCategory({ char, type: 'invisible' }) });
  }

  // 1. Primary
  for (const [char, name] of Object.entries(INVISIBLE_CHARS)) {
    // VS1-16 are in INVISIBLE_CHARS but we add them separately below with ASCII info
    const cp = char.codePointAt(0);
    if (cp >= 0xFE00 && cp <= 0xFE0F) continue;
    add(char, name, 'invisible');
  }

  // 1.5 NBSP
  add('\u00A0', 'NO-BREAK SPACE', 'space');

  // 2. Confusables
  for (const [char, name] of Object.entries(CONFUSABLE_SPACE_CHARS)) {
    if (char !== '\u00A0') add(char, name, 'space'); // already added
  }

  // 3. Variation Selectors (VS17-VS256)
  for (let cp = VS_SUPPLEMENT_START; cp <= VS_SUPPLEMENT_END; cp++) {
    const char = String.fromCodePoint(cp);
    let name = variationSelectorName(cp);
    let lowByte = cp - VS_SUPPLEMENT_START;
    let asciiStr = (lowByte >= 32 && lowByte <= 126) ? String.fromCharCode(lowByte) : `0x${lowByte.toString(16).padStart(2, '0')}`;
    add(char, `${name} (ASCII: ${asciiStr})`, 'variation');
  }

  // 3.5 Variation Selectors (VS1-16)
  for (let i = 0; i < 16; i++) {
    const cp = 0xFE00 + i;
    const char = String.fromCodePoint(cp);
    add(char, `VARIATION SELECTOR-${i + 1} (ASCII: 0x${i.toString(16).padStart(2, '0')})`, 'variation');
  }

  // 4. Unicode Tags (U+E0000 - U+E007F) - These are the ones that actually map to ASCII
  for (let cp = TAG_START; cp <= TAG_END; cp++) {
    const char = String.fromCodePoint(cp);
    let decoded = decodeUnicodeTag(cp);
    // Make the ASCII counterpart obvious
    add(char, `UNICODE TAG (ASCII: ${decoded})`, 'tag');
  }

  // 5. Control Characters (Cc)
  for (let cp = 0; cp <= 0x1F; cp++) {
    const char = String.fromCodePoint(cp);
    if (!SKIP_CC.has(char)) {
      add(char, controlCharName(char), 'control');
    }
  }
  for (let cp = 0x7F; cp <= 0x9F; cp++) {
    const char = String.fromCodePoint(cp);
    add(char, controlCharName(char), 'control');
  }

  // 6. Space Separators (Zs)
  for (const char of ZS_CHARS) {
    if (char !== '\u00A0' && !CONFUSABLE_SPACE_CHARS[char]) {
      add(char, zsCharName(char), 'space');
    }
  }

  // Sort alphabetically by name
  list.sort((a, b) => a.name.localeCompare(b.name));

  _allKnownCharacters = list;
  return list;
}

// ─── Shared Character Name Resolver ─────────────────────────────────────────
// Resolves a full verbose display name for a single character, used by
// panel.js and popup.js for filter dropdowns. Defined here to avoid duplication.

function resolveCharName(char) {
  const cp = char.codePointAt(0);
  const codeStr = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

  if (INVISIBLE_CHARS[char])
    return `${codeStr}  ${INVISIBLE_CHARS[char]}`;
  if (CONFUSABLE_SPACE_CHARS[char])
    return `${codeStr}  ${CONFUSABLE_SPACE_CHARS[char]}`;
  if (isUnicodeTag(cp)) {
    const decoded = decodeUnicodeTag(cp);
    return `${codeStr}  UNICODE TAG (ASCII: ${decoded})`;
  }
  if (isVariationSelectorSupplement(cp)) {
    const name = variationSelectorName(cp);
    const lowByte = cp - VS_SUPPLEMENT_START;
    const asciiStr = (lowByte >= 32 && lowByte <= 126) ? String.fromCharCode(lowByte) : `0x${lowByte.toString(16).padStart(2, '0')}`;
    return `${codeStr}  ${name} (ASCII: ${asciiStr})`;
  }
  if (isControlChar(char))
    return `${codeStr}  ${controlCharName(char)}`;
  if (isSpaceSeparator(char))
    return `${codeStr}  ${zsCharName(char)}`;
  return codeStr;
}
