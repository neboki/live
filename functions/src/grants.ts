// The demo's bookkeeping, in memory. The function runs on a single instance (maxInstances 1),
// so these maps see every request; a restart forgets them, which only ever lets a few more
// demos through. The OpenAI project's own monthly budget is the hard stop behind them.

export interface DemoLimits {
  /** Demos one client (IP address) may start per day */
  perClient: number;
  /** Demos everyone together may start per day */
  perDay: number;
  /** Text requests (translation, summary, suggestions) one demo may make */
  callsPerGrant: number;
  /** How long a demo's key is honoured by the proxy, in seconds */
  grantSeconds: number;
}

export type GrantRefusal = 'client' | 'day';

interface Grant {
  expiresAt: number;
  calls: number;
}

export interface Grants {
  /** Counts a new demo for this client, or says why it may not start one */
  admit: (client: string, now: number) => GrantRefusal | null;
  /** Remembers the key a demo was given, so the proxy honours it until it expires */
  issue: (key: string, now: number) => void;
  /** Counts one text request on this key; false when the key is unknown, expired or spent */
  spend: (key: string, now: number) => boolean;
}

function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function createGrants(limits: DemoLimits): Grants {
  let day = '';
  let started = 0;
  const perClient = new Map<string, number>();
  const grants = new Map<string, Grant>();

  /** A new day starts every count over; expired keys are dropped as they are met */
  function roll(now: number): void {
    const today = dayOf(now);
    if (today !== day) {
      day = today;
      started = 0;
      perClient.clear();
    }
    for (const [key, grant] of grants) if (grant.expiresAt <= now) grants.delete(key);
  }

  function admit(client: string, now: number): GrantRefusal | null {
    roll(now);
    if (started >= limits.perDay) return 'day';
    const count = perClient.get(client) ?? 0;
    if (count >= limits.perClient) return 'client';
    perClient.set(client, count + 1);
    started++;
    return null;
  }

  function issue(key: string, now: number): void {
    grants.set(key, { expiresAt: now + limits.grantSeconds * 1000, calls: 0 });
  }

  function spend(key: string, now: number): boolean {
    roll(now);
    const grant = grants.get(key);
    if (!grant || grant.calls >= limits.callsPerGrant) return false;
    grant.calls++;
    return true;
  }

  return { admit, issue, spend };
}
