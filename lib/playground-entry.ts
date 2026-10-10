declare global {
  interface Window {
    PlaygroundEntry?: { navigate: (destination: string, back?: boolean) => void; ready: () => void; readonly active: boolean };
  }
}

export function playgroundNavigate(destination = '/playground.html', back = false) {
  if (window.PlaygroundEntry) window.PlaygroundEntry.navigate(destination, back);
  else window.location.assign(destination);
}

export function settlePlaygroundEntry() { window.PlaygroundEntry?.ready(); }
