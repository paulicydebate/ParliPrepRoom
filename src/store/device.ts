import { closeAllDocs } from './registry';
import { docsChanged, listDocs, resetDocsCache } from './docs';
import { setProfileName } from '../settings/profile';

// Whose work is stored on this device. Docs, versions, typing logs, pins and
// the window layout are cached in the browser. On a shared computer (school
// Chromebooks) the next person must not see the last person's work, so:
//  - the first account to sign in claims the device;
//  - a different account signing in wipes the last one's data first;
//  - signing out wipes it (see signOut in account.ts);
//  - signed out with someone's data still there (their session ended), the
//    app hides those docs until the same person signs back in.
// Appearance and other preferences are not private and are kept.

const OWNER_KEY = 'pp-data-owner';

/** Private things kept in localStorage (everything else with a pp- prefix is a preference). */
const PRIVATE_KEYS = ['pp-layout-v1', 'pp-space-v1', 'pp-round-mode', 'pp-timer-v1', 'pp-last-tournament', 'pp-seeded', 'pp-seeded-flow', OWNER_KEY];
const PRIVATE_PREFIXES = ['pp-pins-'];
/** A preference that happens to start with a private prefix. */
const KEEP = new Set(['pp-pins-open']);

export const getDeviceOwner = (): string | null => {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
};

const setDeviceOwner = (id: string) => {
  try {
    localStorage.setItem(OWNER_KEY, id);
  } catch {
    // ignore
  }
};

const deleteDb = (name: string) =>
  new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    // A blocked delete (a connection from this page is still open) finishes as soon as the page reloads.
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });

/** Delete everything private stored on this device (not appearance or other preferences). */
export async function wipeLocalData(): Promise<void> {
  const doomed = new Set(['pp-meta', 'pp-versions', 'pp-typing-log']);
  try {
    for (const d of await indexedDB.databases()) if (d.name?.startsWith('pp-')) doomed.add(d.name);
  } catch {
    // Browsers without databases(): fall back to the docs we know about.
    try {
      for (const d of await listDocs()) doomed.add(`pp-doc-${d.id}`);
    } catch {
      // ignore
    }
  }
  closeAllDocs();
  await Promise.all([...doomed].map(deleteDb));
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)!);
    for (const k of keys) {
      if (KEEP.has(k)) continue;
      if (PRIVATE_KEYS.includes(k) || PRIVATE_PREFIXES.some((p) => k.startsWith(p))) localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
  setProfileName('');
  resetDocsCache();
  docsChanged.emit();
}

export type DeviceClaim = 'claimed' | 'same' | 'wiped' | 'signed-out';

/**
 * Called once the server has said who is signed in. A different person than
 * the data's owner means the old data is wiped and the page reloads clean.
 */
export async function claimDevice(userId: string | null, deps: { reload: () => void } = { reload: () => location.reload() }): Promise<DeviceClaim> {
  if (!userId) return 'signed-out';
  const owner = getDeviceOwner();
  if (owner === userId) return 'same';
  // No owner on record: data from before this rule existed, or made signed out. The
  // first person to sign in takes it over (it is uploaded to their account).
  if (owner === null) {
    setDeviceOwner(userId);
    return 'claimed';
  }
  await wipeLocalData();
  setDeviceOwner(userId);
  deps.reload();
  return 'wiped';
}
