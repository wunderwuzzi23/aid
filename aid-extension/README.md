# ASS - ASCII Smuggling Surfacer

Browser extension for detecting and inspecting invisible Unicode characters embedded in web page text. It surfaces steganographic content, hidden payloads, and Unicode smuggling techniques directly in the browser.

Based on the [`aid`](https://github.com/wunderwuzzi23/aid) Python CLI scanner.

---

## Installation

### Chrome Web Store

Install directly from the [Chrome Web Store](#) *(link to your listing)*.

### Manual (Developer Mode)

**Chrome / Edge / Brave**

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `aid-extension` folder

**Firefox**

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select the `manifest.json` file inside the `aid-extension` folder

---

## Basic Usage

1. Navigate to a web page you want to inspect.
2. Click the **ASS icon** in the browser toolbar to open the popup.
3. Click **Scan This Page**.
4. Invisible characters on the page will be highlighted with a colored glow.
5. **Hover** over a highlight to see a tooltip with the character name, code point, run length, and category.
6. **Click** a highlight to expand decoded text inline beneath it.
7. Click **Open Detail Panel** in the popup to open the full side panel report.

---

## Popup

The popup is the main entry point. It displays:

- **Scan This Page** button — triggers an immediate scan of the active tab.
- **Re-scan Page** button — appears after a scan has been run; rescans the page.
- **Suspicion level badge** — the overall page severity: Info, Medium, High, or Critical.
- **Category breakdown** — a count per detected character category (e.g. Zero-Width, Unicode Tags, Variation Selectors).
- **Open Detail Panel** button — opens the side panel with the full report.
- **Settings section** — see [Settings](#settings) below.

---

## Detail Panel

The side panel provides the full inspection report. It opens alongside the page and updates automatically when a scan completes.

### Summary

Displays the suspicion level, the reason for that level, total invisible code points found, unique character count, longest consecutive run, and longest Unicode tag run.

### Category Breakdown

Lists each detected character category with its occurrence count, sorted by frequency.

### Decoded Strings

If Unicode Tags, Variation Selectors, or binary-encoded hidden messages are found, the decoded plaintext strings are listed in this section, grouped by encoding type (Unicode Tags, Variation Selectors, Zero-Width, etc.).

### Detection Cards

Each detected character or consecutive run appears as a card showing:

- Character name and type
- Number of consecutive characters in the run
- Code point(s)
- Decoded text (if any)
- Surrounding context
- A **Highlight occurrence** button — scrolls the page to that detection and pulses the highlight

### Expand All / Collapse All

The **Expand All** button in the panel header expands all inline decoded text on the page simultaneously. Clicking it again collapses them.

### Export

The export menu (top right of the panel header) provides two formats:

- **JSON** — full structured report matching the Python tool's output format
- **CSV** — flat row-per-detection export

Exported filenames include a timestamp (e.g. `ass-report-1746066000000.json`).

---

## Dynamic Payload Decoder

This section in the detail panel decodes binary payloads hidden using pairs of invisible characters (a steganographic technique where two character types represent binary `0` and `1`).

**How to use it:**

1. After a scan, open the detail panel.
2. In the **Dynamic Payload Decoder** section, two dropdowns list the detected invisible characters sorted by frequency.
3. Assign **Char 0** (represents binary `0`) and **Char 1** (represents binary `1`) using the dropdowns.
4. The decoder will group consecutive runs of those characters, assemble a binary string, and attempt ASCII decoding.
5. Both the selected mapping (**Configuration A**) and its inverse (**Configuration B**) are shown.
6. Use the **Flip** button to swap the two character assignments.

**Auto-suggest:** If two character types dominate more than 50% (configurable via the threshold slider) of the hidden characters found, the decoder auto-suggests them as Char 0 and Char 1. The hint text indicates when auto-suggest is active.

Each decoded result shows:
- Decoded ASCII text (if printable)
- Hex representation
- Binary string
- Copy buttons for decoded text, binary, and hex

---

## Detection Filter

The filter controls which characters are included in or excluded from the scan results. It is located in the detail panel under the **Filter** section.

**Using the filter input:**

1. Type a character name or code point (e.g. `U+200B` or `zero-width`) into the filter input.
2. A dropdown of matching characters appears.
3. Select a character to add it as a filter chip.
4. New chips default to **Exclude** mode — that character type is hidden from results.
5. Click the toggle on a chip to cycle through: **Exclude (−)** → **Disabled (×)** → **Include (+)** → back.
6. Click **×** on a chip to remove it entirely.

**Category toggles** — each of the major character categories (Zero-Width, Tags, Bidi, etc.) can be toggled between Include and Exclude at the category level.

**Fuzzy Search** — when enabled, the filter input matches any word in any order against the character name and code point string.

Changes to the filter trigger a re-scan automatically.

---

## Settings

Settings are accessible from the popup (gear icon or settings section) and are persisted across sessions.

| Setting | Default | Description |
|---|---|---|
| Auto-scan pages | Off | Automatically scans each page when it loads, without opening the popup |
| Auto-Hitchhiker | Off | Automatically applies the Hitchhiker's Guide theme when the page exceeds the HHG threshold |
| HHG Threshold | 800 | Total invisible code points required to trigger auto-Hitchhiker mode |
| Visual Profile | Default | Controls the color theme of the panel UI. See [Themes](#themes) |
| Highlight Style | Nimbus | Controls the style of the glow overlay on detected characters |
| Fuzzy Search | On | Enables fuzzy matching in the Detection Filter input |
| Detect NO-BREAK SPACE | Off | Includes U+00A0 in scan results |
| Detect confusable spaces | Off | Includes soft hyphen, quads, thin/hair space, braille blank, and hangul filler |
| Detect control chars (Cc) | Off | Includes all Unicode Cc category characters, excluding TAB (U+0009), LF (U+000A), and CR (U+000D) |
| Detect space separators (Zs) | Off | Includes all Unicode Zs category characters, excluding ASCII space (U+0020) |
| Expand to names | Off | When expanding a highlight inline, shows the character name alongside decoded text |
| Disable tooltips | Off | Suppresses hover tooltips on highlights |
| Sequence length filter | Min: 1, Max: 0 | Restricts which runs are highlighted. Min is the smallest run size to include. Max is the largest (0 = no upper limit) |
| Sneaky Bits auto-threshold | 50% | Percentage dominance threshold for the Dynamic Payload Decoder auto-suggest |

---

## Suspicion Levels

The page suspicion level is calculated from the total invisible code point count and the length of the longest consecutive run.

| Level | Trigger Condition |
|---|---|
| 🔴 Critical | Longest consecutive run ≥ 40 characters |
| 🟠 High | Longest run ≥ 10, or total code points > 100 (sparse) |
| 🟡 Medium | Total code points 10–100 (sparse) |
| 🔵 Info | Total code points < 10 |

---

## Detected Character Types

### Always Detected

| Category | Characters |
|---|---|
| Unicode Tags | U+E0000–U+E007F, decoded to ASCII |
| Zero-Width & Joiners | ZWSP (U+200B), ZWNJ (U+200C), ZWJ (U+200D), Word Joiner (U+2060), CGJ (U+034F), ZWNBSP (U+FEFF) |
| Directional & Bidi Marks | LRM (U+200E), RLM (U+200F), embeddings (U+202A–U+202B), overrides (U+202D–U+202E), isolates (U+2066–U+2069), and related |
| Variation Selectors | VS1–VS16 (U+FE00–U+FE0F) and VS17–VS256 (U+E0100–U+E01EF) |
| Invisible Operators | Function application (U+2061), invisible times (U+2062), invisible separator (U+2063), invisible plus (U+2064) |
| Deprecated Format Controls | U+206A–U+206F |

### Detected When Enabled in Settings

| Category | Characters |
|---|---|
| NO-BREAK SPACE | U+00A0 |
| Confusable Spaces | Soft hyphen (U+00AD), em/en/figure/punctuation quads, thin/hair/narrow spaces, braille blank (U+2800), hangul filler (U+3164), halfwidth hangul filler (U+FFA0) |
| Control Characters (Cc) | All Unicode Cc characters except U+0009, U+000A, U+000D |
| Space Separators (Zs) | All Unicode Zs characters except U+0020 |

---

## Themes

Visual profiles change the color scheme of the side panel. Select a theme in the **Visual Profile** setting.

- **Default** — dark panel with teal/green accent colors
- **Hitchhiker's Guide** — retro terminal aesthetic (amber-on-black)

The **Hitchhiker's Guide** theme also adds a dismissible notice at the top of the page when triggered (manually or via auto-Hitchhiker). The notice includes a link to the detail panel.

---

## Building Distribution Packages

The `build.ps1` script packages the extension files into store-ready archives.

```powershell
# Run from the aid-extension directory

# Build all targets (Chrome, Firefox, Edge)
.\build.ps1

# Build a specific target
.\build.ps1 -Target chrome
.\build.ps1 -Target firefox
.\build.ps1 -Target edge
```

Output files are written to the `dist/` directory:

| File | Target |
|---|---|
| `dist/ass-chrome.zip` | Chrome Web Store |
| `dist/ass-firefox.xpi` | Firefox Add-ons |
| `dist/ass-edge.zip` | Microsoft Edge Add-ons |

The Firefox build merges `manifest.firefox.json` overrides into the base manifest automatically.

---

## Privacy

All processing occurs locally in the browser. No data is sent to external servers. No telemetry, analytics, or usage data is collected or transmitted.

---

## Test Tool

To create pages with hidden characters for testing: https://embracethered.com/blog/ascii-smuggler.html

---

## License

MIT — see [LICENSE](../LICENSE)

## Repository

https://github.com/KillAllTheHippies/aid
