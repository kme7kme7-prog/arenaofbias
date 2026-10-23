/** Accept platform public HTML transports, preserving the fixed-host opaque shell.
 * Private capability paths and direct /c/ documents are not public entry points.
 * @param {unknown} source
 * @returns {URL | null}
 */
export function publicWorkURL(source) {
  if (typeof source !== 'string') return null;
  let url;
  try { url = new URL(source); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const legacy = /^[wpc][0-9a-f]{32}\.w\.arenaofbias\.icu$/.test(url.hostname);
  const shell = url.hostname === 'w.arenaofbias.icu' && /^\/v\/[wc][0-9a-f]{32}\/$/.test(url.pathname);
  return legacy || shell ? url : null;
}
