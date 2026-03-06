/**
 * ASS – ASCII Smuggling Surfacer
 * Detail Panel Script — Side Panel (Chrome/Edge) / Sidebar (Firefox)
 */

document.addEventListener('DOMContentLoaded', async () => {
    const emptyState = document.getElementById('empty-state');
    const resultsContainer = document.getElementById('results-container');
    const pageUrl = document.getElementById('page-url');
    const summaryGrid = document.getElementById('summary-grid');
    const categorySection = document.getElementById('category-section');
    const categoryGrid = document.getElementById('category-grid');
    const detectionsList = document.getElementById('detections-list');
    const tagRunsSection = document.getElementById('tag-runs-section');
    const tagRuns = document.getElementById('tag-runs');
    const exportJsonBtn = document.getElementById('export-json');
    const exportCsvBtn = document.getElementById('export-csv');

    let currentResults = null;


    const exportBtn = document.getElementById('header-export-btn');
    const exportMenu = document.getElementById('header-export-menu');

    exportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        exportMenu.classList.toggle('hidden');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!exportMenu.classList.contains('hidden') && !exportMenu.contains(e.target) && e.target !== exportBtn) {
            exportMenu.classList.add('hidden');
        }
    });

    exportMenu.addEventListener('click', (e) => {
        if (e.target.classList.contains('export-menu-item')) {
            const format = e.target.dataset.format;
            if (format === 'csv') {
                document.getElementById('export-csv').click();
            } else if (format === 'json') {
                document.getElementById('export-json').click();
            }
            exportMenu.classList.add('hidden');
        }
    });


    document.getElementById('close-btn').addEventListener('click', () => window.close());


    const expandAllBtn = document.getElementById('expand-all-btn');
    let allExpanded = false;

    expandAllBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        allExpanded = !allExpanded;
        expandAllBtn.textContent = allExpanded ? 'Collapse All' : 'Expand All';

        chrome.tabs.sendMessage(tab.id, { action: 'expandAll', expand: allExpanded });
    });

    // ─── Data Loading ────────────────────────────────────────────────

    async function loadResults() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        const { results } = await chrome.runtime.sendMessage({ action: 'getResults', tabId: tab.id });
        if (results) {
            currentResults = results;
            renderResults(results);
        }
    }

    // Message handler for results, pinging, and closing
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'scanResults') {
            // Reset user override on fresh scan so auto-suggest can run
            sbUserOverride = false;
            setTimeout(() => { loadResults(); }, 100);
        } else if (message.action === 'pingPanel') {
            sendResponse({ open: true });
        } else if (message.action === 'closePanel') {
            window.close();
        }
    });

    // applyTheme is now provided globally by shared-ui.js

    // ─── Rendering ───────────────────────────────────────────────────

    async function renderResults(r) {
        if (!r?.suspicion) {
            emptyState.style.display = 'block';
            resultsContainer.style.display = 'none';
            return;
        }

        allExpanded = false;
        if (expandAllBtn) expandAllBtn.textContent = 'Expand All';

        emptyState.style.display = 'none';
        resultsContainer.style.display = 'block';
        pageUrl.textContent = r.url || '';

        renderSummary(r.suspicion);
        renderCategoryBreakdown(r.categoryBreakdown);

        if (r.settings) {
            await loadFilterSettings();
            applyTheme(r.activeTheme || r.settings.visualProfile || 'default');
        }

        if (typeof filterUI !== 'undefined') {
            const codepoints = extractDetectedCodepoints(r.detections);
            filterUI.setDetectedCodepoints(codepoints);
        }

        const rendered = renderDetections(r.detections) || { sneakyDecodedStrings: [] };
        const sneakyDecodedStrings = rendered.sneakyDecodedStrings || [];
        updateSettingsAlert();

        renderTagRuns(r.tagRunSummary, sneakyDecodedStrings);
    }

    function renderSummary(s) {
        const emoji = { info: '🔵', medium: '🟡', high: '🟠', critical: '🔴' };
        summaryGrid.innerHTML = `
            <div class="summary-item summary-item-full level-${s.suspicionLevel}">
                <div class="summary-item-label">Suspicion Level</div>
                <div class="summary-item-value">${emoji[s.suspicionLevel] || '⚪'} ${s.suspicionLevel.toUpperCase()}</div>
            </div>
            <div class="summary-item summary-item-full">
                <div class="summary-item-label">Reason</div>
                <div class="summary-item-value" style="font-size:12px;color:#aaa;">${esc(s.reason)}</div>
            </div>
            <div class="summary-item">
                <div class="summary-item-label">Total Code Points</div>
                <div class="summary-item-value">${s.totalCodePoints}</div>
            </div>
            <div class="summary-item">
                <div class="summary-item-label">Unique Characters</div>
                <div class="summary-item-value">${s.uniqueCodePoints}</div>
            </div>
            <div class="summary-item">
                <div class="summary-item-label">Longest Run</div>
                <div class="summary-item-value">${s.maxConsecutiveCodePoints}</div>
            </div>
            <div class="summary-item">
                <div class="summary-item-label">Longest Tag Run</div>
                <div class="summary-item-value">${s.maxConsecutiveUnicodeTags}</div>
            </div>`;
    }

    function renderCategoryBreakdown(breakdown) {
        if (!breakdown) {
            categorySection.style.display = 'none';
            return;
        }
        const entries = Object.entries(breakdown).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        if (entries.length) {
            categorySection.style.display = 'block';
            categoryGrid.innerHTML = entries.map(([name, count]) =>
                `<div class="category-row"><span class="cat-name">${esc(name)}</span><span class="cat-count">${count}</span></div>`
            ).join('');
        } else {
            categorySection.style.display = 'none';
        }
    }

    function renderTagRuns(tagSummary, decodedStrings) {
        const combinedSummary = [];
        if (tagSummary) combinedSummary.push(tagSummary);
        if (decodedStrings.length) {
            combinedSummary.push(...decodedStrings.map(s => `'${s}'`));
        }

        if (combinedSummary.length > 0) {
            tagRunsSection.style.display = 'block';
            tagRuns.innerText = combinedSummary.join('\n\n');
        } else {
            tagRunsSection.style.display = 'none';
        }
    }

    function formatBinary(binaryStr) {
        return (binaryStr.match(/.{1,8}/g) || []).join(' ');
    }

    function toHex(binStr) {
        if (!binStr) return '';
        const bytes = binStr.match(/.{1,8}/g) || [];
        return bytes.map(byte => {
            const hex = parseInt(byte.padEnd(8, '0'), 2).toString(16).toUpperCase();
            return hex.padStart(2, '0');
        }).join(' ');
    }

    function decodeBinary(binStr) {
        if (!binStr || binStr.length < 8) return { full: '', printable: false };

        function tryDecode(s) {
            try {
                const bytes = s.match(/.{8}/g) || [];
                const chars = bytes.map(byte => {
                    const code = parseInt(byte, 2);
                    return (code >= 32 && code <= 126) ? String.fromCharCode(code) : '·';
                });
                const result = chars.join('');
                const isPrintable = result.replace(/·/g, '').length > 0;
                return { text: result, printable: isPrintable };
            } catch (e) { console.warn('Decode error:', e); return { text: '', printable: false }; }
        }

        const full = tryDecode(binStr);
        const remainder = binStr.length % 8;
        let trimmed = null;

        if (remainder > 0) {
            trimmed = tryDecode(binStr.slice(0, -remainder));
        }

        return {
            full: full.text,
            isFullPrintable: full.printable,
            trimmed: trimmed?.text,
            isTrimmedPrintable: trimmed?.printable,
            hasTrailing: remainder > 0,
            trailingCount: remainder
        };
    }

    function processSneakyBits(detections, char0, char1) {
        const sneakyMap = {};
        const filteredDetections = [];
        for (const d of detections) {
            const raw = d.rawChars || '';
            let binPartA = ''; let binPartB = ''; let hasNonPayload = false;

            if (char0 && char1 && char0 !== char1) {
                for (const char of raw) {
                    if (char === char0 || char === char1) {
                        const mappedA = char === char0 ? '0' : '1';
                        binPartA += mappedA; binPartB += mappedA === '0' ? '1' : '0';
                    } else { hasNonPayload = true; break; }
                }
            } else { hasNonPayload = true; }

            if (raw.length > 0 && !hasNonPayload) {
                const nodeIdx = d.nodeId.split('-')[1];
                if (!sneakyMap[nodeIdx]) sneakyMap[nodeIdx] = { count: 0, binaryA: '', binaryB: '', nodeIds: [] };
                sneakyMap[nodeIdx].binaryA += binPartA;
                sneakyMap[nodeIdx].binaryB += binPartB;
                sneakyMap[nodeIdx].nodeIds.push(d.nodeId);
                sneakyMap[nodeIdx].count += raw.length;
            } else {
                filteredDetections.push(d);
            }
        }
        return { sneakyMap, filteredDetections };
    }

    function buildSneakyBitsHtml(sneakyMap, decodedStringsArr) {
        let html = '';
        const dName0 = sbChar0Select?.options[sbChar0Select.selectedIndex]?.text.split(' (')[0] || 'Char 0';
        const dName1 = sbChar1Select?.options[sbChar1Select.selectedIndex]?.text.split(' (')[0] || 'Char 1';
        const mappingDesc = `'0' = ${dName0}, '1' = ${dName1}`;

        for (const [nodeIdx, sg] of Object.entries(sneakyMap)) {
            if (sg.count === 0) continue;
            const decA = decodeBinary(sg.binaryA);
            const decB = decodeBinary(sg.binaryB);

            const renderConfig = (label, bin, hex, dec, isA) => {
                const showDecoded = dec.isFullPrintable || dec.isTrimmedPrintable;
                const activeDec = dec.isTrimmedPrintable && !dec.isFullPrintable ? dec.trimmed : dec.full;
                if (showDecoded && decodedStringsArr) decodedStringsArr.push(activeDec);
                const isTrimmedUsed = dec.isTrimmedPrintable && !dec.isFullPrintable;
                return `
                <div class="sb-payload-block" style="${isA ? 'margin-bottom: 12px;' : ''}">
                    <div class="sb-payload-label">${label}</div>
                    ${showDecoded ? `
                    <div class="sb-decoded-box">
                        <div class="sb-decoded-text">${esc(activeDec)}</div>
                        <button class="detection-copy sb-copy-mini" data-copy-text="${esc(activeDec)}" title="Copy Decoded Text">
                            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                    </div>` : ''}
                    ${isTrimmedUsed ? `<div class="sb-hint">Displayed w/ trailing bits removed</div>` : ''}
                    ${dec.hasTrailing && !isTrimmedUsed ? `<div class="sb-hint">Note: ${dec.trailingCount} trailing bits remaining</div>` : ''}
                    <div class="sb-data-row"><span class="sb-data-type">HEX</span><code class="sb-data-value">${esc(hex)}</code></div>
                    <div class="sb-data-row"><span class="sb-data-type">BIN</span><code class="sb-data-value">${esc(formatBinary(bin))}</code></div>
                    <div style="display:flex;gap:4px;margin-top:6px;">
                        <button class="detection-copy sb-btn-action" data-copy-text="${esc(bin)}" title="Copy Binary">Copy Bin</button>
                        <button class="detection-copy sb-btn-action" data-copy-text="${esc(hex)}" title="Copy Hex">Copy Hex</button>
                    </div>
                </div>`;
            };

            html += `<div class="detection-group-header"><span class="severity-dot high"></span> 🕵️ Sneaky Bits Sequence (${sg.count} bits)</div>
            <div class="detection-card sneaky-bits-card">
                <div class="detection-card-header">
                    <div class="detection-card-title"><span class="detection-card-type">Dynamic Payload</span><span class="detection-card-count">${mappingDesc}</span></div>
                </div>
                ${renderConfig("CONFIGURATION A", sg.binaryA, toHex(sg.binaryA), decA, true)}
                ${renderConfig("CONFIGURATION B (Inverted)", sg.binaryB, toHex(sg.binaryB), decB, false)}
                ${sg.nodeIds.length > 0 ? `<button class="detection-jump" data-node-ids="${sg.nodeIds.join(',')}" style="margin-top:10px;width:100%;">Highlight occurrence</button>` : ''}
            </div>`;
        }
        return html;
    }

    function buildStandardHtml(filteredDetections) {
        let html = '';
        const groups = { critical: [], high: [], medium: [], info: [] };
        for (const d of filteredDetections) (groups[d.severity] || groups.info).push(d);

        const labels = { critical: { emoji: '🔴', label: 'Critical' }, high: { emoji: '🟠', label: 'High' }, medium: { emoji: '🟡', label: 'Medium' }, info: { emoji: '🔵', label: 'Info' } };

        for (const [level, items] of Object.entries(groups)) {
            if (!items.length) continue;
            const { emoji, label } = labels[level];
            html += `<div class="detection-group-header"><span class="severity-dot ${level}"></span> ${emoji} ${label} (${items.length})</div>`;

            for (const d of items) {
                const detailLine = d.detail && d.detail !== d.codePoints?.[0] ? `<div class="detection-card-detail">${esc(d.detail)}</div>` : '';
                const codePointLine = d.groupSize === 1 && d.codePoints?.[0] ? `<div class="detection-card-detail" style="opacity:0.6;font-family:monospace;">${esc(d.codePoints[0])}</div>` : '';
                const showDecoded = d.decoded && d.decoded !== d.charName && d.decoded !== d.codePoints?.[0];
                const copyText = d.decoded || d.codePoints?.[0] || d.charName;

                html += `<div class="detection-card">
                    <div class="detection-card-header">
                        <div class="detection-card-title"><span class="detection-card-type">${esc(d.charName)}</span><span class="detection-card-count">${d.groupSize} ${d.groupSize > 1 ? 'consecutive' : 'char'}</span></div>
                        <button class="detection-copy" data-copy-text="${esc(copyText)}" title="Copy decoded text">
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                    </div>${codePointLine}${detailLine}
                    ${showDecoded ? `<div class="detection-card-decoded">→ "${esc(d.decoded)}"</div>` : ''}
                    <div class="detection-card-context">${esc(d.context)}</div>
                    <button class="detection-jump" data-node-id="${d.nodeId}">Highlight occurrence</button>
                </div>`;
            }
        }
        return html;
    }

    function renderDetections(detections) {
        if (!detections?.length) {
            detectionsList.innerHTML = '<div style="color:#666;padding:8px;">No detections.</div>';
            return { sneakyDecodedStrings: [] };
        }

        populateSbDropdowns(detections);
        const { char0, char1 } = sbConfig;

        const { sneakyMap, filteredDetections } = processSneakyBits(detections, char0, char1);

        const sneakyDecodedStrings = [];
        let html = buildSneakyBitsHtml(sneakyMap, sneakyDecodedStrings);
        html += buildStandardHtml(filteredDetections);

        detectionsList.innerHTML = html;

        // Copy handlers
        detectionsList.querySelectorAll('.detection-copy').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const rawText = btn.dataset.copyText;
                if (!rawText) return;
                try {
                    const sanitizedText = JSON.stringify(rawText).slice(1, -1).replace(/'/g, "\\'");
                    await navigator.clipboard.writeText(sanitizedText);
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="#00ff88" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
                } catch (err) { console.error('ASS: Failed to copy text:', err); }
            });
        });

        // Jump handlers
        detectionsList.querySelectorAll('.detection-jump').forEach(btn => {
            btn.addEventListener('click', async () => {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) return;

                const nodeIds = btn.dataset.nodeIds ? btn.dataset.nodeIds.split(',') : [btn.dataset.nodeId];
                chrome.tabs.sendMessage(tab.id, { action: 'scrollToDetection', nodeIds });
            });
        });

        return { sneakyDecodedStrings };
    }

    // ─── Filter Drawer Controls ──────────────────────────────────────

    const panelFilterInput = document.getElementById('panel-filter-input');
    const panelFilterDropdown = document.getElementById('panel-filter-dropdown');
    const panelFilterChips = document.getElementById('panel-filter-chips');
    const panelOptFuzzySearch = document.getElementById('panel-opt-fuzzy-search');
    const panelVisualProfile = document.getElementById('panel-opt-theme');
    const panelAutoHitchhiker = document.getElementById('panel-opt-auto-hitchhiker');
    const panelAhThreshold = document.getElementById('panel-opt-ah-threshold');
    const panelHighlightStyle = document.getElementById('panel-highlight-style');
    const panelOptNbsp = document.getElementById('panel-opt-nbsp');
    const panelOptConfusable = document.getElementById('panel-opt-confusable');
    const panelOptCc = document.getElementById('panel-opt-cc');
    const panelOptZs = document.getElementById('panel-opt-zs');
    const panelOptExpandToNames = document.getElementById('panel-opt-expand-to-names');
    const panelOptMinSeq = document.getElementById('panel-opt-min-seq');
    const panelOptMaxSeq = document.getElementById('panel-opt-max-seq');
    const panelSeqDrawer = document.getElementById('panel-seq-length-drawer');
    const panelSeqPreview = document.getElementById('panel-seq-preview');

    const sbChar0Select = document.getElementById('sb-char-0-select');
    const sbChar1Select = document.getElementById('sb-char-1-select');
    const sbAutoHint = document.getElementById('sb-auto-suggest-hint');
    const sbAutoThreshold = document.getElementById('sb-auto-threshold');

    let charFilters = [];
    let sbConfig = { char0: '', char1: '' };
    let sbUserOverride = false;
    let currentHighlightStyle = 'nimbus';

    // resolveCharName is now provided globally by unicode-chars.js

    function populateSbDropdowns(detections) {
        if (!sbChar0Select || !sbChar1Select || !detections) return;

        // Count frequencies of single characters
        const charCounts = {};
        let totalHiddenChars = 0;

        for (const d of detections) {
            const raw = d.rawChars || '';
            for (const char of raw) {
                charCounts[char] = (charCounts[char] || 0) + 1;
                totalHiddenChars++;
            }
        }

        const sortedChars = Object.keys(charCounts).sort((a, b) => charCounts[b] - charCounts[a]);

        // Auto-suggest logic
        let auto0 = '';
        let auto1 = '';
        const threshold = sbAutoThreshold ? (parseInt(sbAutoThreshold.value, 10) || 50) / 100 : 0.50;
        if (sortedChars.length >= 2 && totalHiddenChars > 12) {
            const top2Count = charCounts[sortedChars[0]] + charCounts[sortedChars[1]];
            if (top2Count / totalHiddenChars > threshold) {
                auto0 = sortedChars[0];
                auto1 = sortedChars[1];
            }
        }

        // Apply auto-suggest unless user has manually overridden
        let isAutoSuggested = false;
        if (!sbUserOverride && auto0 && auto1) {
            sbConfig.char0 = auto0;
            sbConfig.char1 = auto1;
            isAutoSuggested = true;
        }

        if (sbAutoHint) {
            sbAutoHint.style.display = isAutoSuggested ? 'block' : 'none';
        }

        const buildOptions = (selectedVal) => {
            let html = '<option value="">(None)</option>';
            for (const char of sortedChars) {
                const count = charCounts[char];
                const displayName = resolveCharName(char);
                const selected = char === selectedVal ? 'selected' : '';
                html += `<option value="${char}" ${selected}>${displayName} (${count})</option>`;
            }
            return html;
        };

        sbChar0Select.innerHTML = buildOptions(sbConfig.char0);
        sbChar1Select.innerHTML = buildOptions(sbConfig.char1);
    }

    /** Re-render detections locally using current sbConfig (no page rescan needed) */
    async function reRenderDetections() {
        if (!currentResults?.detections) return;
        const rendered = renderDetections(currentResults.detections) || { sneakyDecodedStrings: [] };
        renderTagRuns(currentResults.tagRunSummary, rendered.sneakyDecodedStrings || []);
        // Save sbConfig to settings without triggering rescan
        const resp = await chrome.runtime.sendMessage({ action: 'getSettings' });
        const s = resp?.settings || {};
        s.sbConfig = sbConfig;
        s.sbAutoThreshold = sbAutoThreshold ? parseInt(sbAutoThreshold.value, 10) || 50 : 50;
        chrome.runtime.sendMessage({ action: 'saveSettings', settings: s });
    }

    // Set up change handlers for the dynamic payload decoder dropdowns
    if (sbChar0Select) {
        sbChar0Select.addEventListener('change', () => {
            sbConfig.char0 = sbChar0Select.value;
            sbUserOverride = true;
            reRenderDetections();
        });
    }
    if (sbChar1Select) {
        sbChar1Select.addEventListener('change', () => {
            sbConfig.char1 = sbChar1Select.value;
            sbUserOverride = true;
            reRenderDetections();
        });
    }

    document.getElementById('sb-flip-btn')?.addEventListener('click', () => {
        const temp = sbConfig.char0;
        sbConfig.char0 = sbConfig.char1;
        sbConfig.char1 = temp;
        if (sbChar0Select) sbChar0Select.value = sbConfig.char0;
        if (sbChar1Select) sbChar1Select.value = sbConfig.char1;
        sbUserOverride = true;
        reRenderDetections();
    });

    // Utility: debounce (now imported from shared-ui.js)

    if (sbAutoThreshold) {
        sbAutoThreshold.addEventListener('input', debounce(() => {
            // Reset override so re-detection can run with new threshold
            sbUserOverride = false;
            reRenderDetections();
        }, 600));
    }

    // ─── Filter UI Initialization ─────────────────────────────────────────────

    const filterUI = initFilterUI({
        inputEl: panelFilterInput,
        dropdownEl: panelFilterDropdown,
        chipsContainerEl: panelFilterChips,
        categoryChips: document.querySelectorAll('#active-filters-section .search-filter-chip'),
        fuzzyToggleEl: panelOptFuzzySearch,
        chipHintEl: document.getElementById('panel-chip-hint'),
        initialFilters: charFilters,
        onFilterChange: (newFilters) => {
            charFilters = newFilters;
            saveFilterSettings();
        }
    });

    // Search filter category toggles removed (handled by details panel directly)


    // ─── Detection Cards ─────────────────────────────────────────────

    function updateSeqPreview() {
        const min = parseInt(panelOptMinSeq.value, 10) || 1;
        const max = parseInt(panelOptMaxSeq.value, 10) || 0;
        panelSeqPreview.textContent = `Min: ${min} - Max: ${max}`;
    }

    panelSeqDrawer.addEventListener('toggle', updateSeqPreview);
    updateSeqPreview();

    function updateSettingsAlert() {
        const alertEl = document.getElementById('panel-settings-alert');
        if (!alertEl) return;

        const uiDefault = filterUI ? filterUI.isDefaultState() : true;
        const isNonDefault =
            !uiDefault ||
            panelOptNbsp.checked !== false ||
            panelOptConfusable.checked !== false ||
            panelOptCc.checked !== false ||
            panelOptZs.checked !== false ||
            (panelOptExpandToNames && panelOptExpandToNames.checked !== false) ||
            (parseInt(panelOptMinSeq.value, 10) || 1) !== 1 ||
            (parseInt(panelOptMaxSeq.value, 10) || 0) !== 0;

        alertEl.classList.toggle('hidden', !isNonDefault);
    }

    // Save settings and trigger re-scan
    async function saveFilterSettings() {
        const s = {
            autoScan: false, // Don't change autoScan from panel
            charFilters: charFilters,
            fuzzySearch: panelOptFuzzySearch.checked,
            visualProfile: panelVisualProfile ? panelVisualProfile.value : 'default',
            autoHitchhiker: panelAutoHitchhiker ? panelAutoHitchhiker.checked : false,
            autoHitchhikerThreshold: panelAhThreshold ? Math.max(1, parseInt(panelAhThreshold.value, 10) || 8) : 8,
            detectNbsp: panelOptNbsp.checked,
            detectConfusableSpaces: panelOptConfusable.checked,
            detectControlChars: panelOptCc.checked,
            detectSpaceSeparators: panelOptZs.checked,
            expandToNames: panelOptExpandToNames ? panelOptExpandToNames.checked : false,
            highlightStyle: panelHighlightStyle ? panelHighlightStyle.value : 'nimbus',
            sbConfig: sbConfig,
            sbAutoThreshold: sbAutoThreshold ? parseInt(sbAutoThreshold.value, 10) || 50 : 50,
            minSeqLength: Math.max(1, parseInt(panelOptMinSeq.value, 10) || 1),
            maxSeqLength: Math.max(0, parseInt(panelOptMaxSeq.value, 10) || 0),
        };

        // Preserve autoScan from the loaded settings
        const resp = await chrome.runtime.sendMessage({ action: 'getSettings' });
        if (resp?.settings?.autoScan !== undefined) s.autoScan = resp.settings.autoScan;
        chrome.runtime.sendMessage({ action: 'saveSettings', settings: s });
        triggerRescan();
        updateSeqPreview();
    }

    async function triggerRescan() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) chrome.runtime.sendMessage({ action: 'triggerScan', tabId: tab.id });
    }

    // Checkbox & number input handlers
    const saveFilterSettingsDebounced = debounce(saveFilterSettings, 600);

    [panelOptNbsp, panelOptConfusable, panelOptCc, panelOptZs, panelOptExpandToNames, panelOptFuzzySearch].forEach(el => {
        if (el) el.addEventListener('change', saveFilterSettings)
    });
    if (panelVisualProfile) panelVisualProfile.addEventListener('change', () => {
        saveFilterSettings();
        applyTheme(panelVisualProfile.value);
    });
    if (panelAutoHitchhiker) panelAutoHitchhiker.addEventListener('change', saveFilterSettings);
    // Debounced: rapid spinner clicks won't flood rescans
    if (panelAhThreshold) panelAhThreshold.addEventListener('input', saveFilterSettingsDebounced);
    if (panelHighlightStyle) panelHighlightStyle.addEventListener('change', saveFilterSettings);
    [panelOptMinSeq, panelOptMaxSeq].forEach(el =>
        el.addEventListener('input', saveFilterSettings));

    // Load settings into the drawer controls
    async function loadFilterSettings() {
        const resp = await chrome.runtime.sendMessage({ action: 'getSettings' });
        const settings = resp?.settings || {};
        charFilters = settings.charFilters || [];
        panelOptNbsp.checked = settings.detectNbsp || false;
        panelOptFuzzySearch.checked = settings.fuzzySearch ?? true;
        if (panelVisualProfile) panelVisualProfile.value = settings.visualProfile || 'default';
        if (panelAutoHitchhiker) panelAutoHitchhiker.checked = settings.autoHitchhiker || false;
        if (panelAhThreshold) panelAhThreshold.value = settings.autoHitchhikerThreshold ?? 8;
        if (panelHighlightStyle) panelHighlightStyle.value = settings.highlightStyle || 'nimbus';
        currentHighlightStyle = settings.highlightStyle || 'nimbus';
        panelOptConfusable.checked = settings.detectConfusableSpaces || false;
        if (panelOptExpandToNames) panelOptExpandToNames.checked = settings.expandToNames || false;

        // Load dynamic decoder settings or migrate old ones
        if (settings.sbConfig) {
            sbConfig = { char0: settings.sbConfig.char0 || '', char1: settings.sbConfig.char1 || '' };
        } else if (settings.sneakyBitConfig && settings.sneakyBitConfig['\uFE0E']) {
            sbConfig = { char0: '\uFE0E', char1: '\uFE0F' };
        } else {
            sbConfig = { char0: '', char1: '' };
        }
        if (sbAutoThreshold) sbAutoThreshold.value = settings.sbAutoThreshold ?? 50;

        panelOptMinSeq.value = settings.minSeqLength ?? 1;
        panelOptMaxSeq.value = settings.maxSeqLength ?? 0;
        if (typeof filterUI !== 'undefined') filterUI.updateFilters(charFilters);
        applyTheme(settings.visualProfile);
        updateSeqPreview();
    }

    // ─── Export JSON ──────────────────────────────────────────────────

    exportJsonBtn.addEventListener('click', () => {
        if (!currentResults) return;
        const report = {
            metadata: {
                url: currentResults.url,
                timestamp: currentResults.timestamp,
                total_invisible_code_points: currentResults.suspicion?.totalCodePoints || 0,
            },
            page_suspicion: currentResults.suspicion,
            category_breakdown: currentResults.categoryBreakdown,
            detections: currentResults.detections.map(d => ({
                node_id: d.nodeId, group_size: d.groupSize, severity: d.severity,
                type: d.type, char_name: d.charName, code_points: d.codePoints,
                decoded: d.decoded, context: d.context, category: d.category,
            })),
        };
        download(JSON.stringify(report, null, 2), `ass-report-${Date.now()}.json`, 'application/json');
    });

    // ─── Export CSV ───────────────────────────────────────────────────

    exportCsvBtn.addEventListener('click', () => {
        if (!currentResults) return;
        const header = ['node_id', 'group_size', 'severity', 'type', 'char_name', 'code_points', 'decoded', 'context', 'category'];
        const rows = [header.join(',')];
        for (const d of currentResults.detections) {
            rows.push([d.nodeId, d.groupSize, d.severity, d.type, csvEsc(d.charName),
            csvEsc(d.codePoints.join(';')), csvEsc(d.decoded || ''), csvEsc(d.context), csvEsc(d.category)].join(','));
        }
        download(rows.join('\n'), `ass-report-${Date.now()}.csv`, 'text/csv');
    });

    // esc function is now imported from shared-ui.js

    function csvEsc(str) {
        if (!str) return '';
        str = String(str);
        return (str.includes(',') || str.includes('"') || str.includes('\n'))
            ? '"' + str.replace(/"/g, '""') + '"'
            : str;
    }

    function download(content, filename, type) {
        const url = URL.createObjectURL(new Blob([content], { type }));
        const a = Object.assign(document.createElement('a'), { href: url, download: filename });
        a.click();
        URL.revokeObjectURL(url);
    }

    // ─── Initialize ───────────────────────────────────────────────────

    loadFilterSettings();
    loadResults();
});
