import { IDBFactory } from 'fake-indexeddb';
import { set } from 'idb-keyval';
import { createStore } from '../src/store/idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimDevice, getDeviceOwner, wipeLocalData } from '../src/store/device';
import { getProfile, setProfileName } from '../src/settings/profile';

// Local data (docs cached in the browser, versions, typing logs, pins, layout)
// belongs to one account. A different account signing in on the same device,
// or signing out, must not leave the last person's work behind.

const names = async () => (await indexedDB.databases()).map((d) => d.name).sort();

async function putDb(name: string) {
  await set('k', 'v', createStore(name, 'store'));
}

async function fillDevice() {
  await putDb('pp-meta');
  await putDb('pp-versions');
  await putDb('pp-typing-log');
  await putDb('pp-doc-abc');
  await putDb('pp-doc-def');
  await putDb('someone-elses-app'); // not ours: must be left alone
  for (const [k, v] of Object.entries({
    'pp-layout-v1': '{"panes":[]}',
    'pp-space-v1': 'team-1',
    'pp-round-mode': '1',
    'pp-timer-v1': '{}',
    'pp-pins-team-1': '[{"docId":"abc"}]',
    'pp-pins-personal': '[]',
    'pp-last-tournament': 'ABC123',
    'pp-seeded': '1',
    'pp-seeded-flow': '1',
    // preferences that are not private and should survive
    'pp-settings-v1': '{"theme":"dark"}',
    'pp-tour-seen': '1',
    'pp-width-sidebar': '300',
    'pp-pins-open': '1',
    'pp-timer-presets-v1': '[{"label":"Prep","minutes":25}]',
  })) localStorage.setItem(k, v);
  setProfileName('Alice');
}

beforeEach(() => {
  localStorage.clear();
  // A brand new browser database space each time (old connections can't hold up deletes).
  globalThis.indexedDB = new IDBFactory();
});

describe('who the data on this device belongs to', () => {
  it('the first person to sign in claims the device; nothing is deleted', async () => {
    await fillDevice();
    const reload = vi.fn();
    expect(await claimDevice('alice', { reload })).toBe('claimed');
    expect(getDeviceOwner()).toBe('alice');
    expect((await names()).filter((n) => n?.startsWith('pp-'))).toHaveLength(5);
    expect(localStorage.getItem('pp-layout-v1')).not.toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('the same person signing in again keeps everything', async () => {
    await fillDevice();
    await claimDevice('alice', { reload: vi.fn() });
    const reload = vi.fn();
    expect(await claimDevice('alice', { reload })).toBe('same');
    expect((await names()).filter((n) => n?.startsWith('pp-'))).toHaveLength(5);
    expect(reload).not.toHaveBeenCalled();
  });

  it('a different person signing in wipes the last person’s data and reloads', async () => {
    await fillDevice();
    await claimDevice('alice', { reload: vi.fn() });
    const reload = vi.fn();
    expect(await claimDevice('bob', { reload })).toBe('wiped');
    expect(await names()).toEqual(['someone-elses-app']);
    for (const k of ['pp-layout-v1', 'pp-space-v1', 'pp-round-mode', 'pp-timer-v1', 'pp-pins-team-1', 'pp-pins-personal', 'pp-last-tournament', 'pp-seeded', 'pp-seeded-flow']) {
      expect(localStorage.getItem(k), k).toBeNull();
    }
    expect(getDeviceOwner()).toBe('bob');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('keeps appearance and other preferences when wiping', async () => {
    await fillDevice();
    await claimDevice('alice', { reload: vi.fn() });
    await claimDevice('bob', { reload: vi.fn() });
    expect(localStorage.getItem('pp-settings-v1')).toBe('{"theme":"dark"}');
    expect(localStorage.getItem('pp-tour-seen')).toBe('1');
    expect(localStorage.getItem('pp-width-sidebar')).toBe('300');
    expect(localStorage.getItem('pp-pins-open')).toBe('1');
    expect(localStorage.getItem('pp-timer-presets-v1')).toContain('25');
  });

  it('forgets the last person’s name but keeps this browser’s id', async () => {
    await fillDevice();
    const id = getProfile().deviceId;
    await wipeLocalData();
    expect(getProfile().name).toBe('');
    expect(getProfile().deviceId).toBe(id);
  });

  it('being signed out changes nothing by itself (the app hides the docs instead)', async () => {
    await fillDevice();
    await claimDevice('alice', { reload: vi.fn() });
    expect(await claimDevice(null, { reload: vi.fn() })).toBe('signed-out');
    expect(getDeviceOwner()).toBe('alice');
    expect((await names()).filter((n) => n?.startsWith('pp-'))).toHaveLength(5);
  });

  it('wiping removes the owner mark, so the next person to sign in claims a clean device', async () => {
    await fillDevice();
    await claimDevice('alice', { reload: vi.fn() });
    await wipeLocalData();
    expect(getDeviceOwner()).toBeNull();
    expect(await claimDevice('bob', { reload: vi.fn() })).toBe('claimed');
  });
});
