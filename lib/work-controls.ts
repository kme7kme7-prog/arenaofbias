// Presentation is chosen by the Arena caller, never persisted on the work.
export function withArenaControls(src: string, cleanPreview: boolean, sceneOnly = false) {
  try {
    const url = new URL(src);
    if (!/^[wpc][0-9a-f]{32}\.(w\.arenaofbias\.icu|localhost)$/.test(url.hostname)) return src;
    const flags = url.searchParams.getAll('aob');
    if (!cleanPreview && !flags.some(flag => flag === 'arena-fold' || flag === 'arena-scene')) return src;
    url.searchParams.delete('aob');
    for (const flag of flags) if (flag !== 'arena-fold' && flag !== 'arena-scene') url.searchParams.append('aob', flag);
    if (cleanPreview) url.searchParams.append('aob', 'arena-fold');
    if (cleanPreview && sceneOnly) url.searchParams.append('aob', 'arena-scene');
    return url.href;
  } catch { return src; }
}
