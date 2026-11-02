import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../editor/roundGuard';
import { teamDetails, useAccount } from '../store/account';
import { setDocPartners } from '../store/docs';
import { IconClose } from './icons';
/** "Partners" button on a team round doc: who besides the owner and coaches can open it. */
export function PartnersButton({ meta }) {
    const acct = useAccount();
    const [open, setOpen] = useState(false);
    const [members, setMembers] = useState(null);
    useEffect(() => {
        if (!open || !meta.teamId)
            return;
        void teamDetails(meta.teamId).then((t) => setMembers(t.members), () => setMembers([]));
    }, [open, meta.teamId]);
    // Show the tick right away; the server catches up in the background.
    const [partners, setPartners] = useState(meta.partners ?? []);
    useEffect(() => setPartners(meta.partners ?? []), [meta.partners]);
    if (!meta.teamId)
        return null;
    const canEdit = meta.ownerId === acct.user?.id || acct.teams.find((t) => t.id === meta.teamId)?.role === 'coach';
    return (_jsxs("details", { className: "partners-menu", open: open, onToggle: (e) => setOpen(e.currentTarget.open), children: [_jsxs("summary", { className: "btn ghost small", title: "Who can open this round doc", children: ["Partners", partners.length ? ` (${partners.length})` : ''] }), _jsxs("div", { className: "menu partners-pop", children: [_jsx("p", { className: "muted small", children: "Round docs open only to the owner, the partners checked here, and the team's coaches." }), !members && _jsx("p", { className: "muted small", children: "Loading team\u2026" }), members
                        ?.filter((m) => m.userId !== meta.ownerId && m.role === 'student')
                        .map((m) => (_jsxs("label", { className: "check-row", children: [_jsx("input", { type: "checkbox", disabled: !canEdit, checked: partners.includes(m.userId), onChange: (e) => {
                                    const next = e.target.checked ? [...partners, m.userId] : partners.filter((p) => p !== m.userId);
                                    setPartners(next);
                                    void setDocPartners(meta.id, next);
                                } }), m.name] }, m.userId))), members && members.filter((m) => m.userId !== meta.ownerId && m.role === 'student').length === 0 && (_jsx("p", { className: "muted small", children: "No other students on the team yet." })), !canEdit && _jsx("p", { className: "muted small", children: "Only the doc's owner or a coach can change this." })] })] }));
}
/** "Check link" button: a link and QR code an opponent or judge can open to check the typing record. */
export function CheckLinkButton({ meta }) {
    const [open, setOpen] = useState(false);
    if (!meta.checkToken)
        return null;
    return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "btn ghost small round-check", onClick: () => setOpen(true), title: "Show the check link and QR code for this round doc", children: "Check link" }), open && createPortal(_jsx(CheckDialog, { token: meta.checkToken, title: meta.title, onClose: () => setOpen(false) }), document.body)] }));
}
function CheckDialog({ token, title, onClose }) {
    const ref = useRef(null);
    useEffect(() => {
        const d = ref.current;
        if (d && !d.open)
            d.showModal();
    }, []);
    const link = `${location.origin}/check/${token}`;
    const svg = useMemo(() => {
        const qr = qrcode(0, 'M');
        qr.addData(link);
        qr.make();
        return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    }, [link]);
    return (_jsxs("dialog", { ref: ref, className: "settings check-dialog", onClose: onClose, onCancel: onClose, children: [_jsxs("div", { className: "settings-head", children: [_jsx("h2", { children: "Check this round doc" }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": "Close", onClick: onClose, children: _jsx(IconClose, {}) })] }), _jsxs("p", { className: "muted", children: ["An opponent, judge or coach can scan this to see who typed \u201C", title, "\u201D, when, and anything unusual. It shows the server's record, which the student can't edit. The prep itself stays private."] }), _jsx("div", { className: "qr", dangerouslySetInnerHTML: { __html: svg } }), _jsx("code", { className: "invite-link", children: link }), _jsxs("div", { className: "settings-foot", children: [_jsx("a", { className: "btn", href: link, target: "_blank", rel: "noreferrer", children: "Open check page" }), _jsx("button", { type: "button", className: "btn primary", onClick: async () => {
                            try {
                                await navigator.clipboard.writeText(link);
                                toast('Check link copied.');
                            }
                            catch {
                                toast('Copy the link from the box.');
                            }
                        }, children: "Copy link" })] })] }));
}
