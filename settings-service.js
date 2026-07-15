/* =============================================================
   ANTIGRAVITY CHESS — Settings Service (settings-service.js)
   All settings persist to localStorage and apply as CSS vars
   ============================================================= */

export const SettingsService = {

    /* ─── Defaults ──────────────────────────────────────────── */
    defaults: {
        boardTheme:      'mono',        // mono | wood | green | ocean | purple | ice
        pieceTheme:      'standard',    // standard | classic | minimal (future)
        highlightColor:  '#baca2b',     // hex color for selected square overlay
        lastMoveColor:   '#f7f785',     // hex for last move highlight
        animationSpeed:  'normal',      // none | fast | normal | slow
        sounds:          true,
        soundVolume:     80,
        music:           false,
        musicVolume:     40,
        aiDifficulty:    'medium',      // easy | medium | hard | expert | master | grandmaster
        language:        'en',          // en only for now (future: es, fr, de, ar, hi)
    },

    /* ─── Storage key ───────────────────────────────────────── */
    _KEY: 'antigravity_chess_settings',

    /* ─── Read all ──────────────────────────────────────────── */
    getAll() {
        try {
            const raw = localStorage.getItem(this._KEY);
            return raw ? { ...this.defaults, ...JSON.parse(raw) } : { ...this.defaults };
        } catch { return { ...this.defaults }; }
    },

    /* ─── Read single ───────────────────────────────────────── */
    get(key) {
        return this.getAll()[key] ?? this.defaults[key];
    },

    /* ─── Write single and auto-apply ───────────────────────── */
    set(key, value) {
        const all = this.getAll();
        all[key] = value;
        try { localStorage.setItem(this._KEY, JSON.stringify(all)); } catch {}
        this._apply(all);
        // Fire change event for any listeners
        window.dispatchEvent(new CustomEvent('settings-changed', { detail: { key, value, all } }));
    },

    /* ─── Bulk write (for import/reset) ─────────────────────── */
    setAll(obj) {
        const all = { ...this.defaults, ...obj };
        try { localStorage.setItem(this._KEY, JSON.stringify(all)); } catch {}
        this._apply(all);
        window.dispatchEvent(new CustomEvent('settings-changed', { detail: { all } }));
    },

    /* ─── Reset to defaults ──────────────────────────────────── */
    reset() { this.setAll(this.defaults); },

    /* ─── Apply all CSS custom properties ────────────────────── */
    _apply(s) {
        const root = document.documentElement;

        // Board theme → data-theme attribute (drives CSS variable blocks)
        root.setAttribute('data-theme', s.boardTheme);

        // Update old header theme pills if they still exist
        document.querySelectorAll('.pill[id^="pill-"]').forEach(p => {
            p.classList.toggle('active', p.id === `pill-${s.boardTheme}`);
        });

        // Animation speed → CSS variable
        const speedMap = { none: '0ms', fast: '80ms', normal: '180ms', slow: '360ms' };
        root.style.setProperty('--move-duration', speedMap[s.animationSpeed] || '180ms');

        // Highlight color → CSS variables
        root.style.setProperty('--sq-sel-light',  s.highlightColor);
        root.style.setProperty('--sq-sel-dark',   _darken(s.highlightColor, 0.82));
        root.style.setProperty('--sq-last-light', s.lastMoveColor);
        root.style.setProperty('--sq-last-dark',  _darken(s.lastMoveColor,  0.82));

        // Piece theme class on board wrapper (for future CSS overrides)
        document.querySelectorAll('#chess-board, #puzzle-board-wrap').forEach(el => {
            el.dataset.pieceTheme = s.pieceTheme;
        });

        // Sound / music (dispatched events handled by audio engine in app.js)
        // The audio engine listens to 'settings-changed'
    },

    /* ─── Bootstrap ──────────────────────────────────────────── */
    init() {
        this._apply(this.getAll());
    }
};

/* ─── Utility: darken a hex color by a factor (0-1) ─────────── */
function _darken(hex, factor) {
    try {
        const n = parseInt(hex.replace('#',''), 16);
        const r = Math.round(((n >> 16) & 0xff) * factor);
        const g = Math.round(((n >>  8) & 0xff) * factor);
        const b = Math.round(( n        & 0xff) * factor);
        return `rgb(${r},${g},${b})`;
    } catch { return hex; }
}
