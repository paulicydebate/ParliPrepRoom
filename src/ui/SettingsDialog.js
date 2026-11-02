import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { setProfileName, useProfile } from '../settings/profile';
import { PRESET_LABELS } from '../editor/shortcuts';
import { BLOCK_KINDS, KIND_INFO } from '../model/blocks';
import { DEFAULT_SETTINGS, FONTS, fontStack, updateSettings, useSettings } from '../settings/settings';
import { ColorwayPicker } from './ColorwayPicker';
import { IconClose } from './icons';
const THEMES = [
    { id: 'system', label: 'Auto' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'sepia', label: 'Sepia' },
];
export function SettingsDialog({ onClose }) {
    const settings = useSettings();
    const profile = useProfile();
    const ref = useRef(null);
    useEffect(() => {
        const d = ref.current;
        if (d && !d.open)
            d.showModal();
    }, []);
    const setStyle = (kind, patch) => updateSettings({ ...settings, styles: { ...settings.styles, [kind]: { ...settings.styles[kind], ...patch } } });
    const setAllFonts = (font) => {
        const styles = { ...settings.styles };
        for (const k of BLOCK_KINDS)
            styles[k] = { ...styles[k], font };
        updateSettings({ ...settings, styles });
    };
    return (_jsxs("dialog", { ref: ref, className: "settings", onClose: onClose, onCancel: onClose, children: [_jsxs("div", { className: "settings-head", children: [_jsx("h2", { children: "Appearance" }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": "Close", onClick: onClose, children: _jsx(IconClose, {}) })] }), _jsx("p", { className: "muted", children: "Saved in this browser only. Your partner can use different fonts on the same doc." }), _jsx("h3", { children: "Your name" }), _jsx("input", { className: "name-input", defaultValue: profile.name, "aria-label": "Your name", onBlur: (e) => e.target.value.trim() && setProfileName(e.target.value) }), _jsx("h3", { children: "Theme" }), _jsx("div", { className: "seg", role: "group", "aria-label": "Theme", children: THEMES.map((t) => (_jsx("button", { type: "button", className: settings.theme === t.id ? 'is-on' : '', onClick: () => updateSettings({ ...settings, theme: t.id }), children: t.label }, t.id))) }), _jsx("h3", { children: "Gov & Opp colors" }), _jsx(ColorwayPicker, {}), _jsx("h3", { children: "Style keys" }), _jsx("div", { className: "seg wrap", role: "group", "aria-label": "Style keys", children: Object.keys(PRESET_LABELS).map((p) => (_jsx("button", { type: "button", className: settings.styleKeys === p ? 'is-on' : '', onClick: () => updateSettings({ ...settings, styleKeys: p }), children: PRESET_LABELS[p] }, p))) }), _jsx("h3", { children: "Styles" }), _jsxs("label", { className: "row-inline", children: ["Use one font for everything", _jsxs("select", { defaultValue: "", onChange: (e) => e.target.value && setAllFonts(e.target.value), children: [_jsx("option", { value: "", children: "Choose\u2026" }), FONTS.map((f) => (_jsx("option", { value: f.label, children: f.label }, f.label)))] })] }), _jsx("div", { className: "style-rows", children: BLOCK_KINDS.map((k) => {
                    const st = settings.styles[k];
                    return (_jsxs("div", { className: "style-row", children: [_jsx("div", { className: "style-preview", style: {
                                    fontFamily: fontStack(st.font),
                                    fontSize: Math.min(st.size, 22),
                                    fontWeight: st.bold ? 700 : 400,
                                    fontStyle: st.italic ? 'italic' : 'normal',
                                    textDecoration: st.underline ? 'underline' : 'none',
                                    color: st.color ?? undefined,
                                }, children: KIND_INFO[k].label }), _jsxs("div", { className: "style-controls", children: [_jsx("select", { "aria-label": `${KIND_INFO[k].label} font`, value: st.font, onChange: (e) => setStyle(k, { font: e.target.value }), children: FONTS.map((f) => (_jsx("option", { value: f.label, style: { fontFamily: f.stack }, children: f.label }, f.label))) }), _jsx("input", { type: "number", min: 10, max: 48, step: 0.5, "aria-label": `${KIND_INFO[k].label} size`, value: st.size, onChange: (e) => {
                                            const v = Number(e.target.value);
                                            if (v >= 8 && v <= 72)
                                                setStyle(k, { size: v });
                                        } }), _jsx("button", { type: "button", className: 'tb-btn' + (st.bold ? ' is-on' : ''), "aria-pressed": st.bold, "aria-label": "Bold", onClick: () => setStyle(k, { bold: !st.bold }), children: _jsx("b", { children: "B" }) }), _jsx("button", { type: "button", className: 'tb-btn' + (st.italic ? ' is-on' : ''), "aria-pressed": st.italic, "aria-label": "Italic", onClick: () => setStyle(k, { italic: !st.italic }), children: _jsx("i", { children: "I" }) }), _jsx("button", { type: "button", className: 'tb-btn' + (st.underline ? ' is-on' : ''), "aria-pressed": st.underline, "aria-label": "Underline", onClick: () => setStyle(k, { underline: !st.underline }), children: _jsx("u", { children: "U" }) }), _jsx("input", { type: "color", "aria-label": `${KIND_INFO[k].label} color`, value: st.color ?? '#333333', onChange: (e) => setStyle(k, { color: e.target.value }) }), st.color && (_jsx("button", { type: "button", className: "btn ghost small", onClick: () => setStyle(k, { color: null }), children: "Auto color" }))] })] }, k));
                }) }), _jsxs("div", { className: "settings-foot", children: [_jsx("button", { type: "button", className: "btn ghost", onClick: () => updateSettings({ ...DEFAULT_SETTINGS, theme: settings.theme, styleKeys: settings.styleKeys, colorway: settings.colorway, customColors: settings.customColors }), children: "Reset styles" }), _jsx("button", { type: "button", className: "btn primary", onClick: onClose, children: "Done" })] })] }));
}
