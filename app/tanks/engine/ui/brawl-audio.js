// 只合成本地短音效，不加载素材，不在用户主动开启前创建音频上下文。
export function createBrawlAudio(){
 let context=null,enabled=false,lastShot=-1;
 async function toggle(){
  if(!context){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('浏览器不支持音效');context=new Audio();}
  enabled=!enabled;if(enabled)await context.resume();return enabled;
 }
 function tone(from,to,duration,volume,type='triangle'){
  if(!enabled||context?.state!=='running')return;
  const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime;
  oscillator.type=type;oscillator.frequency.setValueAtTime(from,now);oscillator.frequency.exponentialRampToValueAtTime(to,now+duration);
  gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);oscillator.connect(gain);gain.connect(context.destination);
  oscillator.start(now);oscillator.stop(now+duration+.01);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
 }
 function play(events){
  if(!enabled)return;
  if(events.some(e=>e.kind==='death'))tone(120,28,.22,.07,'sawtooth');
  else if(events.some(e=>e.kind==='armorHit'))tone(420,120,.08,.045,'square');
  else if(events.some(e=>e.kind==='fire')&&context.currentTime-lastShot>.08){lastShot=context.currentTime;tone(170,70,.055,.025,'triangle');}
  if(events.some(e=>e.kind==='repair'||e.kind==='rapid'))tone(420,840,.16,.04);
  if(events.some(e=>e.kind==='zone'))tone(220,180,.25,.045);
 }
 return {toggle,play};
}
