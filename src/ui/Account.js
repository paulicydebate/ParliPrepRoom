import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { toast } from '../editor/roundGuard';
import { PERSONAL, createTeam, deleteAccount, resetInvite, devSignInUrl, renameTeam, setSpace, signInUrl, signOut, teamDetails, updateMember, useAccount, } from '../store/account';
import { CoachView } from './CoachView';
import { TournamentsDialog } from './Rounds';
import { IconClose } from './icons';
/** Top bar: sign in, or switch team and open team settings. */
export function AccountBar({ onOpenDoc }) {
    const acct = useAccount();
    const [teamOpen, setTeamOpen] = useState(false);
    const [newTeamOpen, setNewTeamOpen] = useState(false);
    const [coachOpen, setCoachOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [tournamentsOpen, setTournamentsOpen] = useState(false);
    const [devName, setDevName] = useState('');
    if (!acct.loaded || !acct.server)
        return null;
    if (!acct.user) {
        if (acct.signIn.google) {
            return (_jsx("a", { className: "btn primary", href: signInUrl(), children: "Sign in with Google" }));
        }
        if (acct.signIn.dev) {
            return (_jsxs("form", { className: "dev-signin", onSubmit: (e) => {
                    e.preventDefault();
                    if (devName.trim())
                        location.href = devSignInUrl(devName.trim());
                }, children: [_jsx("input", { value: devName, onChange: (e) => setDevName(e.target.value), placeholder: "Test name", "aria-label": "Test sign-in name" }), _jsx("button", { className: "btn", type: "submit", children: "Test sign-in" })] }));
        }
        return (_jsx("span", { className: "muted small", title: "The server owner still has to add the Google sign-in key", children: "Sign-in coming soon" }));
    }
    const team = acct.teams.find((t) => t.id === acct.space) ?? null;
    return (_jsxs("div", { className: "account-bar", children: [_jsxs("label", { className: "space-select", title: "Which team's docs to show", children: [_jsx("span", { className: "sr-only", children: "Team" }), _jsxs("select", { value: acct.space, onChange: (e) => {
                            if (e.target.value === '__new')
                                setNewTeamOpen(true);
                            else
                                setSpace(e.target.value);
                        }, children: [acct.teams.map((t) => (_jsxs("option", { value: t.id, children: [t.name, t.role === 'coach' ? ' (coach)' : ''] }, t.id))), _jsx("option", { value: PERSONAL, children: "My own docs" }), _jsx("option", { value: "__new", children: "+ New team\u2026" })] })] }), team?.role === 'coach' && (_jsx("button", { type: "button", className: "btn ghost small", onClick: () => setCoachOpen(true), title: "Every round doc on the team and anything flagged", children: "Coach view" })), team && (_jsx("button", { type: "button", className: "btn ghost small", onClick: () => setTeamOpen(true), children: "Team" })), _jsxs("details", { className: "account-menu", children: [_jsx("summary", { className: "avatar", title: `${acct.user.name} (${acct.user.email})`, "aria-label": "Account", children: acct.user.picture ? _jsx("img", { src: acct.user.picture, alt: "", referrerPolicy: "no-referrer" }) : initials(acct.user.name) }), _jsxs("div", { className: "menu", children: [_jsxs("div", { className: "menu-head", children: [_jsx("strong", { children: acct.user.name }), _jsx("span", { className: "muted", children: acct.user.email })] }), _jsx("button", { type: "button", onClick: () => setNewTeamOpen(true), children: "New team\u2026" }), _jsx("button", { type: "button", onClick: () => setTournamentsOpen(true), children: "Tournaments (tab room)\u2026" }), _jsx("button", { type: "button", onClick: () => void signOut(), children: "Sign out" }), _jsx("button", { type: "button", className: "danger", onClick: () => setDeleteOpen(true), children: "Delete my account\u2026" })] })] }), teamOpen && team && _jsx(TeamDialog, { teamId: team.id, onClose: () => setTeamOpen(false) }), newTeamOpen && _jsx(NewTeamDialog, { onClose: () => setNewTeamOpen(false) }), deleteOpen && _jsx(DeleteAccountDialog, { onClose: () => setDeleteOpen(false) }), tournamentsOpen && _jsx(TournamentsDialog, { onClose: () => setTournamentsOpen(false) }), coachOpen && team && _jsx(CoachView, { teamId: team.id, teamName: team.name, onOpenDoc: onOpenDoc, onClose: () => setCoachOpen(false) })] }));
}
function initials(name) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('');
}
function useModal(onClose) {
    const ref = useRef(null);
    useEffect(() => {
        const d = ref.current;
        if (d && !d.open)
            d.showModal();
    }, []);
    return { ref, onClose, onCancel: onClose };
}
function NewTeamDialog({ onClose }) {
    const modal = useModal(onClose);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    return (_jsx("dialog", { ...modal, className: "settings", children: _jsxs("form", { onSubmit: async (e) => {
                e.preventDefault();
                if (!name.trim())
                    return;
                setBusy(true);
                try {
                    await createTeam(name.trim());
                    toast('Team created. Open Team to copy invite links.');
                    onClose();
                }
                catch (err) {
                    toast(err.message);
                    setBusy(false);
                }
            }, children: [_jsxs("div", { className: "settings-head", children: [_jsx("h2", { children: "New team" }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": "Close", onClick: onClose, children: _jsx(IconClose, {}) })] }), _jsx("p", { className: "muted", children: "You'll be the team's coach. Then share the student invite link with your debaters." }), _jsx("input", { id: "pp-team-name", className: "name-input", autoFocus: true, value: name, onChange: (e) => setName(e.target.value), placeholder: "Team name, e.g. Riverside Parli", "aria-label": "Team name" }), _jsxs("div", { className: "settings-foot", children: [_jsx("button", { type: "button", className: "btn ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { type: "submit", className: "btn primary", disabled: !name.trim() || busy, children: "Create team" })] })] }) }));
}
function InviteRow({ label, hint, code, onReset }) {
    const link = `${location.origin}/#invite=${code}`;
    const [confirm, setConfirm] = useState(false);
    return (_jsxs("div", { className: "invite-row", children: [_jsxs("div", { children: [_jsx("strong", { children: label }), _jsx("div", { className: "muted small", children: hint }), _jsx("code", { className: "invite-link", children: link })] }), _jsx("button", { type: "button", className: "btn", onClick: async () => {
                    try {
                        await navigator.clipboard.writeText(link);
                        toast('Invite link copied.');
                    }
                    catch {
                        toast('Copy the link from the box.');
                    }
                }, children: "Copy" }), _jsx("button", { type: "button", className: 'btn ghost small' + (confirm ? ' danger-text' : ''), title: "Make a new link and turn this one off (for when a link got passed around)", onClick: async () => {
                    if (!confirm) {
                        setConfirm(true);
                        setTimeout(() => setConfirm(false), 4000);
                        return;
                    }
                    setConfirm(false);
                    await onReset();
                    toast(`New ${label.toLowerCase()} link made. The old one no longer works.`);
                }, children: confirm ? 'Turn off old link?' : 'New link' })] }));
}
/** Download every doc you can see in a space as Word files in a .zip. */
function DownloadAllButton({ space, name }) {
    const [progress, setProgress] = useState(null);
    return (_jsx("button", { type: "button", className: "btn", disabled: progress !== null, onClick: async () => {
            setProgress('Starting…');
            try {
                const { buildTeamZip } = await import('../export/teamZip');
                const { download, safeFilename } = await import('../export/runs');
                const zip = await buildTeamZip(space, name, (d, t) => setProgress(`${d} of ${t}…`));
                download(zip, `${safeFilename(name)} backup ${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
                toast('Backup downloaded.');
            }
            catch (e) {
                toast(e.message);
            }
            finally {
                setProgress(null);
            }
        }, children: progress ?? 'Download all docs (.zip)' }));
}
function DeleteAccountDialog({ onClose }) {
    const modal = useModal(onClose);
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    return (_jsxs("dialog", { ...modal, className: "settings", children: [_jsxs("div", { className: "settings-head", children: [_jsx("h2", { children: "Delete my account" }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": "Close", onClick: onClose, children: _jsx(IconClose, {}) })] }), _jsx("p", { children: "This permanently deletes:" }), _jsxs("ul", { children: [_jsx("li", { children: "your account and sign-in," }), _jsx("li", { children: "your docs under \u201CMy own docs\u201D, with their records," }), _jsx("li", { children: "teams where you're the only member, with their docs." })] }), _jsx("p", { className: "muted", children: "Docs you made inside a team you share stay with that team (your coach can delete them). If you're the only coach of a team with other members, make someone else a coach first. Download a backup first if you want one." }), _jsxs("label", { className: "row-inline", children: ["Type DELETE to confirm", _jsx("input", { className: "name-input", value: typed, onChange: (e) => setTyped(e.target.value), "aria-label": "Type DELETE to confirm" })] }), _jsxs("div", { className: "settings-foot", children: [_jsx("button", { type: "button", className: "btn ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { type: "button", className: "btn danger-fill", disabled: typed.trim() !== 'DELETE' || busy, onClick: async () => {
                            setBusy(true);
                            try {
                                await deleteAccount();
                                location.href = '/';
                            }
                            catch (e) {
                                toast(e.message);
                                setBusy(false);
                            }
                        }, children: "Delete my account" })] })] }));
}
export function TeamDialog({ teamId, onClose }) {
    const modal = useModal(onClose);
    const acct = useAccount();
    const [team, setTeam] = useState(null);
    const [error, setError] = useState(null);
    const load = () => teamDetails(teamId).then(setTeam, (e) => setError(e.message));
    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamId]);
    const coach = team?.role === 'coach';
    const change = async (userId, c) => {
        try {
            await updateMember(teamId, userId, c);
            await load();
        }
        catch (e) {
            toast(e.message);
        }
    };
    return (_jsxs("dialog", { ...modal, className: "settings team-dialog", children: [_jsxs("div", { className: "settings-head", children: [_jsx("h2", { children: team?.name ?? 'Team' }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": "Close", onClick: onClose, children: _jsx(IconClose, {}) })] }), error && _jsx("p", { className: "muted", children: error }), team && (_jsxs(_Fragment, { children: [coach && (_jsxs(_Fragment, { children: [_jsx("h3", { children: "Team name" }), _jsx("input", { className: "name-input", defaultValue: team.name, "aria-label": "Team name", onBlur: async (e) => {
                                    const v = e.target.value.trim();
                                    if (v && v !== team.name)
                                        setTeam(await renameTeam(teamId, v));
                                } }), _jsx("h3", { children: "Invite links" }), _jsx(InviteRow, { label: "Students", hint: "For debaters. They see team docs, their own round docs and ones they're added to.", code: team.invites.student, onReset: async () => {
                                    await resetInvite(teamId, 'student');
                                    await load();
                                } }), _jsx(InviteRow, { label: "Coaches", hint: "Coaches see every doc on the team, including round docs, and manage members.", code: team.invites.coach, onReset: async () => {
                                    await resetInvite(teamId, 'coach');
                                    await load();
                                } })] })), _jsxs("h3", { children: ["Members (", team.members.length, ")"] }), _jsx("ul", { className: "member-list", children: team.members.map((m) => (_jsxs("li", { children: [_jsxs("div", { children: [_jsx("strong", { children: m.name }), m.userId === acct.user?.id && _jsx("span", { className: "muted small", children: " (you)" }), _jsx("div", { className: "muted small", children: m.email })] }), coach ? (_jsxs("div", { className: "member-actions", children: [_jsxs("select", { value: m.role, "aria-label": `Role for ${m.name}`, onChange: (e) => void change(m.userId, { role: e.target.value }), children: [_jsx("option", { value: "student", children: "Student" }), _jsx("option", { value: "coach", children: "Coach" })] }), m.userId !== acct.user?.id && (_jsx("button", { type: "button", className: "btn ghost small danger-text", onClick: () => void change(m.userId, { remove: true }), children: "Remove" }))] })) : (_jsx("span", { className: "role-chip", children: m.role === 'coach' ? 'Coach' : 'Student' }))] }, m.userId))) }), !coach && _jsx("p", { className: "muted small", children: "Only coaches can invite people or change roles." }), _jsx("h3", { children: "Backup" }), _jsx("p", { className: "muted small", children: "Every doc you can see on this team, as Word files in one .zip." }), _jsx(DownloadAllButton, { space: teamId, name: team.name })] }))] }));
}
