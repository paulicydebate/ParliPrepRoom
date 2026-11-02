import { useSyncExternalStore } from 'react';
import { createSignal } from '../store/emitter';
const KEY = 'pp-profile-v1';
const changed = createSignal();
function load() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            const p = JSON.parse(raw);
            if (p.deviceId)
                return { name: p.name ?? '', deviceId: p.deviceId };
        }
    }
    catch {
        // ignore
    }
    const fresh = { name: '', deviceId: crypto.randomUUID().slice(0, 8) };
    save(fresh);
    return fresh;
}
function save(p) {
    try {
        localStorage.setItem(KEY, JSON.stringify(p));
    }
    catch {
        // Private mode: the name lasts for this visit only.
    }
}
let current = load();
export function getProfile() {
    return current;
}
export function setProfileName(name) {
    current = { ...current, name: name.trim() };
    save(current);
    changed.emit();
}
export function useProfile() {
    return useSyncExternalStore(changed.subscribe, getProfile);
}
