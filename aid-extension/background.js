/**
 * ASS – ASCII Smuggling Surfacer
 * Background Service Worker
 * Handles content-script injection, badge updates, message routing, and auto-scan.
 */

// ─── Defaults & Constants ───────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
    autoScan: false,
    detectNbsp: false,
    detectConfusableSpaces: false,
    detectControlChars: false,
    detectSpaceSeparators: false,
    minSeqLength: 1,
    maxSeqLength: 0,  // 0 = no limit
    charFilters: [],  // array of { id: "U+FE0F", type: "exclude"|"include" }
    visualProfile: 'default',
    highlightStyle: 'military',
    autoHitchhiker: false,
    autoHitchhikerThreshold: 8,
};

const BADGE_COLORS = {
    clean: '#4CAF50',
    info: '#2196F3',
    medium: '#FFC107',
    high: '#FF9800',
    critical: '#F44336',
};

// ─── State ──────────────────────────────────────────────────────────────────

const tabResults = new Map(); // tabId → scan results

// ─── Initialization ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
    const data = await chrome.storage.local.get('settings');
    if (!data.settings) chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    if (chrome.sidePanel) {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    }
});

// ─── Content-Script Injection ───────────────────────────────────────────────

/**
 * Injects the required scanning scripts and CSS into the target tab, and triggers a scan.
 * @param {number} tabId - The ID of the tab to inject into.
 */
async function injectAndScan(tabId) {
    const settings = await getSettings();
    try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['unicode-chars.js', 'content.js'] });
        await chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] });
        chrome.tabs.sendMessage(tabId, { action: 'scan', settings });
    } catch (err) {
        console.error('ASS: injection failed:', err);
    }
}

// ─── Message Handling ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'scanComplete':
            updateBadge(sender.tab.id, message);
            break;

        case 'scanResults':
            tabResults.set(sender.tab.id, message.results);
            break;

        case 'getResults':
            sendResponse({ results: tabResults.get(message.tabId) || null });
            return true;

        case 'triggerScan':
            injectAndScan(message.tabId);
            break;

        case 'getSettings':
            getSettings().then(s => sendResponse({ settings: s }));
            return true;

        case 'saveSettings':
            chrome.storage.local.set({ settings: message.settings }).then(() => {
                sendResponse({ ok: true });
                handleAutoScanToggle(message.settings);
            });
            return true;

        case 'openPanel':
            if (chrome.sidePanel) {
                chrome.sidePanel.open({ tabId: message.tabId || sender.tab.id });
            }
            break;
    }
});

// ─── Badge ──────────────────────────────────────────────────────────────────

/**
 * Updates the extension badge with the current scan results.
 * @param {number} tabId - The ID of the tab to update.
 * @param {Object} data - Overview containing suspicious level and detections.
 */
function updateBadge(tabId, { suspicion, totalDetections }) {
    if (totalDetections === 0) {
        chrome.action.setBadgeText({ text: '✓', tabId });
        chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS.clean, tabId });
    } else {
        chrome.action.setBadgeText({ text: totalDetections > 999 ? '999+' : String(totalDetections), tabId });
        chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS[suspicion.suspicionLevel] || BADGE_COLORS.info, tabId });
    }
}

// ─── Auto-Scan ──────────────────────────────────────────────────────────────

/**
 * Enables or disables the auto-scan injections.
 * @param {Object} settings - The current extension settings.
 */
function handleAutoScanToggle(settings) {
    settings.autoScan ? registerAutoScan() : unregisterAutoScan();
}

/** Registers the auto-scan content scripts to inject on all URLs. */
function registerAutoScan() {
    chrome.scripting.registerContentScripts([{
        id: 'ass-autoscan',
        matches: ['<all_urls>'],
        js: ['unicode-chars.js', 'content.js'],
        css: ['styles.css'],
        runAt: 'document_idle',
    }]).catch(() => { });
}

/** Unregisters the auto-scan content scripts. */
function unregisterAutoScan() {
    chrome.scripting.unregisterContentScripts({ ids: ['ass-autoscan'] }).catch(() => { });
}

// ─── Tab Cleanup ────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener(tabId => tabResults.delete(tabId));

chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading') {
        tabResults.delete(tabId);
        chrome.action.setBadgeText({ text: '', tabId });
    }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getSettings() {
    const data = await chrome.storage.local.get('settings');
    return data.settings || DEFAULT_SETTINGS;
}

// Restore auto-scan on startup
getSettings().then(s => { if (s.autoScan) registerAutoScan(); });
