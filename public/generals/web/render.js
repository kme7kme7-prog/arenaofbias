// Shared miniature art for the live board and the isolated teaching scenes.
const rgba=(color,alpha)=>{const v=color.replace('#','');return `rgba(${parseInt(v.slice(0,2),16)},${parseInt(v.slice(2,4),16)},${parseInt(v.slice(4,6),16)},${alpha})`;};
function polygon(c,points,fill){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();}
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h);}
function round(c,x,y,w,h,r,color){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();}

export function terrainKind(frame,i,visible=null){
  if(visible&&!visible[i])return frame.owners[i]===-2||frame.cities[i]?'unknown-structure':'fog';
  if(frame.owners[i]===-2)return 'mountain';
  return frame.generals[i]?'general':frame.cities[i]?'city':'plain';
}
export function fieldVisibility(frame,player,cols,rows=cols){
  const vis=new Uint8Array(cols*rows);
  frame.owners.forEach((p,i)=>{if(p!==player)return;const r=Math.floor(i/cols),c=i%cols;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<rows&&nc>=0&&nc<cols)vis[nr*cols+nc]=1;}});
  return vis;
}

function mountain(c,variant,ink){
  c.fillStyle=ink?'#101d1866':'#35453620';c.beginPath();c.ellipse(.55,.77,.39,.13,-.15,0,Math.PI*2);c.fill();
  const shift=(variant%3-1)*.045;
  polygon(c,[[.08,.76],[.3,.34],[.49,.76]],ink?'#596c61':'#a0ac96');
  polygon(c,[[.3,.34],[.37,.62],[.49,.76],[.28,.76]],ink?'#33493f':'#738a74');
  polygon(c,[[.27,.78],[.53+shift,.12],[.91,.78]],ink?'#789080':'#c0c7ac');
  polygon(c,[[.53+shift,.12],[.6,.59],[.91,.78],[.55,.78]],ink?'#3d5849':'#859780');
  polygon(c,[[.53+shift,.12],[.63,.32],[.55,.29],[.47,.34]],ink?'#a6b7a2':'#ece9d7');
  polygon(c,[[.11,.78],[.27,.64],[.36,.81]],ink?'#4b6456':'#a3b096');
  rect(c,.71,.81,.11,.026,ink?'#72806c':'#c4cbb4');
}

function tower(c,x,y,color,ink){
  rect(c,x+.025,y+.04,.21,.27,ink?'#485b4c':'#aaae91');
  rect(c,x,y,.15,.27,ink?'#a7b59b':'#e5dfbd');
  rect(c,x+.15,y,.075,.27,ink?'#6b8069':'#b7b99c');
  polygon(c,[[x-.035,y+.015],[x+.11,y-.13],[x+.255,y+.015]],color);
  polygon(c,[[x+.11,y-.13],[x+.255,y+.015],[x+.12,y+.015]],ink?'#5f5142':'#866f50');
  rect(c,x+.055,y+.11,.036,.065,ink?'#314539':'#5b6c58');
}

