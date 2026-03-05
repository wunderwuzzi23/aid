/**
 * ASS – Shared UI Logic
 * Handles interactive filter inputs, autocomplete dropdowns, and category chips.
 * This logic is shared between the popup and the side panel.
 */

/**
 * Configuration options for initializing the FilterUI.
 * @typedef {Object} FilterUIOptions
 * @property {HTMLInputElement} inputEl - The main text input element for filtering.
 * @property {HTMLElement} dropdownEl - The container element for the autocomplete dropdown.
 * @property {HTMLElement} chipsContainerEl - The container element for active filter chips.
 * @property {NodeList|Array<HTMLElement>} categoryChips - Collection of category toggle elements.
 * @property {HTMLInputElement} [fuzzyToggleEl] - Optional checkbox element to toggle fuzzy searching.
 * @property {HTMLElement} [chipHintEl] - Optional hint text element shown near chips.
 * @property {Array<Object>} [initialFilters=[]] - Initial array of filter objects.
 * @property {Function} [onFilterChange=() => {}] - Callback fired when filters are added/removed/toggled.
 */

/**
 * Manages the interactive filter inputs, autocomplete dropdowns, and category chips.
 * This logic is shared between the popup and the side panel.
 */
class FilterUI {
    /**
     * Initializes the FilterUI instance with the given DOM elements and configuration.
     * @param {FilterUIOptions} options - Configuration options.
     */
    constructor({
        inputEl,
        dropdownEl,
        chipsContainerEl,
        categoryChips,
        fuzzyToggleEl = null,
        chipHintEl = null,
        initialFilters = [],
        onFilterChange = () => { }
    }) {
        this.inputEl = inputEl;
        this.dropdownEl = dropdownEl;
        this.chipsContainerEl = chipsContainerEl;
        this.categoryChips = categoryChips;
        this.fuzzyToggleEl = fuzzyToggleEl;
        this.chipHintEl = chipHintEl;
        this.onFilterChange = onFilterChange;

        this.charFilters = [...initialFilters];
        this.categoryStates = {};
        this.knownChars = [];
        this.currentFocus = -1;
        this.currentMatches = [];
        this.detectedCodepoints = new Set();

        try {
            this.knownChars = getAllKnownCharacters();
        } catch (e) {
            console.warn('ASS: Unable to load unicode characters for filtering. `unicode-chars.js` may not be loaded.', e);
        }

        this._initCategoryToggles();
        this._initEventListeners();
        this._renderFilterChips();
    }

    _initCategoryToggles() {
        this.categoryChips.forEach(chip => {
            const cat = chip.dataset.category;
            this.categoryStates[cat] = chip.dataset.state;

            chip.addEventListener('click', () => {
                const newState = chip.dataset.state === 'include' ? 'exclude' : 'include';
                chip.dataset.state = newState;
                this.categoryStates[cat] = newState;
                chip.querySelector('.sf-toggle').textContent = newState === 'include' ? '+' : '\u2212';
                this._triggerDropdownRefresh();
            });
        });
    }

    _initEventListeners() {
        this.inputEl.addEventListener('keydown', (e) => this._handleKeydown(e));

        const handleInputOrFocus = () => {
            const query = this.inputEl.value.trim().toLowerCase();
            this._renderDropdown(this._getFilteredKnownChars(query));
        };

        this.inputEl.addEventListener('input', handleInputOrFocus);
        this.inputEl.addEventListener('focus', handleInputOrFocus);

        this.inputEl.addEventListener('click', () => {
            if (!this.dropdownEl.classList.contains('show')) {
                handleInputOrFocus();
            }
        });

        this.inputEl.addEventListener('blur', () => {
            this.dropdownEl.classList.remove('show');
        });

        if (this.fuzzyToggleEl) {
            this.fuzzyToggleEl.addEventListener('change', () => {
                this._triggerDropdownRefresh();
                this.inputEl.focus();
            });
        }
    }

    _getFilteredKnownChars(query) {
        const enabledCategories = Object.entries(this.categoryStates)
            .filter(([, state]) => state === 'include')
            .map(([cat]) => cat);

        const filtered = this.knownChars.filter(c => {
            if (!enabledCategories.includes(c.searchCategory)) return false;
            if (query) {
                if (this.fuzzyToggleEl && this.fuzzyToggleEl.checked) {
                    const chunks = query.toLowerCase().split(/\s+/).filter(Boolean);
                    if (chunks.length === 0) return true;
                    return chunks.every(chunk => c.name.toLowerCase().includes(chunk) || c.codeStr.toLowerCase().includes(chunk));
                } else {
                    return c.name.toLowerCase().includes(query) ||
                        c.codeStr.toLowerCase().includes(query);
                }
            }
            return true;
        });

        // Sort detected characters first
        if (this.detectedCodepoints.size > 0 && !query) {
            filtered.sort((a, b) => {
                const aDetected = this.detectedCodepoints.has(a.codeStr);
                const bDetected = this.detectedCodepoints.has(b.codeStr);
                if (aDetected && !bDetected) return -1;
                if (!aDetected && bDetected) return 1;
                return 0;
            });
        }

        return filtered.slice(0, 500);
    }

    _triggerDropdownRefresh() {
        if (!this.dropdownEl.classList.contains('show')) return;
        const query = this.inputEl.value.trim().toLowerCase();
        this._renderDropdown(this._getFilteredKnownChars(query));
    }

