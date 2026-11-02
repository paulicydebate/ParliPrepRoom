import { useEffect, useState } from 'react';
import { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';
import { getProfile } from '../settings/profile';

// Live sync with the ParliPrepRoom server (Cloudflare). Only turns on when the
// page is served by that server (it answers /api/health with sync: true), so
// the claude.ai preview and plain `npm run dev` keep working offline-only.

let probe: Promise<boolean> | null = null;

export function syncAvailable(): Promise<boolean> {
  if (!probe) {
    probe = (async () => {
      if (typeof window === 'undefined' || typeof fetch === 'undefined') return false;
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if (!r.ok) return false;
        const body = (await r.json()) as { sync?: boolean };
        return body.sync === true;
      } catch {
        return false;
      }
    })();
  }
  return probe;
}

/** A stable color per person, for their cursor and name tag. */
export function colorFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 70% 45%)`;
}

export function connect(docId: string, doc: Y.Doc): WebsocketProvider {
  const who = getProfile();
  const base = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/sync`;
  const provider = new WebsocketProvider(base, docId, doc, {
    params: { name: who.name || 'Unnamed', device: who.deviceId },
  });
  provider.awareness.setLocalStateField('user', { name: who.name || 'Unnamed', color: colorFor(who.deviceId) });
  return provider;
}

export type SyncStatus = 'off' | 'connecting' | 'synced' | 'offline';

/** Connection state of a document, for the little indicator in the pane header. */
export function useSyncStatus(provider: WebsocketProvider | null): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(provider ? (provider.synced ? 'synced' : 'connecting') : 'off');
  useEffect(() => {
    if (!provider) {
      setStatus('off');
      return;
    }
    const update = () => setStatus(provider.wsconnected ? (provider.synced ? 'synced' : 'connecting') : provider.wsconnecting ? 'connecting' : 'offline');
    update();
    provider.on('status', update);
    provider.on('sync', update);
    return () => {
      provider.off('status', update);
      provider.off('sync', update);
    };
  }, [provider]);
  return status;
}
