// 视角校准桥（2026-09-19）：服务端在吐作品 HTML 的那一刻注入，源文件不动。
// 桥把作品的 OrbitControls 实例登记到 window.__AOB__，后台预览据此「抓取当前
// 视角」存进作品元数据（content.camera）；竞技场加载同一作品时，服务端把保存
// 的视角随桥一起注入，桥在 controls 创建后套回好机位。
// 注入只在两种请求发生：作品存有视角（前台），或 ?aob=bridge（后台校准预览）
// ——未校准作品的响应字节与改造前完全一致。
//
// 两条钩子路径：
//  1. 全局 UMD（three.min.js + examples/js OrbitControls）：defineProperty 拦
//     window.THREE 赋值，再拦 THREE.OrbitControls 挂载，构造即登记。
//  2. importmap ESM（three / three/addons/ 指向 CDN 或作品自带的本地 three）：
//     改写 importmap 让 OrbitControls.js 经我们的包装模块转发。本地相对路径先
//     按作品文档 URL 解析成同源绝对路径再进虚拟路由；转发模块同时转发命名导出
//     与默认导出（lil-gui 只有默认导出，漏了作品会先崩）。

const VIRTUAL = '/works/__aob__';

// 注入到 <head> 顶部的桥运行时（classic script，先于作品一切脚本执行）
const BRIDGE_JS = `(function(){
var A=window.__AOB__={controls:[],three:null,saved:window.__AOB_SAVED__||null};
function wrap(Base){
  if(typeof Base!=='function'||Base.__aobWrapped)return Base;
  var W;
  try{W=class extends Base{constructor(){super(...arguments);try{A.register(this);}catch(e){}}};}
  catch(e){
    try{W=function(){Base.apply(this,arguments);try{A.register(this);}catch(e2){}};W.prototype=Base.prototype;}
    catch(e2){return Base;}
  }
  try{Object.defineProperty(W,'__aobWrapped',{value:true});}catch(e3){}
  return W;
}
A.wrap=wrap;
function setVec(v,a){if(v&&a&&a.length===3){v.x=a[0];v.y=a[1];v.z=a[2];}}
A.register=function(c){if(c&&c.object){A.controls.push(c);A.apply(c);}};
A.apply=function(c){
  var s=A.saved;if(!s||!c||!c.object)return;
  try{
    setVec(c.object.position,s.position);
    if(c.target)setVec(c.target,s.target);
    if(typeof c.update==='function')c.update();
  }catch(e){}
};
A.getState=function(){
  var c=A.controls[A.controls.length-1];if(!c||!c.object)return null;
  var p=c.object.position,t=c.target||{x:0,y:0,z:0};
  return {position:[p.x,p.y,p.z],target:[t.x,t.y,t.z]};
};
A.setState=function(s){A.saved=s;for(var i=0;i<A.controls.length;i++)A.apply(A.controls[i]);};
function applyAll(){for(var i=0;i<A.controls.length;i++)A.apply(A.controls[i]);}
if(A.saved)[50,150,400,900,1600].forEach(function(d){setTimeout(applyAll,d);});
var real;
try{
  Object.defineProperty(window,'THREE',{
    configurable:true,
    get:function(){return real;},
    set:function(v){
      real=v;A.three=v;
      try{
        var inner=v.OrbitControls,wrapped=wrap(inner);
        Object.defineProperty(v,'OrbitControls',{
          configurable:true,
          get:function(){return wrapped;},
          set:function(C){inner=C;wrapped=wrap(C);}
        });
      }catch(e){}
    }
  });
}catch(e){}
})();`;

/**
 * 转发模块：命名导出走 `export *`，默认导出走命名空间取 `.default`。
 * 必须两条都有——`export *` 按规范不含 default，而 lil-gui 这类 addon 只有
 * 默认导出，漏掉它作品会 `new GUI()` 炸在建相机之前（2026-09-19 claude-fable）。
 * 原模块没有默认导出时 `.default` 是 undefined，不会像 `export { default } from`
 * 那样在链接期直接报错。
 */
function forward(origUrl) {
  return `export * from ${JSON.stringify(origUrl)};
import * as __AOB_NS from ${JSON.stringify(origUrl)};
export default __AOB_NS.default;
`;
}

/** OrbitControls.js 的包装转发模块：本地显式导出盖掉 `export *` 里的同名项 */
function addonControlsShim(origUrl) {
  return `import { OrbitControls as __Base } from ${JSON.stringify(origUrl)};
${forward(origUrl)}const OrbitControls = window.__AOB__ ? window.__AOB__.wrap(__Base) : __Base;
export { OrbitControls };
`;
}

