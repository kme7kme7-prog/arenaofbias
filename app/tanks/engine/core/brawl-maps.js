export const BRAWL_MAPS = [
  {id:'crossroads',name:'十字猎场',desc:'开阔中场、四侧掩体，交火容易引来第三辆车。'},
  {id:'islands',name:'四桥孤岛',desc:'宽桥连通四个方向，河道挡车不挡炮弹。'},
  {id:'ruins',name:'环形废墟',desc:'砖墙能拆，草丛能藏；缩圈会逐步挤掉外侧掩体。'},
];
export const BRAWL_SPAWNS = {
  A:{x:2,y:22,dir:0},B:{x:2,y:2,dir:1},C:{x:22,y:2,dir:2},D:{x:22,y:22,dir:3},
};
export function loadBrawlMap(id) {
  if(!BRAWL_MAPS.some(m=>m.id===id))throw new Error(`未知四人地图：${id}`);
  const map=Array.from({length:26},()=>Array(26).fill(0));
  function rect(x,y,w,h,t){
    for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++){
      let px=x+dx,py=y+dy;
      for(let r=0;r<4;r++){map[py][px]=t;[px,py]=[25-py,px];}
    }
  }
  rect(5,5,2,3,2);rect(3,9,3,2,4);rect(8,3,3,1,1);
  if(id==='crossroads'){rect(9,7,2,2,2);rect(7,12,2,2,1);}
  if(id==='islands'){
    rect(6,10,4,2,3);rect(10,6,2,4,3);
    rect(4,12,2,2,1);rect(8,8,2,2,4);
    // 四格宽的十字桥给 2×2 车身保留进入中央的完整通道。
    rect(11,0,4,26,0);
    rect(8,8,3,3,0);
  }
  if(id==='ruins'){
    rect(9,6,2,2,1);rect(3,12,3,2,2);rect(9,10,1,3,4);
  }
  return map;
}
export function freeBrawlCell(map,x,y){
  return x>=0&&y>=0&&x<=24&&y<=24&&[map[y][x],map[y][x+1],map[y+1][x],map[y+1][x+1]].every(t=>t===0||t===4);
}
