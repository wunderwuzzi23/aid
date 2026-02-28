# AID 

This tool was created with OpenAI Codex and Claude Code.

A tool for detecting invisible Unicode characters in files, designed to identify potential ASCII smuggling attempts, hidden data encoding, and suspicious Unicode usage patterns.

## Features

- 🔍 **Comprehensive Detection**: Scans for Unicode tags, zero-width characters, directional marks, and variation selectors
- 🎯 **Smart Analysis**: Automatically groups consecutive characters and assesses suspicion levels
- 📊 **Multiple Output Formats**: CSV (default), JSON, and human-readable text reports
- 🔢 **Unicode Tag Decoding**: Automatically decodes Unicode tag sequences to ASCII
- 📈 **Compact Structured Reports**: One line/object per file with counts, char types, longest runs, and notes
- 🚀 **Fast Scanning**: Skips binary files and excluded directories (configurable)

## Installation

```bash
# Clone the repository
git clone https://github.com/wunderwuzzi23/aid.git
cd aid

# Make the script executable
chmod +x aid

# Run it
./aid --target /path/to/scan
```

**Requirements:** Python 3.6+

## Usage

### Basic Usage

```bash
# Scan a directory (writes ./aid-report.csv by default)
./aid --target ./my-project

# Scan with progress indicator
./aid --target ./my-project --verbose

# Output in different formats
./aid --target ./my-project --output report.json --format json
./aid --target ./my-project --output report.txt --format text

# Save CSV and filter critical entries
./aid --target ./my-project --output report.csv
grep ",critical," report.csv
```

### Command Line Options

```
--target PATH          Target directory to scan (required)
--output PATH          Output report file path (default: ./aid-report.<format>)
--format FORMAT        Output format: csv (default), json, or text
--verbose              Show progress while scanning
--include-cc           Also scan for classic control chars (Cc), excluding TAB/LF/CR
--include-confusable-spaces  Also scan for confusable/suspicious spaces and fillers (e.g. U+00A0 NBSP)
--include-zs           Also scan for Unicode space separators (Zs), excluding ASCII space U+0020
```

## Understanding the Output

### Suspicion Levels

AID automatically assesses the severity of findings:

- 🔵 **INFO**: `longest_consecutive_run < 10` and `total_invisible_code_points < 10`
- 🟡 **MEDIUM**: `longest_consecutive_run < 10` and `10 <= total_invisible_code_points <= 100`
- 🟠 **HIGH**: `10 <= longest_consecutive_run < 40`, or `longest_consecutive_run < 10` with `total_invisible_code_points > 100`
- 🔴 **CRITICAL**: `longest_consecutive_run >= 40`

Classification is evaluated in this order:
1. If `longest_consecutive_run >= 40`, severity is `critical`.
2. Else if `longest_consecutive_run >= 10`, severity is `high`.
3. Else if `total_invisible_code_points > 100`, severity is `high`.
4. Else if `total_invisible_code_points < 10`, severity is `info`.
5. Else severity is `medium`.

This means `critical` is still run-only, and sparse distributions can now rise to `high` when total invisible volume is very large (`>100`).

### CSV Output Format (Compact)

```csv
file_path,file_size_bytes,suspicion_level,total_invisible_code_points,unique_invisible_code_points,invisible_chars,longest_consecutive_run,longest_unicode_tag_run,notes
```

**Key Columns:**
- `invisible_chars`: Character names with counts per file
- `longest_consecutive_run`: Largest consecutive run of invisible code points in the file
- `longest_unicode_tag_run`: Largest consecutive run containing only Unicode Tag code points
- `notes`: Decoded Unicode Tag payload text(s), e.g. `'hidden text'` (empty when no Unicode Tag runs are found)

### Example Output

```bash
$ ./aid --target ./skills

  Files scanned: 42
  ⚠ Files with findings: 3
    🔵 Info: 2
    🔴 Critical: 1
  ⚠ Total invisible code points: 156
  📊 By category:
    Unicode Tags: 142
    Zero-Width Chars: 12
    Directional Marks: 2
✓ Report written to aid-report.csv
```

### Optional Expanded Scanning

```bash
# Include classic control chars (Cc), except TAB/LF/CR
./aid --target ./project --include-cc

# Include confusable/suspicious spaces and fillers (e.g., NBSP, thin space, hangul filler)
./aid --target ./project --include-confusable-spaces

# Include Unicode space separators (Zs), except ASCII space U+0020
./aid --target ./project --include-zs

# Enable both
./aid --target ./project --include-cc --include-zs --include-confusable-spaces
```