/** 非 OrbitControls 的 addon / three 主入口：原样转发（模块实例按 URL 去重） */
function passthroughShim(origUrl, exposeThree) {
  return `${forward(origUrl)}${exposeThree ? `import * as __T from ${JSON.stringify(origUrl)};\nif (window.__AOB__) window.__AOB__.three = __T;\n` : ''}`;
}

const IMPORTMAP_RE = /<script[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/i;

/**
 * importmap 的目标既可能是 CDN 绝对 URL，也可能是作品目录下的相对路径
 * （minimax-m3/qwen 的 `./vendor/jsm/`、ox-alpha 的 `./libs/addons/`）。
 * 相对值一律按作品文档 URL 解析成同源绝对路径再交给虚拟路由——只按原样
 * 塞进 ad/ 的话，路由认不出 `./vendor/jsm/` 会回 400，作品连相机模块都加载不了。
 */
function resolveTarget(docUrl, value) {
  if (/^https?:/i.test(value)) return value;
  try {
    return new URL(
      value,
      `http://work.local${docUrl || '/works/_/index.html'}`,
    ).pathname;
  } catch {
    return null;
  }
}

/** 指向虚拟路由：目录值保留前缀语义，文件值拆成 <目录>/<文件名> */
function virtualFor(abs) {
  if (abs.endsWith('/')) return `${VIRTUAL}/ad/${encodeURIComponent(abs)}/`;
  const slash = abs.lastIndexOf('/');
  return `${VIRTUAL}/ad/${encodeURIComponent(abs.slice(0, slash))}/${abs.slice(slash + 1)}`;
}

/**
 * 注入桥（+可选保存视角），并把 importmap 的 three / three/addons/ 指到
 * 虚拟转发路由。importmap 解析失败只跳过改写，桥照常注入。
 */
export function injectWorkBridge(html, savedCamera, docUrl) {
  const out = html.replace(IMPORTMAP_RE, (match, json) => {
    try {
      const map = JSON.parse(json);
      const imports = map && map.imports;
      if (!imports || typeof imports !== 'object') return match;
      let touched = false;
      // addons 前缀，以及把单个 OrbitControls.js 写死的精确键（hy4-preview）
      for (const key of Object.keys(imports)) {
        const isPrefix = key === 'three/addons/';
        const isExact = key.endsWith('/OrbitControls.js');
        if (!isPrefix && !isExact) continue;
        const value = imports[key];
        if (typeof value !== 'string') continue;
        const abs = resolveTarget(docUrl, value);
        // 只改两种目标：CDN 绝对 URL 与作品自己目录下的文件。别的形态（协议相对
        // URL、data:、跨源绝对路径…）虚拟路由转发不了，宁可不钩也不要把作品改坏
        if (!abs || (!/^https:\/\//i.test(abs) && !abs.startsWith('/works/')))
          continue;
        imports[key] = virtualFor(abs);
        touched = true;
      }
      if (typeof imports.three === 'string' && /^https?:/.test(imports.three)) {
        imports.three = `${VIRTUAL}/three.mjs?u=${encodeURIComponent(imports.three)}`;
        touched = true;
      }
      return touched
        ? `<script type="importmap">${JSON.stringify(map)}</script>`
        : match;
    } catch {
      return match;
    }
  });
  // 顺序要紧：__AOB_SAVED__ 必须在桥之前就位，桥初始化时直接读进 A.saved
  const scripts =
    (savedCamera
      ? `<script>window.__AOB_SAVED__=${JSON.stringify(savedCamera)}</script>`
      : '') + `<script>${BRIDGE_JS}</script>`;
  if (/<head[^>]*>/i.test(out))
    return out.replace(/<head[^>]*>/i, (m) => m + scripts);
  if (/<html[^>]*>/i.test(out))
    return out.replace(/<html[^>]*>/i, (m) => `${m}<head>${scripts}</head>`);
  return scripts + out;
}

export function bridgeVirtualPrefix() {
  return `${VIRTUAL}/`;
}

export { addonControlsShim, passthroughShim };

/** content.camera 校验：position/target 各三个有限数，正文明确不含其他键 */
export function validWorkCamera(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'position' || keys[1] !== 'target')
    return false;
  const vec = (v) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e7);
  return vec(value.position) && vec(value.target);
}
