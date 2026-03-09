/**
 * ASS – ASCII Smuggling Surfacer
 * Content Script — Detection engine, highlighting, tooltips, inline expansion.
 * Injected on-demand via background.js or registered auto-scan.
 */

(() => {
    if (window.__assInjected) return;
    window.__assInjected = true;

    // ─── Constants ──────────────────────────────────────────────────────────

    const TOOLTIP_DELAY_MS = 500;
    const TOOLTIP_HIDE_DELAY_MS = 200;
    const TOOLTIP_CURSOR_GAP = 15;

    // ─── State ──────────────────────────────────────────────────────────────

    let allResults = [];    // { textNode, findings[] }[]
    let pageSuspicion = null;  // Page-level suspicion object
    let highlightSpans = [];    // Live references to injected <span.ass-hl>
    let tooltipEl = null;  // Shared tooltip element
    let settings = {};    // User settings from background
    let mutationObserver = null;
    let isHighlighting = false; // Guard: suppress observer during DOM edits
    let isScanning = false; // Guard: prevent concurrent scans

    // ─── Scan Entry Point ──────────────────────────────────────────────────

    function scanPage(opts) {
        if (isScanning) return;
        isScanning = true;
        settings = opts || {};

        pauseObserver();
        removeHighlights();
        allResults = [];

        const textNodes = collectTextNodes();

        for (const tn of textNodes) {
            const findings = scanTextNode(tn);
            if (findings.length) allResults.push({ textNode: tn, findings });
        }

        pageSuspicion = calculateSuspicion(allResults);

        applyHighlights();
        ensureTooltip();

        // The auto-calming threshold controls the Hitchhiker page takeover.
        // The visual profile dropdown ONLY affects the popup/panel (via shared-ui.js).
        // applyPageTheme() injects CSS into the host webpage ONLY for the auto-calming
        // Hitchhiker effect — never for regular visual profile changes.
        const ahThreshold = settings.autoHitchhikerThreshold ?? 800;
        const isHitchhikerActive = settings.autoHitchhiker && pageSuspicion.totalCodePoints >= ahThreshold;
        applyPageTheme(isHitchhikerActive ? 'hitchhiker' : null);
        window.__assActiveTheme = isHitchhikerActive ? 'hitchhiker' : (settings.visualProfile || 'default');

        // Add calming yet stressful message for hitchhiker theme
        if (isHitchhikerActive && pageSuspicion && pageSuspicion.totalCodePoints > 0) {
            let notice = document.getElementById('ass-hitchhiker-notice');
            if (!notice) {
                notice = document.createElement('div');
                notice.id = 'ass-hitchhiker-notice';
                document.body.prepend(notice);
            }

            // Build the nicely calming yet fully stressful breakdown
            const counts = getCategoryBreakdown(allResults);
            let typesStr = Object.entries(counts)
                .map(([type, count]) => `${count} ${type}`)
                .join(', ')
                .replace(/,([^,]*)$/, ' and$1'); // "A, B and C" formatting

            notice.innerHTML = `...but there appear to be ${pageSuspicion.totalCodePoints} invisible characters indicating hidden messages within this Earth media. Specifically, we've detected ${typesStr}. Fortunately, they appear mostly harmless. <a href="#" id="ass-hitchhiker-link">Consult the Guide for more details.</a>`;

            const link = notice.querySelector('#ass-hitchhiker-link');
            if (link) {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    chrome.runtime.sendMessage({ action: 'openPanel' });
                });
            }
        } else {
            const notice = document.getElementById('ass-hitchhiker-notice');
            if (notice) notice.remove();
        }

        chrome.runtime.sendMessage({
            action: 'scanComplete',
            suspicion: pageSuspicion,
            totalDetections: pageSuspicion.totalCodePoints,
        });
        chrome.runtime.sendMessage({
            action: 'scanResults',
            results: buildSerializableResults(),
        });

        resumeObserver();
        isScanning = false;
    }

    // ─── Webpage Theme Injection ───────────────────────────────────────────
    // applyPageTheme() injects a CSS stylesheet into the HOST WEBPAGE's <head>.
    // This is used ONLY for the auto-calming Hitchhiker takeover effect.
    // Regular visual profile changes go through shared-ui.js (popup/panel only).

    function applyPageTheme(themeName) {
        let link = document.getElementById('ass-theme-link');
        if (!themeName) {
            if (link) link.remove();
            return;
        }
        if (!link) {
            link = document.createElement('link');
            link.id = 'ass-theme-link';
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
        const newHref = chrome.runtime.getURL(`themes/${themeName}.css`);
        if (link.href !== newHref) link.href = newHref;
    }

    // ─── Text Node Collection ─────────────────────────────────────────────

    function collectTextNodes() {
        const nodes = [];

        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    const el = node.parentElement;
                    if (!el) return NodeFilter.FILTER_REJECT;
                    // Skip our own injected elements
                    if (el.closest('.ass-tooltip, .ass-marker, .ass-hl, #ass-hitchhiker-notice'))
                        return NodeFilter.FILTER_REJECT;
                    // Skip elements hidden by CSS (responsive clones, etc.)
                    if (el.getClientRects().length === 0)
                        return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                },
            }
        );

        let n;
        while ((n = walker.nextNode())) nodes.push(n);

        // Also walk open shadow roots and same-origin iframes
        walkShadowRoots(document.body, nodes);
        walkIframes(nodes);

        return nodes;
    }

    function walkShadowRoots(root, out) {
        for (const el of root.querySelectorAll('*')) {
            if (!el.shadowRoot) continue;
            const w = document.createTreeWalker(el.shadowRoot, NodeFilter.SHOW_TEXT, null);
            let n;
            while ((n = w.nextNode())) out.push(n);
            walkShadowRoots(el.shadowRoot, out);
        }
    }

    function walkIframes(out) {
        for (const iframe of document.querySelectorAll('iframe')) {
            try {
                const doc = iframe.contentDocument;
                if (!doc?.body) continue;
                const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
                let n;
                while ((n = w.nextNode())) out.push(n);
            } catch (e) { /* ignore cross-origin errors */ }
        }
    }

    // ─── Per-Node Scanner ──────────────────────────────────────────────────

    function scanTextNode(textNode) {
        const text = textNode.textContent;
        if (!text) return [];

        const findings = [];
        const charFilters = settings.charFilters || [];
        const includeSet = new Set(charFilters.filter(f => f.type === 'include').map(f => f.id));
        const excludeSet = new Set(charFilters.filter(f => f.type === 'exclude').map(f => f.id));
        const isAllowListMode = includeSet.size > 0;

        function shouldSkip(name, codeStr) {
            if (isAllowListMode) {
                return !includeSet.has(name) && !includeSet.has(codeStr);
            }
            return excludeSet.has(name) || excludeSet.has(codeStr);
        }

        // Helper to match a character against our dictionaries and rules
        function matchCharacter(char, cp, charIndex, charLen) {
            if (INVISIBLE_CHARS[char]) {
                const name = INVISIBLE_CHARS[char];
                const codeStr = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
                if (!shouldSkip(name, codeStr)) {
                    return { char, name, charIndex, charLen, type: 'invisible', decoded: null, detail: codeStr };
                }
                return null;
            }

            if (char === '\u00A0') {
                const name = 'NO-BREAK SPACE';
                const codeStr = 'U+00A0';
                if ((isAllowListMode || settings.detectNbsp) && !shouldSkip(name, codeStr)) {
                    return { char, name, charIndex, charLen, type: 'space_like', decoded: null, detail: codeStr };
                }
                return null;
            }

            if (CONFUSABLE_SPACE_CHARS[char]) {
                const name = CONFUSABLE_SPACE_CHARS[char];
                const codeStr = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
                if ((isAllowListMode || settings.detectConfusableSpaces) && !shouldSkip(name, codeStr)) {
                    return { char, name, charIndex, charLen, type: 'space_like', decoded: null, detail: codeStr };
                }
                return null;
            }

            if (isVariationSelectorSupplement(cp)) {
                const name = variationSelectorName(cp);
                const codeStr = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
                if (!shouldSkip(name, codeStr)) {
                    const lowByte = cp - VS_SUPPLEMENT_START;
                    const asciiStr = (lowByte >= 32 && lowByte <= 126) ? String.fromCharCode(lowByte) : `0x${lowByte.toString(16).padStart(2, '0')}`;
                    return { char, name, charIndex, charLen, type: 'invisible', decoded: null, detail: `${codeStr} → ASCII: ${asciiStr}` };
                }
                return null;
            }

            if (isUnicodeTag(cp)) {
                const name = 'UNICODE TAG';
                const codeStr = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
                if (!shouldSkip(name, codeStr)) {
                    const tagDecoded = decodeUnicodeTag(cp);
                    return { char, name, charIndex, charLen, type: 'tag', decoded: tagDecoded, detail: `${codeStr} → ASCII: ${tagDecoded}` };
                }
                return null;
            }

            if (isControlChar(char)) {
                const name = controlCharName(char);
                const codeStr = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
                if ((isAllowListMode || settings.detectControlChars) && !shouldSkip(name, codeStr)) {
                    return { char, name, charIndex, charLen, type: 'cc', decoded: null, detail: codeStr };
                }
                return null;
            }

            if (isSpaceSeparator(char)) {
                const name = zsCharName(char);
                const codeStr = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
                if ((isAllowListMode || settings.detectSpaceSeparators) && !shouldSkip(name, codeStr)) {
                    return { char, name, charIndex, charLen, type: 'zs', decoded: null, detail: codeStr };
                }
            }
            return null;
        }

        for (let i = 0; i < text.length; i++) {
            const cp = text.codePointAt(i);
            const char = String.fromCodePoint(cp);
            const charLen = cp > 0xFFFF ? 2 : 1;
            if (charLen === 2) i++; // skip trailing surrogate

            // The charIndex always points to the FIRST code unit of this character
            const charIndex = charLen === 2 ? i - 1 : i;

            const match = matchCharacter(char, cp, charIndex, charLen);
            if (match) {
                findings.push(match);
            }
        }

        return findings;
    }

    // ─── Encoding Scheme Classifier ────────────────────────────────────────
    // Determines the encoding scheme of a finding for group-splitting.
    // Adjacent characters with different encoding schemes are split into
    // separate groups so each can be decoded independently.

    function getEncodingScheme(finding) {
        if (finding.type === 'tag') return 'tag';
        const cp = finding.char.codePointAt(0);
        if (isVariationSelectorSupplement(cp)) return 'vs_supplement';
        return 'other';
    }

    // ─── Grouping ──────────────────────────────────────────────────────────
    // Groups consecutive findings, accounting for surrogate pairs (charLen > 1).
    // Splits at encoding-type boundaries (e.g. tag → vs_supplement).

    function groupConsecutive(findings) {
        if (!findings.length) return [];
        const sorted = [...findings].sort((a, b) => a.charIndex - b.charIndex);
        const groups = [[sorted[0]]];

        for (let i = 1; i < sorted.length; i++) {
            const prev = groups.at(-1).at(-1);
            const isAdjacent = sorted[i].charIndex === prev.charIndex + prev.charLen;
            const sameEncoding = getEncodingScheme(sorted[i]) === getEncodingScheme(prev);
            if (isAdjacent && sameEncoding) {
                groups.at(-1).push(sorted[i]);
            } else {
                groups.push([sorted[i]]);
            }
        }
        return groups;
    }

    // ─── Suspicion Calculation ─────────────────────────────────────────────

    function calculateSuspicion(results) {
        let totalCodePoints = 0;
        const uniqueChars = new Set();
        let maxRun = 0;
        let maxTagRun = 0;

        for (const { findings } of results) {
            for (const group of groupConsecutive(findings)) {
                totalCodePoints += group.length;
                maxRun = Math.max(maxRun, group.length);
                if (group.every(c => c.type === 'tag'))
                    maxTagRun = Math.max(maxTagRun, group.length);
                for (const c of group) uniqueChars.add(c.char);
            }
        }

        let level, reason;
        if (maxRun >= CRITICAL_CONSECUTIVE_RUN_THRESHOLD) { level = 'critical'; reason = `Very long consecutive run (${maxRun})`; }
        else if (maxRun >= HIGH_CONSECUTIVE_RUN_THRESHOLD) { level = 'high'; reason = `Long consecutive run (${maxRun})`; }
        else if (totalCodePoints > SPARSE_HIGH_TOTAL_THRESHOLD) { level = 'high'; reason = `Large invisible volume (${totalCodePoints})`; }
        else if (totalCodePoints < 10) { level = 'info'; reason = 'Sparse and low volume'; }
        else { level = 'medium'; reason = 'Sparse distribution'; }

        return {
            totalCodePoints, uniqueCodePoints: uniqueChars.size,
            maxConsecutiveCodePoints: maxRun, maxConsecutiveUnicodeTags: maxTagRun,
            suspicionLevel: level, reason,
        };
    }

    // ─── Decoding ──────────────────────────────────────────────────────────

    /** Decode Unicode Tag group → ASCII string. */
    function decodeTagGroup(group) {
        return group
            .filter(c => { const p = c.char.codePointAt(0); return p >= 0xE0020 && p <= 0xE007E; })
            .map(c => String.fromCharCode(c.char.codePointAt(0) - 0xE0000))
            .join('');
    }

    /** Decode VS supplement group → ASCII string.  VS-N encodes ASCII char (N-1). */
    function decodeVSGroup(group) {
        return group
            .filter(c => isVariationSelectorSupplement(c.char.codePointAt(0)))
            .map(c => {
                const ascii = c.char.codePointAt(0) - 0xE0100 + 16;
                return (ascii >= 32 && ascii <= 126) ? String.fromCharCode(ascii) : `[VS-${ascii + 1}]`;
            })
            .join('');
    }

    /** Try all known decodings; return decoded string or null. */
    function decodeGroup(group) {
        if (group.every(c => c.type === 'tag')) {
            const d = decodeTagGroup(group);
            if (d) return d;
        }
        if (group.some(c => isVariationSelectorSupplement(c.char.codePointAt(0)))) {
            const d = decodeVSGroup(group);
            if (d) return d;
        }

        return null;
    }

    // ─── Summarization Helpers ─────────────────────────────────────────────


    function summarizeTagRuns(results) {
        const runs = getAllDecodedRuns(results);
        const max = 5;
        return runs.length > max
            ? runs.slice(0, max).map(r => `'${r}'`).join('\n\n') + `\n\n+${runs.length - max} more`
            : runs.map(r => `'${r}'`).join('\n\n');
    }

    function getAllDecodedRuns(results) {
        const CAT_SLUG = {
            'Unicode Tags': 'tag',
            'Variation Selectors': 'vs',
            'Zero-Width & Joiners': 'zw',
            'Directional & Bidi Marks': 'bidi',
            'Invisible Operators': 'op',
            'Deprecated Format Controls': 'dep',
            'Space-Like / Blank Chars': 'sp',
            'Control Characters (Cc)': 'cc',
            'Space Separators (Zs)': 'zs',
        };
        const runs = [], seen = new Set();
        for (const { findings } of results) {
            for (const g of groupConsecutive(findings)) {
                const d = decodeGroup(g);
                if (!d || seen.has(d)) continue;
                seen.add(d);
                const cat = CAT_SLUG[classifyCategory(g[0])] || 'other';
                runs.push({ text: d, cat });
            }
        }
        return runs;
    }

    function getCategoryBreakdown(results) {
        const counts = {};
        for (const { findings } of results)
            for (const f of findings) {
                const cat = classifyCategory(f);
                counts[cat] = (counts[cat] || 0) + 1;
            }
        return counts;
    }

    // ─── Highlighting ──────────────────────────────────────────────────────

    function applyHighlights() {
        isHighlighting = true;
        removeHighlights();

        for (let nodeIdx = 0; nodeIdx < allResults.length; nodeIdx++) {
            const { textNode, findings } = allResults[nodeIdx];
            if (!textNode.parentNode) continue;

            // Skip DOM modification inside managed editors (CodeMirror, Monaco, etc.)
            // Detections are still reported to the side panel.
            const parentEl = textNode.parentElement;
            if (parentEl && (parentEl.isContentEditable || parentEl.closest('[contenteditable="true"], textarea, input, [role="textbox"], .cm-content, .CodeMirror, .monaco-editor')))
                continue;

            // Process groups right-to-left so splitText offsets stay valid
            const groups = groupConsecutive(findings)
                .filter(g => {
                    const minLen = settings.minSeqLength ?? 1;
                    const maxLen = settings.maxSeqLength ?? 0;
                    if (g.length < minLen) return false;
                    if (maxLen > 0 && g.length > maxLen) return false;
                    return true;
                })
                .sort((a, b) => b[0].charIndex - a[0].charIndex);

            for (const group of groups) {
                const startIdx = group[0].charIndex;
                const endIdx = group.at(-1).charIndex + group.at(-1).charLen;
                const decoded = decodeGroup(group);
                let decodedText = decoded;
                if (!decodedText) {
                    if (group.length === 1) {
                        decodedText = group[0].detail || group[0].name;
                    } else {
                        if (settings.expandToNames) {
                            decodedText = group.map(c => c.name).join(', ');
                        } else {
                            decodedText = group.map(c => `U+${c.char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
                        }
                    }
                }

                // Group severity
                let severity;
                if (group.length >= CRITICAL_CONSECUTIVE_RUN_THRESHOLD) severity = 'critical';
                else if (group.length >= HIGH_CONSECUTIVE_RUN_THRESHOLD) severity = 'high';
                else severity = pageSuspicion?.suspicionLevel || 'info';

                try {
                    if (!textNode.parentNode) continue;
                    if (startIdx >= textNode.textContent.length) continue;

                    // Build highlight wrapper
                    const span = document.createElement('span');
                    span.className = 'ass-hl';
                    span.dataset.style = settings.highlightStyle || 'nimbus';
                    span.dataset.severity = severity;
                    span.dataset.decoded = decodedText;
                    span.dataset.nodeId = `ass-${nodeIdx}-${startIdx}`;
                    span.dataset.rawChars = group.map(c => c.char).join('');
                    span.dataset.charCount = String(group.length);
                    span.dataset.charName = group.length === 1
                        ? group[0].name
                        : `${group[0].name} (+${group.length - 1} more)`;
                    span.dataset.codePoint = `U+${group[0].char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
                    span.dataset.detail = group.length === 1
                        ? (group[0].detail || '')
                        : '';
                    span.dataset.category = classifyCategory(group[0]);
                    span.dataset.cat = {
                        'Unicode Tags': 'tag',
                        'Variation Selectors': 'vs',
                        'Zero-Width & Joiners': 'zw',
                        'Directional & Bidi Marks': 'bidi',
                        'Invisible Operators': 'op',
                        'Deprecated Format Controls': 'dep',
                        'Space-Like / Blank Chars': 'sp',
                        'Control Characters (Cc)': 'cc',
                        'Space Separators (Zs)': 'zs',
                    }[span.dataset.category] || 'other';
                    span.dataset.tooltipData = JSON.stringify({
                        severity,
                        charName: group.length === 1 ? group[0].name : `${group.length} invisible characters`,
                        codePoint: span.dataset.codePoint,
                        detail: span.dataset.detail,
                        count: group.length,
                        category: span.dataset.category,
                        decoded: decodedText,
                        hasDecodedMessage: decoded !== null,
                    });

                    // Split text and wrap — one <span> per consecutive group
                    const afterNode = textNode.splitText(startIdx);
                    afterNode.splitText(endIdx - startIdx);
                    span.appendChild(afterNode.cloneNode(true));
                    afterNode.parentNode.replaceChild(span, afterNode);

                    // Visible marker (hover target + click-to-expand)
                    const marker = document.createElement('span');
                    marker.className = 'ass-marker';
                    marker.setAttribute('aria-hidden', 'true');
                    const label = group.length > 1 ? `(${group.length})` : '(·)';
                    marker.textContent = label;
                    marker.dataset.collapsed = label;
                    marker.dataset.expanded = `(${decodedText})`;
                    marker.dataset.isExpanded = 'false';
                    span.appendChild(marker);

                    highlightSpans.push(span);
                } catch (e) {
                    /* ignore highlight errors */
                }
            }
        }

        isHighlighting = false;
    }

    function removeHighlights() {
        isHighlighting = true;
        for (const span of highlightSpans) {
            if (!span.parentNode) continue;
            // Delete our marker elements first
            span.querySelectorAll('.ass-marker').forEach(m => m.remove());
            // Unwrap original text back into the parent
            const parent = span.parentNode;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
            parent.normalize();
        }
        highlightSpans = [];
        isHighlighting = false;
    }

    // ─── Tooltip System ────────────────────────────────────────────────────

    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }, true);

    function ensureTooltip() {
        if (tooltipEl) return;

        tooltipEl = document.createElement('div');
        tooltipEl.className = 'ass-tooltip';
        tooltipEl.style.display = 'none';
        tooltipEl.style.pointerEvents = 'auto'; // Allow interaction
        const activeTheme = window.__assActiveTheme || settings.visualProfile || 'default';
        tooltipEl.dataset.theme = (activeTheme === 'default' || !activeTheme) ? 'military-scanner' : activeTheme;
        document.body.appendChild(tooltipEl);

        let showTimer, hideTimer;
        let isAltHeld = false;

        document.addEventListener('keydown', e => {
            if (e.key === 'Alt') {
                isAltHeld = true;
                clearTimeout(hideTimer);
            }
        }, true);

        document.addEventListener('keyup', e => {
            if (e.key === 'Alt') {
                isAltHeld = false;
                if (tooltipEl.style.display !== 'none' && !tooltipEl.matches(':hover') && !document.querySelector('.ass-hl:hover')) {
                    hideTimer = setTimeout(hideTooltip, TOOLTIP_HIDE_DELAY_MS);
                }
            }
        }, true);

        // Hover → show tooltip
        document.addEventListener('mouseover', e => {
            const hl = e.target.closest?.('.ass-hl');
            const tooltip = e.target.closest?.('.ass-tooltip');

            if (tooltip) {
                clearTimeout(hideTimer);
                return;
            }

            if (!hl) return;
            // Delay appearance
            clearTimeout(showTimer);
            showTimer = setTimeout(() => {
                clearTimeout(hideTimer); // Prevent any trailing hide commands if we are committing to show
                showTooltip(hl);
            }, TOOLTIP_DELAY_MS);
        }, true);

        document.addEventListener('mouseout', e => {
            const hl = e.target.closest?.('.ass-hl');
            const tooltip = e.target.closest?.('.ass-tooltip');

            if (tooltip) {
                if (!isAltHeld) {
                    clearTimeout(hideTimer);
                    hideTimer = setTimeout(hideTooltip, TOOLTIP_HIDE_DELAY_MS);
                }
                return;
            }

            if (!hl) return;
            clearTimeout(showTimer);

            // Wait before hiding, giving the user time to move the mouse into the tooltip
            if (!isAltHeld) {
                clearTimeout(hideTimer);
                hideTimer = setTimeout(hideTooltip, TOOLTIP_HIDE_DELAY_MS);
            }
        }, true);

        document.addEventListener('mousedown', e => {
            // Close tooltip if clicking outside
            if (tooltipEl.style.display !== 'none' && !e.target.closest('.ass-tooltip') && !e.target.closest('.ass-hl')) {
                hideTooltip();
            }
        }, true);

        // Click → toggle inline expansion (swap marker text)
        document.addEventListener('click', e => {
            const hl = e.target.closest?.('.ass-hl');
            if (!hl) return;
            e.preventDefault();
            e.stopPropagation();

            const marker = hl.querySelector('.ass-marker');
            if (!marker) return;

            // Frictionless Copy
            if (e.ctrlKey || e.metaKey) {
                const rawText = hl.dataset.decoded || '';
                // Sanitize output to prevent escaping quote structures when pasted
                const sanitizedText = JSON.stringify(rawText).slice(1, -1).replace(/'/g, "\\'");
                navigator.clipboard.writeText(sanitizedText).catch(err => console.warn('Copy failed:', err));

                marker.textContent = '(Copied!)';
                const originalColor = marker.style.color;
                marker.style.color = '#00ff88';
                setTimeout(() => {
                    if (marker.textContent === '(Copied!)') {
                        marker.textContent = marker.dataset.isExpanded === 'true' ? marker.dataset.expanded : marker.dataset.collapsed;
                    }
                    marker.style.color = originalColor;
                }, 1000);
                return;
            }

            const expanded = marker.dataset.isExpanded === 'true';
            marker.textContent = expanded ? marker.dataset.collapsed : marker.dataset.expanded;
            marker.dataset.isExpanded = String(!expanded);
            hl.classList.toggle('expanded', !expanded);
        }, true);
    }

    function showTooltip(hlEl) {
        if (!tooltipEl) return;
        if (settings.disableTooltips) return;

        // Keep tooltip theme in sync with the active visual profile
        const currentTheme = window.__assActiveTheme || settings.visualProfile || 'default';
        tooltipEl.dataset.theme = (currentTheme === 'default' || !currentTheme) ? 'military-scanner' : currentTheme;
        let data;
        try { data = JSON.parse(hlEl.dataset.tooltipData); } catch (e) { return; }

        const emoji = { info: '🔵', medium: '🟡', high: '🟠', critical: '🔴' };

        let html = `
            <div class="ass-tooltip-header">${emoji[data.severity] || '⚪'} ${data.severity.toUpperCase()}</div>
            <div class="ass-tooltip-divider"></div>
            <div class="ass-tooltip-row"><b>Character:</b> ${esc(data.charName)}</div>
            <div class="ass-tooltip-row"><b>Code Point:</b> ${data.codePoint}</div>${data.detail && data.detail !== data.codePoint ? `
            <div class="ass-tooltip-row" style="color:#aaa;font-size:11px;">${esc(data.detail)}</div>` : ''}
            <div class="ass-tooltip-row"><b>Run Length:</b> ${data.count} ${data.count > 1 ? 'consecutive' : 'single'}</div>
            <div class="ass-tooltip-row"><b>Category:</b> ${esc(data.category)}</div>`;

        if (data.hasDecodedMessage && data.decoded)
            html += `
            <div class="ass-tooltip-divider"></div>
            <div class="ass-tooltip-row ass-tooltip-decoded"><b>Hidden message:</b> <code>${esc(data.decoded)}</code></div>`;

        html += `
            <div class="ass-tooltip-divider"></div>
            <div class="ass-tooltip-hint">Click inline &bull; Ctrl+Click copy &bull; Hold Alt for cursor selection</div>`;

        tooltipEl.innerHTML = html;
        tooltipEl.style.display = 'block';

        // Position near cursor instead of element bounds
        const tr = tooltipEl.getBoundingClientRect();
        let top = mouseY + TOOLTIP_CURSOR_GAP + scrollY;
        let left = mouseX + TOOLTIP_CURSOR_GAP + scrollX;

        // Prevent going off bottom
        if (top - scrollY + tr.height > innerHeight) {
            top = Math.max(scrollY + 4, mouseY - tr.height - TOOLTIP_CURSOR_GAP + scrollY);
        }

        // Prevent going off right
        if (left - scrollX + tr.width > innerWidth) {
            left = Math.max(scrollX + 4, mouseX - tr.width - TOOLTIP_CURSOR_GAP + scrollX);
        }

        tooltipEl.style.top = `${top}px`;
        tooltipEl.style.left = `${left}px`;
    }

    function hideTooltip() {
        if (tooltipEl) tooltipEl.style.display = 'none';
    }

    // ─── Mutation Observer ─────────────────────────────────────────────────

    let mutationTimer = null;

    function pauseObserver() {
        mutationObserver?.disconnect();
    }

    function resumeObserver() {
        if (!mutationObserver) {
            mutationObserver = new MutationObserver(mutations => {
                if (isHighlighting) return;
                // Ignore mutations from our own elements
                if (mutations.every(m => {
                    const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
                    return el?.closest('.ass-hl, .ass-tooltip, .ass-marker');
                })) return;
                clearTimeout(mutationTimer);
                mutationTimer = setTimeout(() => scanPage(settings), 500);
            });
        }
        mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    // ─── Serializable Results (for panel) ──────────────────────────────────
    // Built from live DOM highlight spans to guarantee 1:1 with jump targets.

    function getHighlightDetections() {
        const detections = [];
        for (const span of highlightSpans) {
            if (!span.parentNode) continue;
            const d = span.dataset;
            let context = '';
            try {
                const before = (span.previousSibling?.textContent || '').slice(-20);
                const after = (span.nextSibling?.textContent || '').slice(0, 20);
                context = `…${before}⦗███⦘${after}…`.replace(/[\n\r\t]/g, ' ');
            } catch (e) { /* ignore context errors */ }

            detections.push({
                nodeId: d.nodeId,
                groupSize: parseInt(d.charCount, 10) || 1,
                severity: d.severity || 'info',
                type: d.category || '',
                charName: d.charName || 'Unknown',
                codePoints: [d.codePoint || ''],
                detail: d.detail || '',
                decoded: d.decoded || null,
                context,
                category: d.category || '',
                rawChars: d.rawChars || '',
            });
        }
        return detections;
    }

    function getEditableDetections(highlightedNodeIds) {
        const detections = [];
        for (let nodeIdx = 0; nodeIdx < allResults.length; nodeIdx++) {
            const { textNode, findings } = allResults[nodeIdx];
            if (!textNode.parentElement) continue;
            const p = textNode.parentElement;
            if (!(p.isContentEditable || p.closest('[contenteditable="true"], textarea, input, [role="textbox"], .cm-content, .CodeMirror, .monaco-editor')))
                continue;

            const groups = groupConsecutive(findings).filter(g => {
                const minLen = settings.minSeqLength ?? 1;
                const maxLen = settings.maxSeqLength ?? 0;
                if (g.length < minLen) return false;
                if (maxLen > 0 && g.length > maxLen) return false;
                return true;
            });
            for (const group of groups) {
                const startIdx = group[0].charIndex;
                const nodeId = `ass - ${nodeIdx} -${startIdx} `;
                if (highlightedNodeIds.has(nodeId)) continue;

                const decoded = decodeGroup(group);
                let decodedText = decoded;
                if (!decodedText) {
                    if (group.length === 1) {
                        decodedText = group[0].detail || group[0].name;
                    } else {
                        if (settings.expandToNames) {
                            decodedText = group.map(c => c.name).join(', ');
                        } else {
                            decodedText = group.map(c => `U+${c.char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
                        }
                    }
                }
                let severity;
                if (group.length >= CRITICAL_CONSECUTIVE_RUN_THRESHOLD) severity = 'critical';
                else if (group.length >= HIGH_CONSECUTIVE_RUN_THRESHOLD) severity = 'high';
                else severity = pageSuspicion?.suspicionLevel || 'info';

                let context = '';
                try {
                    const txt = textNode.textContent;
                    const before = txt.slice(Math.max(0, startIdx - 20), startIdx);
                    const after = txt.slice(startIdx + group.length, startIdx + group.length + 20);
                    context = `…${before}⦗███⦘${after}…`.replace(/[\n\r\t]/g, ' ');
                } catch (e) { /* ignore context errors */ }

                detections.push({
                    nodeId,
                    groupSize: group.length,
                    severity,
                    type: classifyCategory(group[0]),
                    charName: group.length === 1 ? group[0].name : `${group[0].name} (+${group.length - 1} more)`,
                    codePoints: [`U + ${group[0].char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} `],
                    detail: group.length === 1
                        ? (group[0].detail || '')
                        : '',
                    decoded: decodedText,
                    context,
                    category: classifyCategory(group[0]),
                    rawChars: group.map(c => c.char).join(''),
                });
            }
        }
        return detections;
    }

    function buildSerializableResults() {
        let detections = getHighlightDetections();
        const highlightedNodeIds = new Set(detections.map(d => d.nodeId));
        const editableDetections = getEditableDetections(highlightedNodeIds);
        detections = detections.concat(editableDetections);

        // Sort detections into exact document order to avoid reversed grouping
        detections.sort((a, b) => {
            const partsA = a.nodeId.split('-');
            const partsB = b.nodeId.split('-');
            const nodeDiff = parseInt(partsA[1], 10) - parseInt(partsB[1], 10);
            if (nodeDiff !== 0) return nodeDiff;
            return parseInt(partsA[2], 10) - parseInt(partsB[2], 10);
        });

        return {
            url: location.href,
            timestamp: new Date().toISOString(),
            suspicion: pageSuspicion,
            categoryBreakdown: getCategoryBreakdown(allResults),
            tagRunSummary: summarizeTagRuns(allResults),
            allDecodedRuns: getAllDecodedRuns(allResults),
            detections,
            settings,
            activeTheme: window.__assActiveTheme || settings.visualProfile || 'default',
        };
    }

    // ─── Message Listener ─────────────────────────────────────────────────

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        switch (message.action) {
            case 'scan':
                requestIdleCallback(() => scanPage(message.settings));
                break;

            case 'scrollToDetection': {
                const nodeIds = message.nodeIds || [message.nodeId];
                nodeIds.forEach((id, index) => {
                    const el = document.querySelector(`[data-node-id="${id}"]`);
                    if (el) {
                        if (index === 0) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.classList.add('pulse');
                        el.addEventListener('animationend', () => el.classList.remove('pulse'), { once: true });
                    }
                });
                break;
            }

            case 'expandAll': {
                const expand = message.expand;
                for (const hl of highlightSpans) {
                    const marker = hl.querySelector('.ass-marker');
                    if (marker) {
                        marker.textContent = expand ? marker.dataset.expanded : marker.dataset.collapsed;
                        marker.dataset.isExpanded = String(expand);
                        hl.classList.toggle('expanded', expand);
                    }
                }
                break;
            }
        }
    });

    // ─── Helpers ───────────────────────────────────────────────────────────

    function esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ─── Auto-scan ────────────────────────────────────────────────────────

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        chrome.storage.local.get('settings').then(data => {
            if (data.settings?.autoScan) requestIdleCallback(() => scanPage(data.settings));
        });
    }
})();
