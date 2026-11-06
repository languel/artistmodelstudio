/**
 * Paid models are opt-in. OpenRouter lists free and paid models side by side; nothing paid is listed, defaulted or sent unless this is switched on
 * (Settings → Model, with OpenRouter as the engine). Off by default.
 */
const KEY = 'ams_allow_paid';
export const allowPaid = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setAllowPaid = on => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } };
