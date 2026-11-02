import { COLORWAYS } from '../settings/colorways';
import { updateSettings, useSettings } from '../settings/settings';

/** Grid of Gov/Opp color pairs, plus "Pick your own". */
export function ColorwayPicker() {
  const s = useSettings();
  const pick = (colorway: string) => updateSettings({ ...s, colorway });
  return (
    <div className="colorways">
      <div className="colorway-grid" role="radiogroup" aria-label="Gov and Opp colors">
        {COLORWAYS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={s.colorway === c.id}
            className={'colorway' + (s.colorway === c.id ? ' is-on' : '')}
            onClick={() => pick(c.id)}
            title={c.label}
            style={{ ['--sw-gov-l' as string]: c.gov.light, ['--sw-gov-d' as string]: c.gov.dark, ['--sw-opp-l' as string]: c.opp.light, ['--sw-opp-d' as string]: c.opp.dark }}
          >
            <span className="swatch" aria-hidden="true">
              <span className="sw-gov" />
              <span className="sw-opp" />
            </span>
            <span className="colorway-label">{c.label}</span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={s.colorway === 'custom'}
          className={'colorway' + (s.colorway === 'custom' ? ' is-on' : '')}
          onClick={() => pick('custom')}
          style={{ ['--sw-gov-l' as string]: s.customColors.gov, ['--sw-gov-d' as string]: s.customColors.gov, ['--sw-opp-l' as string]: s.customColors.opp, ['--sw-opp-d' as string]: s.customColors.opp }}
        >
          <span className="swatch" aria-hidden="true">
            <span className="sw-gov" />
            <span className="sw-opp" />
          </span>
          <span className="colorway-label">Pick your own</span>
        </button>
      </div>
      {s.colorway === 'custom' && (
        <div className="custom-colors">
          <label>
            <input type="color" value={s.customColors.gov} onChange={(e) => updateSettings({ ...s, colorway: 'custom', customColors: { ...s.customColors, gov: e.target.value } })} />
            Gov
          </label>
          <label>
            <input type="color" value={s.customColors.opp} onChange={(e) => updateSettings({ ...s, colorway: 'custom', customColors: { ...s.customColors, opp: e.target.value } })} />
            Opp
          </label>
        </div>
      )}
    </div>
  );
}
