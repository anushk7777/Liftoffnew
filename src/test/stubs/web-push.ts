// A fake `web-push` for testing the Edge Functions in-process. Records every
// send, and can be told to fail a particular endpoint with a real web-push
// status code so the dead-subscription cleanup can be exercised.

export interface SentPush {
  endpoint: string;
  payload: Record<string, unknown>;
}

export const sent: SentPush[] = [];
/** endpoint -> statusCode to throw instead of delivering. */
export const failures = new Map<string, number>();
export let vapid: { subject: string; publicKey: string; privateKey: string } | null = null;

export function resetPush() {
  sent.length = 0;
  failures.clear();
  vapid = null;
}

const webpush = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string) {
    vapid = { subject, publicKey, privateKey };
  },
  async sendNotification(subscription: { endpoint?: string }, payload: string) {
    const endpoint = subscription?.endpoint ?? '';
    const status = failures.get(endpoint);
    if (status) {
      const err = new Error(`push failed ${status}`) as Error & { statusCode: number };
      err.statusCode = status;
      throw err;
    }
    sent.push({ endpoint, payload: JSON.parse(payload) });
  },
};

export default webpush;
