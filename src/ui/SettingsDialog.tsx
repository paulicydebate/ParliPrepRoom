import { useEffect, useRef } from 'react';
import { setProfileName, useProfile } from '../settings/profile';
import { PRESET_LABELS, type StyleKeyPreset } from '../editor/shortcuts';
import { BLOCK_KINDS, KIND_INFO, type BlockKind } from '../model/blocks';
import { DEFAULT_SETTINGS, FONTS, fontStack, updateSettings, useSettings, type StyleSetting, type Theme } from '../settings/settings';
import { IconClose } from './icons';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'sepia', label: 'Sepia' },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const profile = useProfile();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const setStyle = (kind: BlockKind, patch: Partial<StyleSetting>) =>
    updateSettings({ ...settings, styles: { ...settings.styles, [kind]: { ...settings.styles[kind], ...patch } } });

  const setAllFonts = (font: string) => {
    const styles = { ...settings.styles };
    for (const k of BLOCK_KINDS) styles[k] = { ...styles[k], font };
    updateSettings({ ...settings, styles });
  };

  return (
    <dialog ref={ref} className="settings" onClose={onClose} onCancel={onClose}>
      <div className="settings-head">
        <h2>Appearance</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <p className="muted">Saved in this browser only. Your partner can use different fonts on the same doc.</p>

      <h3>Your name</h3>
      <input
        className="name-input"
        defaultValue={profile.name}
        aria-label="Your name"
        onBlur={(e) => e.target.value.trim() && setProfileName(e.target.value)}
      />

      <h3>Theme</h3>
      <div className="seg" role="group" aria-label="Theme">
        {THEMES.map((t) => (
          <button key={t.id} type="button" className={settings.theme === t.id ? 'is-on' : ''} onClick={() => updateSettings({ ...settings, theme: t.id })}>
            {t.label}
          </button>
        ))}
      </div>

      <h3>Style keys</h3>
      <div className="seg wrap" role="group" aria-label="Style keys">
        {(Object.keys(PRESET_LABELS) as StyleKeyPreset[]).map((p) => (
          <button key={p} type="button" className={settings.styleKeys === p ? 'is-on' : ''} onClick={() => updateSettings({ ...settings, styleKeys: p })}>
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      <h3>Styles</h3>
      <label className="row-inline">
        Use one font for everything
        <select defaultValue="" onChange={(e) => e.target.value && setAllFonts(e.target.value)}>
          <option value="">Choose…</option>
          {FONTS.map((f) => (
            <option key={f.label} value={f.label}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <div className="style-rows">
        {BLOCK_KINDS.map((k) => {
          const st = settings.styles[k];
          return (
            <div key={k} className="style-row">
              <div
                className="style-preview"
                style={{
                  fontFamily: fontStack(st.font),
                  fontSize: Math.min(st.size, 22),
                  fontWeight: st.bold ? 700 : 400,
                  fontStyle: st.italic ? 'italic' : 'normal',
                  textDecoration: st.underline ? 'underline' : 'none',
                  color: st.color ?? undefined,
                }}
              >
                {KIND_INFO[k].label}
              </div>
              <div className="style-controls">
                <select aria-label={`${KIND_INFO[k].label} font`} value={st.font} onChange={(e) => setStyle(k, { font: e.target.value })}>
                  {FONTS.map((f) => (
                    <option key={f.label} value={f.label} style={{ fontFamily: f.stack }}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={10}
                  max={48}
                  step={0.5}
                  aria-label={`${KIND_INFO[k].label} size`}
                  value={st.size}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 8 && v <= 72) setStyle(k, { size: v });
                  }}
                />
                <button type="button" className={'tb-btn' + (st.bold ? ' is-on' : '')} aria-pressed={st.bold} aria-label="Bold" onClick={() => setStyle(k, { bold: !st.bold })}>
                  <b>B</b>
                </button>
                <button type="button" className={'tb-btn' + (st.italic ? ' is-on' : '')} aria-pressed={st.italic} aria-label="Italic" onClick={() => setStyle(k, { italic: !st.italic })}>
                  <i>I</i>
                </button>
                <button type="button" className={'tb-btn' + (st.underline ? ' is-on' : '')} aria-pressed={st.underline} aria-label="Underline" onClick={() => setStyle(k, { underline: !st.underline })}>
                  <u>U</u>
                </button>
                <input type="color" aria-label={`${KIND_INFO[k].label} color`} value={st.color ?? '#333333'} onChange={(e) => setStyle(k, { color: e.target.value })} />
                {st.color && (
                  <button type="button" className="btn ghost small" onClick={() => setStyle(k, { color: null })}>
                    Auto color
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="settings-foot">
        <button type="button" className="btn ghost" onClick={() => updateSettings({ ...DEFAULT_SETTINGS, theme: settings.theme, styleKeys: settings.styleKeys })}>
          Reset styles
        </button>
        <button type="button" className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}
