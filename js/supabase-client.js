/* ── SUPABASE CLIENT SETUP ──
     Note: the CDN library itself creates a global object called "supabase".
     We must NOT name our client the same thing, or it breaks.
     So the client is called "sb" everywhere in this file. */
  const SUPABASE_URL = 'https://aerbvhslbdstmmrbvwvo.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_2eRbau2TGaiPJqpyHvYKlg_Lz99MP_Z';
  
  /* Some sandboxed/preview environments wrap window.fetch to mirror
     network activity via postMessage to a parent frame. That wrapper
     tries to structured-clone the Response (including its Headers
     object), which throws "DataCloneError: Headers object could not
     be cloned." This is an environment quirk, not a Supabase bug — it
     will not happen on normal web hosting. As a safe workaround we
     grab the most "native" fetch we can find and hand it to Supabase
     explicitly, bypassing the wrapper. If that still fails for any
     reason, we fall back to XMLHttpRequest so data loading keeps
     working either way. */
  function safeFetch(input, init) {
    const nativeFetch =
      (window.parent && window.parent !== window && window.parent.fetch) ||
      window.fetch;
    return nativeFetch(input, init).catch(err => {
      if (err && err.name === 'DataCloneError') {
        return xhrFetch(input, init);
      }
      throw err;
    });
  }

  function xhrFetch(input, init) {
    return new Promise((resolve, reject) => {
      try {
        const method = (init && init.method) || 'GET';
        const xhr = new XMLHttpRequest();
        xhr.open(method, typeof input === 'string' ? input : input.url, true);
        if (init && init.headers) {
          const h = init.headers instanceof Headers
            ? Object.fromEntries(init.headers.entries())
            : init.headers;
          Object.keys(h).forEach(k => xhr.setRequestHeader(k, h[k]));
        }
        xhr.onload = () => {
          resolve(new Response(xhr.response, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers: parseXhrHeaders(xhr.getAllResponseHeaders())
          }));
        };
        xhr.onerror = () => reject(new TypeError('Network request failed'));
        xhr.send(init && init.body ? init.body : null);
      } catch (e) { reject(e); }
    });
  }

  function parseXhrHeaders(raw) {
    const headers = new Headers();
    (raw || '').trim().split(/[\r\n]+/).forEach(line => {
      const idx = line.indexOf(':');
      if (idx > 0) headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
    });
    return headers;
  }

  let sb;
  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { fetch: safeFetch }
    });
  } catch(initErr) {
    console.error('Supabase init failed:', initErr);
  }
