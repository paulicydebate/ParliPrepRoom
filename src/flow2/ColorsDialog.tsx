import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { setFlowColors, setFlowTheme, useFlowColors, useFlowTheme } from '../store/flowTheme';
import { ColorwayPicker } from '../ui/ColorwayPicker';
import { IconClose } from '../ui/icons';

/** "Colors" in the sheet bar: a quick window to switch Gov/Opp colors. */
export function ColorsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn ghost small colors-btn" title="Change Gov and Opp colors" onClick={() => setOpen(true)}>
        <span className="mini-swatch" aria-hidden="true">
          <span style={{ background: 'var(--gov)' }} />
          <span style={{ background: 'var(--opp)' }} />
        </span>
        Colors
      </button>
      {open && createPortal(<ColorsDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ColorsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const flowTheme = useFlowTheme();
  const flowColors = useFlowColors();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="settings colors-dialog"
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-head">
        <h2>Gov &amp; Opp colors</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <p className="muted">Saved in this browser. Your partner can pick different colors for the same flow.</p>
      <div className="flow-colors-opt" role="radiogroup" aria-label="Which colors the flow uses">
        <label>
          <input type="radio" name="flow-colors" checked={flowColors === 'flowist'} onChange={() => setFlowColors('flowist')} />
          Flowist: cyan and red
        </label>
        <label>
          <input type="radio" name="flow-colors" checked={flowColors === 'colorway'} onChange={() => setFlowColors('colorway')} />
          My colors: the pair picked below
        </label>
      </div>
      <ColorwayPicker />
      <label className="flow-theme-opt">
        <input type="checkbox" checked={flowTheme === 'night'} onChange={(e) => setFlowTheme(e.target.checked ? 'night' : 'app')} />
        Dark flow (a night-mode look for the flow, even in the light theme)
      </label>
      <div className="settings-foot">
        <span />
        <button type="button" className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}
