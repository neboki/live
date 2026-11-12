// The free sessions running now, in memory. The function runs on a single instance
// (maxInstances 1), so this map sees every request; a restart forgets them, and the app
// then asks for a new session. What each account has used lives in Firestore (usage.ts).

export interface GrantLimits {
  /** How long a session's key is honoured after its last check-in, in seconds */
  graceSeconds: number;
  /** Text requests a session may make between two check-ins */
  callsPerTick: number;
}

interface Grant {
  uid: string;
  expiresAt: number;
  calls: number;
}

export interface Grants {
  /** Remembers the key a session was given and whose it is */
  issue: (key: string, uid: string, now: number) => void;
  /** A check-in: keeps the session going; resolves with its account, or null when unknown */
  renew: (key: string, now: number) => string | null;
  /** Counts one text request on this key; false when the key is unknown, expired or spent */
  spend: (key: string, now: number) => boolean;
  /** Ends a session: its key is no longer honoured */
  revoke: (key: string) => void;
}

export function createGrants(limits: GrantLimits): Grants {
  const grants = new Map<string, Grant>();
  const graceMs = limits.graceSeconds * 1000;

  /** Expired keys are dropped as they are met */
  function live(key: string, now: number): Grant | null {
    for (const [k, grant] of grants) if (grant.expiresAt <= now) grants.delete(k);
    return grants.get(key) ?? null;
  }

  return {
    issue: (key, uid, now) => {
      grants.set(key, { uid, expiresAt: now + graceMs, calls: 0 });
    },
    renew: (key, now) => {
      const grant = live(key, now);
      if (!grant) return null;
      grant.expiresAt = now + graceMs;
      grant.calls = 0;
      return grant.uid;
    },
    spend: (key, now) => {
      const grant = live(key, now);
      if (!grant || grant.calls >= limits.callsPerTick) return false;
      grant.calls++;
      return true;
    },
    revoke: (key) => {
      grants.delete(key);
    },
  };
}
