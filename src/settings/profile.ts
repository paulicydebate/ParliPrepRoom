import { useSyncExternalStore } from 'react';
import { createSignal } from '../store/emitter';

// Who is typing on this device. Until accounts exist (Phase 3) this is a name
// the student enters once, plus a random id for this browser so two people
// with the same name stay distinguishable in the log.

export interface Profile {
  name: string;
  deviceId: string;
}

const KEY = 'pp-profile-v1';
const changed = createSignal();

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      if (p.deviceId) return { name: p.name ?? '', deviceId: p.deviceId };
    }
  } catch {
    // ignore
  }
  const fresh = { name: '', deviceId: crypto.randomUUID().slice(0, 8) };
  save(fresh);
  return fresh;
}

function save(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private mode: the name lasts for this visit only.
  }
}

let current: Profile = load();

export function getProfile() {
  return current;
}

export function setProfileName(name: string) {
  current = { ...current, name: name.trim() };
  save(current);
  changed.emit();
}

export function useProfile(): Profile {
  return useSyncExternalStore(changed.subscribe, getProfile);
}