function fortress(c,color,ink,isGeneral){
  const roof=isGeneral?color:ink?'#b7a27d':'#a7966c';
  c.fillStyle=ink?'#07191177':'#4b51342a';c.beginPath();c.ellipse(.53,.71,.41,.14,.05,0,Math.PI*2);c.fill();
  polygon(c,[[.12,.37],[.72,.37],[.89,.55],[.89,.72],[.27,.72],[.12,.59]],ink?'#536b54':'#b4b99b');
  rect(c,.19,.41,.58,.26,ink?'#92a58b':'#d9d6b4');
  rect(c,.25,.51,.46,.15,ink?'#788f72':'#c4c5a5');
  for(let i=0;i<4;i++)rect(c,.27+i*.11,.47,.065,.07,ink?'#c0c9b1':'#f0ead2');
  if(isGeneral){
    rect(c,.36,.24,.3,.31,ink?'#d0d2b7':'#ece4c5');
    rect(c,.58,.24,.08,.31,ink?'#8c9d81':'#c5c5a2');
    polygon(c,[[.3,.27],[.49,.11],[.72,.27]],roof);
    rect(c,.46,.37,.075,.13,ink?'#374b3a':'#64725a');
    rect(c,.48,.025,.022,.2,ink?'#d7dfc8':'#53614e');
    polygon(c,[[.5,.027],[.77,.077],[.5,.13]],color);
    rect(c,.5,.027,.02,.104,ink?'#f1e3b5':'#fff1c6');
  }
  tower(c,.12,.35,roof,ink);tower(c,.66,.35,roof,ink);
  round(c,.43,.49,.13,.18,.065,ink?'#3b4e3d':'#78836a');
  rect(c,.37,.68,.26,.035,ink?'#b1bda1':'#e0dcc2');
}

function armyBadge(c,army,cell,owner,color,building,ink){
  const text=army>999?`${Math.round(army/100)/10}k`:String(army);
  const font=Math.max(11,Math.min(22,cell*(building ? .38 : .46)));
  c.font=`700 ${font}px 'Segoe UI',Arial,sans-serif`;c.textAlign='center';c.textBaseline='middle';
  const width=Math.max(font+7,c.measureText(text).width+8),height=font+4;
  const x=cell/2,y=cell*(building === 'moving' ? .79 : building ? .77 : .52);
  if(building){round(c,x-width/2,y-height/2,width,height,Math.min(3,cell*.07),ink?'#172b24e8':'#f8f5e7ed');c.strokeStyle=owner>=0?rgba(color,.6):ink?'#8e9d7744':'#8d917144';c.lineWidth=.7;c.stroke();}
  c.fillStyle=building?(ink?'#f3eed7':'#354b3e'):(ink?'#f6f0df':'#263f34');
  c.fillText(text,x,y+.5);
}

