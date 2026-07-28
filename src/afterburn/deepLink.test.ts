import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readCo2DeepLink, consumeCo2DeepLink, requestCo2DeepLink, CO2_PARAM } from './deepLink';

// A tapped notification reaches the app as a URL and nothing else. Two things
// have to hold or the tap goes nowhere useful: the intent must survive until the
// lazily-loaded Afterburn tree exists to act on it, and it must NOT survive into
// next Tuesday's refresh.

interface FakeWindow {
  location: { pathname: string; search: string; hash: string };
  history: { state: unknown; replaceState: (s: unknown, t: string, url: string) => void };
}

function fakeWindow(url: string): FakeWindow {
  const [path, rest = ''] = url.split('?');
  const [search, hash = ''] = rest.split('#');
  const w: FakeWindow = {
    location: { pathname: path, search: search ? `?${search}` : '', hash: hash ? `#${hash}` : '' },
    history: {
      state: { some: 'state' },
      replaceState(_s, _t, next) {
        const [p, r = ''] = String(next).split('?');
        const [s, h = ''] = r.split('#');
        w.location.pathname = p;
        w.location.search = s ? `?${s}` : '';
        w.location.hash = h ? `#${h}` : '';
      },
    },
  };
  (globalThis as unknown as { window: FakeWindow }).window = w;
  return w;
}

describe('CO2 deep link', () => {
  beforeEach(() => consumeCo2DeepLink()); // clear the latch between cases
  afterEach(() => {
    delete (globalThis as unknown as { window?: FakeWindow }).window;
  });

  it('recognises the URL the push sends', () => {
    fakeWindow(`/?${CO2_PARAM}=1`);
    expect(readCo2DeepLink()).toBe(true);
    expect(consumeCo2DeepLink()).toBe(true);
  });

  it('survives until whoever handles it turns up', () => {
    // The shell reads the URL on boot; the Afterburn tree is lazy and mounts
    // later. The intent has to still be there when it does.
    fakeWindow(`/?${CO2_PARAM}=1`);
    readCo2DeepLink();
    // …several renders later…
    expect(consumeCo2DeepLink()).toBe(true);
  });

  it('fires exactly once', () => {
    fakeWindow(`/?${CO2_PARAM}=1`);
    readCo2DeepLink();
    expect(consumeCo2DeepLink()).toBe(true);
    expect(consumeCo2DeepLink()).toBe(false);
  });

  it('works whichever side reads the URL first', () => {
    // The Afterburn tree calls readCo2DeepLink() itself before consuming, so a
    // mount that beats the shell still lands on the right tab.
    const w = fakeWindow(`/?${CO2_PARAM}=1`);
    readCo2DeepLink(); // Afterburn gets there first
    expect(readCo2DeepLink()).toBe(false); // the shell now finds nothing…
    expect(consumeCo2DeepLink()).toBe(true); // …but the latch is set
    expect(w.location.search).toBe('');
  });

  it('strips the flag so a refresh next week does not reopen the test', () => {
    const w = fakeWindow(`/?${CO2_PARAM}=1`);
    readCo2DeepLink();
    expect(w.location.search).toBe('');
    expect(w.location.pathname).toBe('/');
    // A second boot from the cleaned URL is inert.
    expect(readCo2DeepLink()).toBe(false);
  });

  it('keeps the rest of the URL intact', () => {
    const w = fakeWindow(`/settings?utm=x&${CO2_PARAM}=1&ref=y#section`);
    expect(readCo2DeepLink()).toBe(true);
    expect(w.location.pathname).toBe('/settings');
    expect(w.location.search).toBe('?utm=x&ref=y');
    expect(w.location.hash).toBe('#section');
  });

  it('preserves history state rather than blanking it', () => {
    const w = fakeWindow(`/?${CO2_PARAM}=1`);
    readCo2DeepLink();
    expect(w.history.state).toEqual({ some: 'state' });
  });

  it('ignores anything that is not the flag we send', () => {
    for (const url of ['/', '/?co2=0', '/?co2=', '/?co2=true', '/?other=1', '/?co2x=1']) {
      fakeWindow(url);
      expect(readCo2DeepLink(), url).toBe(false);
      expect(consumeCo2DeepLink(), url).toBe(false);
    }
  });

  it('carries an in-app request across a workspace switch', () => {
    // The banner can be showing in Focus, where the Afterburn tree is lazy and
    // unmounted. Dispatching an event there landed the tap on the Programs tab
    // — measured in a browser — because nothing was listening yet.
    requestCo2DeepLink();
    expect(consumeCo2DeepLink()).toBe(true);
    expect(consumeCo2DeepLink()).toBe(false);
  });

  it('an in-app request needs no URL at all', () => {
    delete (globalThis as unknown as { window?: FakeWindow }).window;
    requestCo2DeepLink();
    expect(consumeCo2DeepLink()).toBe(true);
  });

  it('does not throw when there is no window at all', () => {
    delete (globalThis as unknown as { window?: FakeWindow }).window;
    expect(() => readCo2DeepLink()).not.toThrow();
    expect(readCo2DeepLink()).toBe(false);
  });

  it('still reports the intent when the browser refuses replaceState', () => {
    const w = fakeWindow(`/?${CO2_PARAM}=1`);
    w.history.replaceState = () => {
      throw new Error('denied');
    };
    // The screen matters more than the address bar.
    expect(readCo2DeepLink()).toBe(true);
    expect(consumeCo2DeepLink()).toBe(true);
  });
});
