// A scene owns one timeline. Starting another scene cancels every previous track.
export class SceneTimeline {
  revision = 0;
  tracks = new Set();
  pause() { for (const track of this.tracks) track.pause(); }
  seek(time) { for (const track of this.tracks) { track.pause(); track.currentTime = time; } }
  resume() { for (const track of this.tracks) track.play(); }
  cancel() {
    this.revision++;
    for (const track of this.tracks) track.cancel();
    this.tracks.clear();
    return this.revision;
  }
  async play(beats, revision, reduced = false) {
    if (revision !== this.revision) return false;
    const tracks = beats.filter(beat => beat.element).map(beat => {
      const track = beat.element.animate(beat.frames, {
        duration: reduced ? 1 : beat.duration,
        delay: reduced ? 0 : beat.at,
        easing: beat.easing || 'cubic-bezier(.22,.72,.2,1)',
        fill: 'both',
      });
      track.id = beat.name || '';
      this.tracks.add(track);
      return track;
    });
    await Promise.all(tracks.map(track => track.finished.catch(() => {})));
    if (revision !== this.revision) return false;
    for (const track of tracks) { track.cancel(); this.tracks.delete(track); }
    return true;
  }
}

export function acceptChoice(phase, side) {
  return phase === 'exploring' && ['a', 'b', 'tie'].includes(side);
}

// The sealed cover stays solid through the resisted pull, then lifts straight
// out of the stage. Large cartons never sweep across the adjacent work.
export const UNPACK_DURATION = 1560;
export function unpackBeats(entries) {
  return entries.flatMap((entry, index) => {
    const at = index * 140;
    const sign = index ? 1 : -1;
    const pose = y => 'translate3d(0%,'+y+'%,0)';
    return [
      { name: 'release-seal', element: entry.node.querySelector('.parcel-seal'), at, duration: 410, easing: 'linear',
        frames: [{transform:'translateZ(2px) rotateX(0deg)',opacity:1},
          {transform:'translateZ(4px) rotateX(18deg)',opacity:1,offset:.25,easing:'cubic-bezier(.5,0,.7,.4)'},
          {transform:'translate3d(0,-6px,22px) rotateX(132deg)',opacity:1,offset:.7},
          {transform:'translate3d('+sign*16+'px,-35px,35px) rotateX(169deg)',opacity:0}] },
      { name: 'release-top-tape', element: entry.node.querySelector('.carton-top-tape'), at:140+at, duration:300,
        frames:[{opacity:1,transform:'rotateX(0deg)'},{opacity:0,transform:'rotateX(-145deg)'}] },
      { name: 'remove-sleeve', element: entry.node.querySelector('.parcel'), at:200+at, duration:1220, easing:'linear',
        frames: [
          {transform:pose(0),opacity:1,easing:'cubic-bezier(.25,0,.6,1)'},
          {transform:pose(-1.4),opacity:1,offset:.12},
          {transform:pose(-.6),opacity:1,offset:.2,easing:'cubic-bezier(.55,.03,.62,.6)'},
          {transform:pose(-84),opacity:1,offset:.55,easing:'cubic-bezier(.25,.65,.55,1)'},
          {transform:pose(-133),opacity:1,offset:.85},
          {transform:pose(-154),opacity:0}
        ] },
      { name: 'release-contact', element: entry.node.querySelector('.parcel-contact'), at:200+at,duration:850,easing:'linear',
        frames:[{opacity:.85,transform:'translateY(0) scaleX(1)'},
          {opacity:.78,transform:'translateY(1px) scaleX(.98)',offset:.28},
          {opacity:.35,transform:'translateY(5px) scaleX(.77)',offset:.6},
          {opacity:0,transform:'translateY(9px) scaleX(.65)'}] },
      ...(entry.node.dataset?.presentation === 'window' ? [] : [{ name: 'glass-catchlight', element: entry.node.querySelector('.glass-soft-glint'), at:870+at, duration:350,
        frames:[{opacity:0,transform:'translateX(-6px)'},{opacity:.65,offset:.45},{opacity:.45,transform:'translateX(0)'}] }]),
      ...['.object-toolbar','.choose-button'].map((selector,i)=>({name:'place-label',element:entry.node.querySelector(selector),at:1050+at+i*50,duration:240,
        frames:[{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}]}))
    ];
  });
}

export function packBeats(entries) {
  return entries.flatMap((entry, index) => [
    {name:'cover-scene',element:entry.node.querySelector('.parcel'),at:index*80,duration:660,easing:'linear',
      frames:[{opacity:0,transform:'translate3d(0,-122%,0) rotate('+ (index ? 3 : -3) +'deg)'},
        {opacity:1,transform:'translate3d(0,-118%,0) rotate('+ (index ? 3 : -3) +'deg)',offset:.08,easing:'cubic-bezier(.45,.02,.75,.5)'},
        {opacity:1,transform:'translate3d(0,-7%,0) rotate(0deg)',offset:.69,easing:'cubic-bezier(.12,.7,.24,1)'},
        {opacity:1,transform:'translate3d(0,.6%,0) rotate(0deg)',offset:.87},
        {opacity:1,transform:'translate3d(0,0,0) rotate(0deg)'}]},
    {name:'restore-contact',element:entry.node.querySelector('.parcel-contact'),at:index*80,duration:660,
      frames:[{opacity:0,transform:'scaleX(.65)'},{opacity:0,offset:.5},{opacity:.8,transform:'scaleX(1)'}]},
    ...['.object-toolbar','.choose-button','.picked-sticker'].map(selector=>({name:'clear-label',element:entry.node.querySelector(selector),at:index*80,duration:210,
      frames:[{opacity:selector==='.picked-sticker'&&entry.node.dataset?.picked!=='true'?0:1},{opacity:0}]}))
  ]);
}
export const PACK_DURATION = 740;

export const ARRIVAL_DURATION = 880;
// The welcome lives on the departing paper, not above the live comparison.
// It clears before unpacking; later rounds only reuse the carton timeline.
export function arrivalBeats(_entries, surfaces, cover, title) {
  return [{ name: 'arrival-cover', element: cover, at: 0, duration: ARRIVAL_DURATION, easing: 'linear',
    frames: [{ opacity: 1 }, { opacity: 1, offset: .59, easing: 'ease-out' }, { opacity: 0 }] },
  { name: 'arrival-title', element: title, at: 0, duration: 740, easing: 'linear',
    frames: [{ opacity: 0, transform: 'translateY(9px)' },
      { opacity: 1, transform: 'translateY(0)', offset: .18 },
      { opacity: 1, transform: 'translateY(0)', offset: .62 },
      { opacity: 0, transform: 'translateY(-9px)' }] }, ...surfaces.map(element => ({
    name: 'arrival-shell', element, at: 520, duration: 360,
    frames: [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
  }))];
}

export function parcelLabelBeats(entries, opening) {
  return entries.map(entry => ({ name: opening ? 'attach-label' : 'remove-label',
    element: entry.node.querySelector('.parcel-card'), at: 0, duration: opening ? 180 : 130,
    frames: opening
      ? [{ opacity: 0, transform: 'translateZ(5px) translateY(4px) rotate(-1deg)' }, { opacity: 1, transform: 'translateZ(1px) rotate(-2deg)' }]
      : [{ opacity: 1, transform: 'translateZ(1px) rotate(-2deg)' }, { opacity: 0, transform: 'translateZ(7px) translateY(-8px) rotate(-4deg)' }],
  }));
}
