import { useEffect, useRef, useState } from 'react';
import { setProfileName, useProfile } from '../settings/profile';

/** Asks once per device for the name that goes in typing logs. */
export function NameDialog() {
  const profile = useProfile();
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState('');
  const open = !profile.name;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="settings name-dialog" onCancel={(e) => e.preventDefault()}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) setProfileName(value);
        }}
      >
        <h2>Who's typing on this device?</h2>
        <p className="muted">
          Your name goes next to everything you type in round docs, so the typing log shows who wrote what. You can change it later in Appearance.
        </p>
        <input id="pp-name" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="First and last name" aria-label="Your name" />
        <div className="settings-foot">
          <span />
          <button type="submit" className="btn primary" disabled={!value.trim()}>
            Continue
          </button>
        </div>
      </form>
    </dialog>
  );
}
