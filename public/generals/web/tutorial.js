import {lessons,makeLessonScene} from './lessons.js';
import {drawBoard,fieldVisibility} from './render.js';
import {sampleLesson,instructions} from './lesson-motion.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(v,max));

export function createTutorial({beforeOpen,onClose}){
  const dialog=document.createElement('dialog');
  dialog.id='tutorial';dialog.className='tutorial';
  dialog.setAttribute('aria-labelledby','lesson-title');
  dialog.innerHTML=`<div class="tour-spot" aria-hidden="true"></div><article class="tour-card">
    <div class="tour-top"><span>将军入门 / FIELD GUIDE</span><button class="tour-close" aria-label="关闭教学">×</button></div>
    <div class="tour-chapters"><label for="lesson-chapter">这一课</label><select id="lesson-chapter" aria-label="跳转教学章节"></select><span id="lesson-count"></span></div>
    <div class="tour-content"><span class="tour-kicker"></span><h2 id="lesson-title"></h2><p class="tour-copy"></p>
      <figure class="lesson-demo"><div class="lesson-caption"><span>操作演示</span><b id="lesson-stage"></b></div><canvas id="lesson-board" role="img" aria-label="独立教学棋盘"></canvas><div class="lesson-input"><span id="lesson-input-label">点选起点</span><button id="lesson-key" aria-label="按 D 或向右键试一次"><kbd>D</kbd><span>或</span><kbd>→</kbd></button></div><figcaption id="lesson-result"></figcaption></figure>
      <ol class="lesson-checklist"></ol>
      <div class="lesson-options" role="group" aria-label="尝试不同情况"></div>
      <div class="lesson-controls"><button id="lesson-play">暂停演示</button><button id="lesson-step">下一帧 →</button><button id="lesson-restart" aria-label="重新播放本课演示">↻ 重播</button></div>
      <p class="tour-tip"></p>
    </div>
    <div class="tour-footer"><button id="lesson-prev">← 上一课</button><button id="lesson-next" class="primary">下一课 →</button></div>
    <div class="tour-progress" aria-hidden="true"><i></i></div>
  </article>`;
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector),card=$('.tour-card'),spot=$('.tour-spot'),content=$('.tour-content'),canvas=$('#lesson-board'),ctx=canvas.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let index=0,option=0,scene=null,stageIndex=0,manual=false,playing=false,elapsed=0,last=0,raf=0,closing=false,opening=false,returnFocus=null,scrollState=null,displayedStage=-1,lastPaint=0,keyUntil=0;
  const chapters=$('#lesson-chapter');
  lessons.forEach((lesson,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${String(i+1).padStart(2,'0')} · ${lesson.title.replace('。','')}`;chapters.append(o);});

  function resolveTarget(){
    const l=lessons[index];let target=document.querySelector(l.target);
    if(l.id==='replay')target=document.querySelector('#replay-controls:not([hidden])')||document.querySelector('#human-controls:not([hidden])')||target;
    if(!target||!target.getClientRects().length)target=document.querySelector('#board');
    return target;
  }
  function locate(scroll=false){
    if(!dialog.open||closing)return;
    const target=resolveTarget(),mobile=innerWidth<900;
    if(scroll&&mobile){const r=target.getBoundingClientRect();window.scrollBy({top:r.top-65,behavior:'instant'});}
    const r=target.getBoundingClientRect(),pad=8,vw=document.documentElement.clientWidth;
    let x=clamp(r.left-pad,8,vw-24),y=clamp(r.top-pad,8,innerHeight-24),w=Math.min(r.width+pad*2,vw-x-8),h=Math.min(r.height+pad*2,innerHeight-y-8);
    const cardWidth=mobile?Math.min(480,vw-24):vw<1550?390:430;
    card.style.width=cardWidth+'px';
    const ch=Math.min(card.getBoundingClientRect().height,innerHeight-24);
    let cx,cy;
    if(mobile){
      cx=(vw-cardWidth)/2;cy=innerHeight-ch-12;
      h=Math.max(16,Math.min(h,cy-y-12));
    }else{
      const spaceLeft=r.left,spaceRight=vw-r.right;
      cx=spaceRight>=cardWidth+32?r.right+24:spaceLeft>=cardWidth+32?r.left-cardWidth-24:spaceLeft>spaceRight?16:vw-cardWidth-16;
      cy=clamp(r.top+(r.height-ch)/2,16,innerHeight-ch-16);
      // On narrower screens keep the visible part of the real board lit beside the guide.
      if(cx<x+w&&cx+cardWidth>x&&cy<y+h&&cy+ch>y){
        if(cx>vw/2)w=Math.max(16,cx-x-16);
        else{const end=x+w;x=Math.max(x,cx+cardWidth+16);w=Math.max(16,end-x);}
      }
    }
    card.style.left=Math.round(cx)+'px';card.style.top=Math.round(cy)+'px';
    for(const [key,value]of Object.entries({left:x,top:y,width:w,height:h}))spot.style[key]=Math.round(value)+'px';
    dialog.dataset.mobile=String(mobile);
  }
  function updatePlay(){
    if(!scene)return;
    $('#lesson-play').textContent=playing?'暂停演示':'播放演示';
    const noMotion=scene.stages.length<2||lessons[index].scene==='queue';
    $('.lesson-controls').hidden=noMotion;
  }
  function resetScene(){
    scene=makeLessonScene(lessons[index].scene,option);stageIndex=0;manual=false;elapsed=0;last=performance.now();displayedStage=-1;
    playing=!reduced.matches&&scene.stages.length>1&&scene.kind!=='queue';updatePlay();paint(last);
  }
  function changeLesson(next,scroll=true){
    index=clamp(next,0,lessons.length-1);option=0;
    const lesson=lessons[index];dialog.dataset.lesson=lesson.id;
    $('.tour-kicker').textContent=lesson.kicker;$('#lesson-title').textContent=lesson.title;$('.tour-copy').textContent=lesson.body;$('.tour-tip').textContent=lesson.tip;
    $('#lesson-count').textContent=`${String(index+1).padStart(2,'0')} / ${lessons.length}`;chapters.value=index;
    const options=$('.lesson-options');options.replaceChildren();
    $('.lesson-checklist').replaceChildren(...instructions[lesson.id].map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    lesson.options.forEach((name,i)=>{const b=document.createElement('button');b.textContent=name;
      if(lesson.scene!=='queue')b.setAttribute('aria-pressed',i===0);
      b.onclick=()=>{
        if(lesson.scene==='queue'){if(i===1){stageIndex=0;manual=true;paint(performance.now());}else tryMove();return;}
        option=i;for(const [j,button]of [...options.children].entries())button.setAttribute('aria-pressed',i===j);resetScene();
      };options.append(b);
    });options.hidden=!lesson.options.length;
    $('#lesson-prev').disabled=index===0;$('#lesson-next').textContent=index===lessons.length-1?'准备好了 ✓':'下一课 →';
    $('.tour-progress i').style.width=`${(index+1)/lessons.length*100}%`;
    content.scrollTop=0;resetScene();locate(scroll);
    content.getAnimations().forEach(a=>a.cancel());
    if(!reduced.matches)content.animate([{opacity:0,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:480,delay:90,easing:'cubic-bezier(.2,.75,.2,1)',fill:'backwards'});
  }
  function paint(now){
    if(!scene)return;
    const bounds=canvas.getBoundingClientRect();if(!bounds.width)return;
    const width=bounds.width,height=width*3/5,dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const motion=sampleLesson(scene,elapsed,manual?stageIndex:null);
    stageIndex=motion.stage;
    const stage=scene.stages[stageIndex],ink=document.documentElement.dataset.theme==='ink';
    const visible=scene.kind==='fog'&&option===0?fieldVisibility(stage.frame,0,5,3):null;
    const moving=!!scene.arrow,showKeys=moving||scene.kind==='queue';
    $('.lesson-input').hidden=!showKeys;
    const phaseText={point:'① 点击自己的格子',select:'① 已选中起点',press:'② 按下向右键',move:'② 部队向右移动',result:'③ 查看兵力变化',observe:'按 D / → 走一步'};
    $('#lesson-input-label').textContent=scene.kind==='queue'?'按 D / → 走一步':phaseText[motion.phase];
    $('#lesson-key').classList.toggle('pressed',motion.pressed||now<keyUntil);
    $('#lesson-key').setAttribute('aria-label',motion.pressed?'D / 向右键已按下':'按 D 或向右键试一次');
    dialog.dataset.demoPhase=motion.phase;
    drawBoard(ctx,{frame:stage.frame,cols:5,rows:3,width,height,ink,visible,arrow:motion.arrow,selected:scene.kind==='queue'?5+stageIndex:moving&&motion.phase!=='point'?(stageIndex?scene.arrow.to:scene.arrow.from):-1});
    if(moving&&motion.phase==='point'){
      const x=(scene.arrow.from%5+.5)*width/5,y=(Math.floor(scene.arrow.from/5)+.5)*height/3;
      ctx.strokeStyle=ink?'#f6df9d':'#a8583d';ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(x,y,17+Math.sin(elapsed/180)*3,0,Math.PI*2);ctx.stroke();
    }
    if(scene.labels.length){ctx.font='12px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillStyle=ink?'#d5dcc3':'#65735b';for(const label of scene.labels)ctx.fillText(label.text,(label.cell%5+.5)*width/5,height-14);}
    const displayKey=`${stageIndex}:${motion.phase}`;
    if(displayedStage!==displayKey){
      let label=stage.label,detail=stage.detail;
      if(moving&&stageIndex===0){
        const sent=scene.stages[0].frame.armies[scene.arrow.from]-scene.stages[1].frame.armies[scene.arrow.from];
        const remaining=scene.stages[1].frame.armies[scene.arrow.from];
        if(motion.phase==='select'){label='起点已选中';detail='深色边框就是选中位置；按 D 或 → 试着向右出兵。';}
        if(motion.phase==='press'){label='收到向右指令';detail=`准备派出 ${sent} 兵，原地保留 ${remaining} 兵。`;}
        if(motion.phase==='move'){label=`${sent} 兵行进中`;detail=`到相邻格后结算，原地保留 ${remaining} 兵。`;}
      }
      $('#lesson-stage').textContent=label;$('#lesson-result').textContent=detail;canvas.setAttribute('aria-label',label+'。'+detail);displayedStage=displayKey;
    }
  }
  function tryMove(){
    if(!scene.arrow&&scene.kind!=='queue')return;
    const now=performance.now();keyUntil=now+500;
    if(scene.kind==='queue'){stageIndex=stageIndex===scene.stages.length-1?0:stageIndex+1;manual=true;playing=false;}
    else if(reduced.matches){manual=true;stageIndex=1;playing=false;}
    else{manual=false;elapsed=2400;playing=true;last=now;}
    updatePlay();paint(now);
  }
  function tick(now){
    if(!dialog.open||closing)return;
    if(playing&&!document.hidden)elapsed+=Math.max(0,now-last);last=now;
    if(now-lastPaint>32){paint(now);lastPaint=now;}
    raf=requestAnimationFrame(tick);
  }
  async function open(at=0){
    if(dialog.open||opening)return;opening=true;
    returnFocus=document.activeElement;
    scrollState={x:scrollX,y:scrollY,panels:[...document.querySelectorAll('.briefing,.roster-side')].map(el=>({el,top:el.scrollTop}))};
    try{await beforeOpen?.();}finally{opening=false;}
    if(document.querySelector('dialog[open]'))return;
    closing=false;dialog.classList.remove('closing');document.documentElement.classList.add('tour-open');dialog.showModal();changeLesson(at);last=performance.now();raf=requestAnimationFrame(tick);$('.tour-close').focus({preventScroll:true});
  }
  function close(){
    if(!dialog.open||closing)return;closing=true;playing=false;cancelAnimationFrame(raf);dialog.classList.add('closing');
    setTimeout(()=>{dialog.close();closing=false;dialog.classList.remove('closing');document.documentElement.classList.remove('tour-open');if(scrollState){window.scrollTo({left:scrollState.x,top:scrollState.y,behavior:'instant'});for(const p of scrollState.panels)p.el.scrollTop=p.top;}returnFocus?.focus({preventScroll:true});onClose?.();},reduced.matches?0:240);
  }
  $('.tour-close').onclick=close;$('#lesson-prev').onclick=()=>changeLesson(index-1);$('#lesson-next').onclick=()=>index===lessons.length-1?close():changeLesson(index+1);
  chapters.onchange=()=>changeLesson(Number(chapters.value));
  $('#lesson-play').onclick=()=>{if(manual){elapsed=scene.arrow?(stageIndex?4400+(stageIndex-1)*2800:0):stageIndex*2800;manual=false;}playing=!playing;last=performance.now();updatePlay();};
  $('#lesson-step').onclick=()=>{playing=false;manual=true;stageIndex=(stageIndex+1)%scene.stages.length;updatePlay();paint(performance.now());};
  $('#lesson-restart').onclick=resetScene;
  $('#lesson-key').onclick=tryMove;
  canvas.onclick=()=>{if(scene.arrow){manual=false;elapsed=1200;playing=!reduced.matches;last=performance.now();paint(last);updatePlay();}};
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>{
    if(/SELECT|INPUT|TEXTAREA/.test(event.target.tagName))return;
    if((event.key==='ArrowRight'||event.key.toLowerCase()==='d')&&!event.altKey){event.preventDefault();if(!event.repeat)tryMove();}
    if(event.altKey&&event.key==='ArrowRight'){event.preventDefault();if(index<lessons.length-1)changeLesson(index+1);}
    if(event.altKey&&event.key==='ArrowLeft'){event.preventDefault();changeLesson(index-1);}
  });
  window.addEventListener('resize',()=>locate(true));window.addEventListener('scroll',()=>locate(),{passive:true});
  document.addEventListener('visibilitychange',()=>{last=performance.now();});
  new ResizeObserver(()=>{if(dialog.open)locate();}).observe(card);
  reduced.addEventListener('change',()=>{if(reduced.matches){playing=false;updatePlay();}});
  return {open,close,get active(){return dialog.open;}};
}
