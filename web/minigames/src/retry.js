// Loads that fail are tried again. A server that runs as one instance
// can turn requests away for a few
// seconds (429 or 500) when many come at once. The
// page's own images, style and code are retried by the script in index.html.
export const DELAYS = [500, 1000, 2000, 4000, 8000, 8000]; // ms before each new try: ~24 s in all

// from the second try on the URL gets ?retry=n, so the browser can't answer
// from a failure it remembers (the server ignores the query)
export const attemptURL = (url, n) => (n ? url + (url.includes("?") ? "&" : "?") + "retry=" + n : url);

// load(n) for n = 0, 1, …, until it resolves or the tries run out
export async function retry(load, what) {
  for (let n = 0; ; n++) {
    try {
      return await load(n);
    } catch (err) {
      if (n >= DELAYS.length) throw err;
      console.warn(`${what}: ${err?.message || err}; trying again in ${DELAYS[n]} ms`);
      await new Promise((r) => setTimeout(r, DELAYS[n]));
    }
  }
}

// fetch, trying again after a network error or a 408, 429 or 5xx (a 404 is returned as it is)
export function fetchRetry(url, options) {
  return retry(async (n) => {
    const res = await fetch(attemptURL(url, n), options);
    if (res.status === 408 || res.status === 429 || res.status >= 500) throw new Error(`${res.status} ${res.statusText}`);
    return res;
  }, url);
}
