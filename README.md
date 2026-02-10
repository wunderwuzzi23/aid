# AID - ASCII/Invisible Character Detection Tool

A powerful tool for detecting invisible Unicode characters in files, designed to identify potential ASCII smuggling attempts, hidden data encoding, and suspicious Unicode usage patterns.

## Features

- 🔍 **Comprehensive Detection**: Scans for Unicode tags, zero-width characters, directional marks, and variation selectors
- 🎯 **Smart Analysis**: Automatically groups consecutive characters and assesses suspicion levels
- 📊 **Multiple Output Formats**: CSV (default), JSON, and human-readable text reports
- ⚡ **Streaming Output**: Low-memory scanning with real-time CSV writing for large directories
- 🔢 **Unicode Tag Decoding**: Automatically decodes Unicode tag sequences to ASCII
- 📈 **Detailed Statistics**: Per-file assessments with category breakdowns and suspicion ratings
- 🚀 **Fast Scanning**: Skips binary files and excluded directories (configurable)

## Installation

```bash
# Clone the repository
git clone https://github.com/wunderwuzzi23/aid.git
cd aid

# Make the script executable
chmod +x aid

# Run it
./aid --target /path/to/scan --output report.csv
```

**Requirements:** Python 3.6+

## Usage

### Basic Usage

```bash
# Scan a directory and output CSV report
./aid --target ./my-project --output report.csv

# Scan with progress indicator
./aid --target ./my-project --output report.csv --verbose

# Output in different formats
./aid --target ./my-project --output report.json --format json
./aid --target ./my-project --output report.txt --format text

# Stream to stdout for piping
./aid --target ./my-project --stream | grep "critical"
```

### Command Line Options

```
--target PATH          Target directory to scan (required)
--output PATH          Output report file path (required unless --stream)
--format FORMAT        Output format: csv (default), json, or text
--verbose              Show progress while scanning
--stream               Print report to stdout instead of file
```

## Understanding the Output

### Suspicion Levels

AID automatically assesses the severity of findings:

- 🔵 **INFO** (<10 code points): Few invisible characters, likely accidental
- 🟢 **LOW** (10-49 code points): Some invisible characters, worth reviewing
- 🟠 **HIGH** (50-99 code points): Many invisible characters, suspicious pattern
- 🔴 **CRITICAL** (≥100 code points): Excessive characters, likely malicious/smuggling

### CSV Output Format

```csv
file_path,file_size_bytes,suspicion_level,total_code_points,unique_code_points,assessment,line_number,position,consecutive,group_size,chars,context
```

**Key Columns:**
- `consecutive`: "yes" if multiple invisible chars are grouped together
- `group_size`: Number of characters in the group
- `chars`: Character descriptions with hex codes (e.g., `UNICODE TAGS (0xE0041-0xE0046) = ABCDEF`)
- `context`: Surrounding text with invisible chars marked as `⦗...⦘`

### Example Output

```bash
$ ./aid --target ./skills --output report.csv

✓ Report written to report.csv
  Files scanned: 42
  ⚠ Files with findings: 3
    🔵 Info: 2
    🔴 Critical: 1
  ⚠ Total invisible code points: 156
  📊 By category:
    Unicode Tags: 142
    Zero-Width Chars: 12
    Directional Marks: 2
```

## Detected Character Types

### Unicode Tags (U+E0000 to U+E007F)
Used for language tagging, but often abused for data smuggling. AID decodes these to their ASCII equivalents.

### Zero-Width Characters
- Zero Width Space (U+200B)
- Zero Width Non-Joiner (U+200C)
- Zero Width Joiner (U+200D)
- Zero Width No-Break Space (U+FEFF)

### Directional Marks
- Left-to-Right/Right-to-Left marks and overrides
- Bidirectional formatting characters
- Can be used for text spoofing attacks

### Variation Selectors
- Variation Selectors 1-16 (U+FE00 to U+FE0F)
- Control emoji and character rendering

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

## Real-Time Monitoring

CSV format uses streaming output, so you can monitor scans in real-time:

```bash
# In one terminal
./aid --target /large/directory --output scan.csv --verbose

# In another terminal
tail -f scan.csv
```

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

### Check for Unicode Tags
```bash
./aid --target ./project --stream | grep "UNICODE TAGS"
```

### JSON Output for Programmatic Use
```bash
./aid --target ./project --output report.json --format json
cat report.json | jq '.file_assessments[] | select(.suspicion_level == "critical")'
```

## How It Works

1. **Recursively scans** all files in the target directory
2. **Skips binary files** automatically using MIME type and null-byte detection
3. **Groups consecutive** invisible characters for better analysis
4. **Decodes Unicode tags** to reveal hidden ASCII messages
5. **Streams results** to CSV in real-time (low memory usage)
6. **Calculates suspicion levels** based on quantity and variety of invisible characters

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

Created by [@wunderwuzzi23](https://github.com/wunderwuzzi23) for detecting invisible Unicode characters and potential ASCII smuggling attacks.

## Acknowledgments

Inspired by the need to detect sophisticated Unicode-based attacks and data hiding techniques.