    _renderFilterChips() {
        if (this.chipHintEl) {
            this.chipHintEl.style.display = this.charFilters.length > 0 ? 'block' : 'none';
        }
        this.chipsContainerEl.innerHTML = '';
        this.charFilters.forEach((filter, index) => {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            chip.dataset.type = filter.type;

            const toggle = document.createElement('div');
            toggle.className = 'filter-chip-toggle';
            toggle.dataset.type = filter.type;
            toggle.textContent = filter.type === 'include' ? '+' : (filter.type === 'exclude' ? '−' : '×');
            toggle.title = filter.type === 'include'
                ? 'Include (Allow-list)'
                : (filter.type === 'exclude' ? 'Exclude (Ignore)' : 'Disabled');

            toggle.addEventListener('click', () => {
                if (filter.type === 'exclude') filter.type = 'disabled';
                else if (filter.type === 'disabled') filter.type = 'include';
                else filter.type = 'exclude';
                this._renderFilterChips();
                this.onFilterChange([...this.charFilters]);
            });

            const label = document.createElement('div');
            label.className = 'filter-chip-label';
            label.textContent = filter.id;

            const remove = document.createElement('div');
            remove.className = 'filter-chip-remove';
            remove.textContent = '×';
            remove.addEventListener('click', () => {
                this.charFilters.splice(index, 1);
                this._renderFilterChips();
                this.onFilterChange([...this.charFilters]);
            });

            chip.appendChild(toggle);
            chip.appendChild(label);
            chip.appendChild(remove);
            this.chipsContainerEl.appendChild(chip);
        });
    }

    _renderDropdown(matches) {
        this.currentMatches = matches;
        this.currentFocus = -1;
        this.dropdownEl.innerHTML = '';
        if (matches.length === 0) {
            this.dropdownEl.classList.remove('show');
            return;
        }

        matches.forEach((match) => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';

            const codeSpan = document.createElement('span');
            codeSpan.className = 'dropdown-item-code';
            codeSpan.textContent = match.codeStr;

            item.appendChild(codeSpan);
            item.appendChild(document.createTextNode(match.name));

            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this._addFilter(match);
            });

            this.dropdownEl.appendChild(item);
        });
        this.dropdownEl.classList.add('show');
    }

    _addFilter(match) {
        if (!this.charFilters.find(f => f.id === match.codeStr)) {
            this.charFilters.push({ id: match.codeStr, type: 'exclude' });
            this._renderFilterChips();
            this.onFilterChange([...this.charFilters]);
        }
        this.inputEl.value = '';
        this.dropdownEl.classList.remove('show');
        this.inputEl.focus();
    }

    _setActiveItem(items) {
        if (!items || items.length === 0) return;
        Array.from(items).forEach(item => item.classList.remove('active'));
        if (this.currentFocus >= items.length) this.currentFocus = 0;
        if (this.currentFocus < 0) this.currentFocus = items.length - 1;
        items[this.currentFocus].classList.add('active');
        items[this.currentFocus].scrollIntoView({ block: 'nearest' });
    }

    _handleKeydown(e) {
        const items = this.dropdownEl.querySelectorAll('.dropdown-item');
        if (!this.dropdownEl.classList.contains('show') || items.length === 0) return;

        if (e.key === 'ArrowDown') {
            this.currentFocus++;
            this._setActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            this.currentFocus--;
            this._setActiveItem(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.currentFocus > -1) {
                items[this.currentFocus].dispatchEvent(new MouseEvent('mousedown'));
            } else if (items.length === 1) {
                items[0].dispatchEvent(new MouseEvent('mousedown'));
            }
        }
    }

    /**
     * Updates the underlying UI state with an entirely new filter configuration array.
     * Useful for reacting to asynchronous source changes (like chrome.storage).
     * @param {Array<Object>} newFilters - The new filters to replace existing ones.
     */
    updateFilters(newFilters) {
        this.charFilters = [...newFilters];
        this._renderFilterChips();
    }

    /**
     * Checks whether the current UI state represents the default state logic.
     * A filtered UI is considered modified if any category toggles are explicitly disabled,
     * or if any individual custom filter chips have been added.
     * @returns {boolean} True if in default default state, false otherwise.
     */
    isDefaultState() {
        const hasCustomFilters = this.charFilters.length > 0;
        const hasExcludedCategory = Object.values(this.categoryStates).some(s => s === 'exclude');
        return !hasCustomFilters && !hasExcludedCategory;
    }

    /**
     * Set the set of detected codepoints to surface them at the top.
     * @param {Set<string>} codepointsSet - A set of `U+XXXX` strings.
     */
    setDetectedCodepoints(codepointsSet) {
        this.detectedCodepoints = codepointsSet;
        this._triggerDropdownRefresh();
    }
}

/**
 * Global helper to extract a Set of U+XXXX strings from a scan's detections array.
 * @param {Array<Object>} detections - Array of detection objects from content script.
 * @returns {Set<string>} Set of formatted codepoints.
 */
function extractDetectedCodepoints(detections) {
    const codepoints = new Set();
    if (!detections) return codepoints;

    for (const d of detections) {
        if (d.codePoints && Array.isArray(d.codePoints)) {
            d.codePoints.forEach(cp => {
                // The codePoints are sometimes formatted with extra spaces or as raw strings.
                const cleaned = cp.replace(/\s/g, '').toUpperCase();
                if (cleaned.startsWith('U+')) codepoints.add(cleaned);
            });
        }
    }
    return codepoints;
}

// Global factory to maintain backward compatibility with popup.js and panel.js calls
function initFilterUI(config) {
    return new FilterUI(config);
}

function applyTheme(themeName) {
    let link = document.getElementById('ass-theme-link');
    if (!themeName || themeName === 'default') {
        if (link) link.remove();
        return;
    }
    if (!link) {
        link = document.createElement('link');
        link.id = 'ass-theme-link';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    }
    link.href = `themes/${themeName}.css`;
}
