# AID Extension Test Page — Invisible Unicode Payloads

This document contains hidden Unicode payloads for testing the AID browser extension.
View this file on GitHub and open the extension to verify detection and decoding.

## Test 1: Unicode Tags (ASCII Smuggling)

This sentence looks normal.󠁈󠁉󠁄󠁄󠁅󠁎󠁟󠁓󠁍󠁕󠁇󠁇󠁌󠁅󠁄󠁟󠁐󠁁󠁙󠁌󠁏󠁁󠁄 But it contains a hidden message encoded in Unicode Tag characters.

## Test 2: Variation Selector Supplements (VS17-256)

Another innocent looking paragraph.󠅃󠄵󠄳󠅂󠄵󠅄 With VS17-256 encoded data hidden inline.

## Test 3: Zero-Width Binary Steganography

Clean text here.​‌​‌​​‌‌​‌​​‌‌​‌​‌​‌​‌​‌​‌​​​‌‌‌​‌​​​‌‌‌​‌​​‌‌​​​‌​​​‌​‌​‌​​​‌​​ Binary data hidden via ZWSP/ZWNJ pairs encoding a full word.

## Test 4: Bidirectional Control Marks

Normal text‎‏‪‫‬ with directional formatting marks injected (trojan source style).

## Test 5: Soft Hyphens (Document Fingerprinting)

Imp­ort­ant doc­um­ent with soft hyphens inserted for text fingerprinting.

## Expected Results

| Test | Type | Count | Expected Decode | Auto-Detection |
|------|------|-------|-----------------|----------------|
| 1 | Unicode Tags (U+E0000) | 22 | HIDDEN_SMUGGLED_PAYLOAD | Should trigger Critical suspicion on tag run |
| 2 | VS Supplements (VS17-256) | 6 | SECRET | Detected as variation selectors |
| 3 | ZWSP/ZWNJ Binary | 64 | SMUGGLED (Config A or B) | Should trigger sneaky bits auto-detection (64 chars, 100% two-char alternation, well above 70% threshold and 12-char minimum) |
| 4 | BiDi Marks | 5 | N/A | LTR/RTL/embedding marks flagged |
| 5 | Soft Hyphens | 4 | N/A | Fingerprinting markers flagged |

## Notes

- The Markdown version embeds raw Unicode characters directly (no HTML entities).
- GitHub is a primary target for this extension — this file tests detection in rendered Markdown.
- Test 3 encodes "SMUGGLED" as 8 ASCII bytes = 64 bits using ZWSP (U+200B) as 0 and ZWNJ (U+200C) as 1.
- Test 2 uses the extension's VS decode formula: `ascii = codepoint - 0xE0100 + 16`.
- Test 1 should produce a Critical suspicion level due to the Unicode Tag run length.
