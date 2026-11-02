import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { setProfileName, useProfile } from '../settings/profile';
/** Asks once per device for the name that goes in typing logs. */
export function NameDialog() {
    const profile = useProfile();
    const ref = useRef(null);
    const [value, setValue] = useState('');
    const open = !profile.name;
    useEffect(() => {
        const d = ref.current;
        if (!d)
            return;
        if (open && !d.open)
            d.showModal();
        if (!open && d.open)
            d.close();
    }, [open]);
    return (_jsx("dialog", { ref: ref, className: "settings name-dialog", onCancel: (e) => e.preventDefault(), children: _jsxs("form", { onSubmit: (e) => {
                e.preventDefault();
                if (value.trim())
                    setProfileName(value);
            }, children: [_jsx("h2", { children: "Who's typing on this device?" }), _jsx("p", { className: "muted", children: "Your name goes next to everything you type in round docs, so the typing log shows who wrote what. You can change it later in Appearance." }), _jsx("input", { id: "pp-name", autoFocus: true, value: value, onChange: (e) => setValue(e.target.value), placeholder: "First and last name", "aria-label": "Your name" }), _jsxs("div", { className: "settings-foot", children: [_jsx("span", {}), _jsx("button", { type: "submit", className: "btn primary", disabled: !value.trim(), children: "Continue" })] })] }) }));
}