export function drawBoard(c,{frame,cols,rows=cols,width,height=width,colors=['#b96950','#568999','#b49a50','#847b9d'],ink=false,visible=null,selected=-1,queue=[],previous=null,flash=0,arrow=null}){
  const cell=Math.min(width/cols,height/rows);c.clearRect(0,0,width,height);
  for(let i=0;i<frame.owners.length;i++){
    const r=Math.floor(i/cols),col=i%cols,x=col*cell,y=r*cell,owner=frame.owners[i],kind=terrainKind(frame,i,visible),hidden=kind==='fog'||kind==='unknown-structure';
    c.save();c.translate(x,y);
    rect(c,0,0,cell,cell,ink?((r+col)%2?'#34483c':'#374c3f'):((r+col)%2?'#e6e6d2':'#eae9d7'));
    if(hidden){
      rect(c,0,0,cell,cell,ink?'#26392f':'#bfc8b3');
      c.strokeStyle=ink?'#93a58c0b':'#eef0de26';c.lineWidth=.7;c.strokeRect(.4,.4,cell-.8,cell-.8);
      // Do not draw the real mountain/city silhouette through fog.
      if(kind==='unknown-structure'){c.scale(cell,cell);polygon(c,[[.34,.46],[.5,.36],[.66,.46],[.5,.57]],ink?'#71836b':'#8f9e83');polygon(c,[[.34,.46],[.5,.57],[.5,.67],[.34,.56]],ink?'#4a6050':'#a1af93');polygon(c,[[.5,.57],[.66,.46],[.66,.56],[.5,.67]],ink?'#3e5445':'#7d9175');}
      c.restore();continue;
    }
    if(owner>=0){
      const color=colors[owner];rect(c,0,0,cell,cell,rgba(color,ink?.53:.34));
      // Territory edges stay continuous across adjacent cells.
      c.strokeStyle=rgba(color,.76);c.lineWidth=Math.max(1,cell*.032);c.beginPath();
      if(r===0||frame.owners[i-cols]!==owner){c.moveTo(0,.6);c.lineTo(cell,.6);}
      if(col===0||frame.owners[i-1]!==owner){c.moveTo(.6,0);c.lineTo(.6,cell);}
      if(r===rows-1||frame.owners[i+cols]!==owner){c.moveTo(0,cell-.6);c.lineTo(cell,cell-.6);}
      if(col===cols-1||frame.owners[i+1]!==owner){c.moveTo(cell-.6,0);c.lineTo(cell-.6,cell);}c.stroke();
    }
    c.strokeStyle=ink?'#dbe2c507':'#7c8e6312';c.lineWidth=.65;c.strokeRect(.35,.35,cell-.7,cell-.7);
    if(kind==='plain'&&owner<0&&cell>25&&(i*7+3)%5===0){
      c.strokeStyle=ink?'#8d9b7329':'#7f96652e';c.lineWidth=.75;c.beginPath();c.moveTo(cell*.27,cell*.72);c.lineTo(cell*.24,cell*.64);c.moveTo(cell*.27,cell*.72);c.lineTo(cell*.31,cell*.63);c.stroke();
    }
    if(flash>0&&previous?.owners.length===frame.owners.length&&previous.owners[i]!==owner)rect(c,0,0,cell,cell,`rgba(255,235,172,${flash*.48})`);
    if(kind==='mountain'){c.save();c.scale(cell,cell);mountain(c,i,ink);c.restore();}
    if(kind==='city'||kind==='general'){c.save();c.scale(cell,cell);fortress(c,owner>=0?colors[owner]:ink?'#bfaa7a':'#b39d72',ink,kind==='general');c.restore();}
    if(kind!=='mountain'&&(frame.armies[i]>0||owner>=0))armyBadge(c,frame.armies[i],cell,owner,colors[owner],arrow&&(i===arrow.from||i===arrow.to)?'moving':kind==='city'||kind==='general',ink);
    c.restore();
  }
  if(selected>=0){const x=selected%cols*cell,y=Math.floor(selected/cols)*cell;c.strokeStyle=ink?'#f0dca0':'#344c3b';c.lineWidth=2;c.strokeRect(x+2,y+2,cell-4,cell-4);for(const[dx,dy]of[[0,0],[1,0],[0,1],[1,1]]){c.fillStyle=ink?'#f0dca0':'#344c3b';c.fillRect(x+dx*(cell-5),y+dy*(cell-5),5,5);}}
  if(queue.length){c.strokeStyle=ink?'#f0dca0':'#375341';c.lineWidth=1.8;c.setLineDash([4,3]);for(const[r,col,d]of queue){const[dr,dc]=[[-1,0],[1,0],[0,-1],[0,1]][d];c.beginPath();c.moveTo((col+.5)*cell,(r+.5)*cell);c.lineTo((col+dc+.5)*cell,(r+dr+.5)*cell);c.stroke();}c.setLineDash([]);}
  if(arrow){
    const{from,to,progress=1}=arrow,sx=(from%cols+.5)*cell,sy=(Math.floor(from/cols)+.5)*cell,ex=(to%cols+.5)*cell,ey=(Math.floor(to/cols)+.5)*cell;
    c.strokeStyle=ink?'#f6df9d':'#a8583d';c.fillStyle=c.strokeStyle;c.lineWidth=2.4;c.beginPath();c.moveTo(sx,sy);c.lineTo(ex,ey);c.stroke();
    const a=Math.atan2(ey-sy,ex-sx);c.save();c.translate(ex,ey);c.rotate(a);polygon(c,[[-8,-4],[0,0],[-8,4]],c.fillStyle);c.restore();
    c.beginPath();c.arc(sx+(ex-sx)*progress,sy+(ey-sy)*progress,Math.max(3,cell*.065),0,Math.PI*2);c.fill();
  }
}