## Detected Character Types

Default mode now uses a **strict** detection set focused on high-signal smuggling characters.

### Unicode Tags
- `U+E0000..U+E007F` (TAG block)
- Decoded to ASCII equivalents in report notes where possible

### Zero-Width And Joiners
- `U+034F` COMBINING GRAPHEME JOINER
- `U+180E` MONGOLIAN VOWEL SEPARATOR
- `U+200B` ZERO WIDTH SPACE
- `U+200C` ZERO WIDTH NON-JOINER
- `U+200D` ZERO WIDTH JOINER
- `U+2060` WORD JOINER
- `U+FEFF` ZERO WIDTH NO-BREAK SPACE

### Directional And Bidi Marks
- `U+061C`, `U+200E`, `U+200F`
- `U+202A..U+202E`
- `U+2066..U+2069`

### Variation Selectors
- `U+FE00..U+FE0F` (VS1..VS16)
- `U+E0100..U+E01EF` (VS17..VS256)

### Invisible Operators
- `U+2061..U+2064` (function application/invisible math operators)

### Deprecated Format Controls
- `U+206A..U+206F`

### Optional: Confusable/Suspicious Spaces And Fillers (`--include-confusable-spaces`)
- `U+00A0` NO-BREAK SPACE
- `U+00AD` SOFT HYPHEN
- `U+2000..U+200A` (quad/space variants)
- `U+202F` NARROW NO-BREAK SPACE
- `U+205F` MEDIUM MATHEMATICAL SPACE
- `U+2800` BRAILLE PATTERN BLANK
- `U+3000` IDEOGRAPHIC SPACE
- `U+3164` HANGUL FILLER
- `U+FFA0` HALFWIDTH HANGUL FILLER

### Optional: Space Separators Category (`--include-zs`)
- Scans Unicode category `Zs` (space separators), excluding ASCII `U+0020 SPACE`
- Broader and potentially noisier than the curated confusable-space list

### Not Included
- AID does not currently flag every possible Unicode `Cf/Cc/Zs` code point.
- It focuses on high-risk and frequently abused invisible/smuggling characters.
- `Cc` is only scanned when `--include-cc` is provided.
- Confusable/suspicious spaces and fillers are only scanned when `--include-confusable-spaces` is provided.
- `Zs` is only scanned when `--include-zs` is provided.
- To avoid overwhelming noise:
  - `--include-cc` excludes `TAB (U+0009)`, `LF (U+000A)`, and `CR (U+000D)`
  - `--include-zs` excludes ASCII space `U+0020`

## Configuration

### Excluded Directories

Edit the `EXCLUDED_DIRS` array at the top of the script to skip certain directories:

```python
EXCLUDED_DIRS = [
    '.git',
    'node_modules',  # Uncomment to exclude
    '.venv',         # Add your own
]
```

By default, only `.git` is excluded. Hidden directories like `.curated` are scanned.

## Use Cases

- **Security Auditing**: Detect ASCII smuggling attempts in code repositories
- **Data Forensics**: Find hidden data encoded in invisible characters
- **Code Review**: Identify suspicious Unicode usage in pull requests
- **Compliance**: Scan for non-printable characters in text files
- **Malware Analysis**: Detect steganography and obfuscation techniques

## Examples

### Find All Critical Files
```bash
./aid --target ./project --output report.csv
grep ",critical," report.csv
```

### JSON Output for Programmatic Use
```bash
./aid --target ./project --output report.json --format json
cat report.json | jq '.files[] | select(.suspicion_level == "critical")'
```

## How It Works

1. **Recursively scans** all files in the target directory
2. **Skips binary files** automatically using MIME type and null-byte detection
3. **Groups consecutive** invisible characters for better analysis
4. **Decodes Unicode tags** to reveal hidden ASCII messages
5. **Generates report files** in CSV, JSON, or text format
6. **Calculates suspicion levels** based on quantity and variety of invisible characters

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Tool for tests
[https://embracethered.com/blog/ascii-smuggler.com](https://embracethered.com/blog/ascii-smuggler.html) [#TrustNoAI](https://embracethered.com/blog/ascii-smuggler.html)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

Inspired by the need to detect sophisticated Unicode-based attacks and data hiding techniques.
