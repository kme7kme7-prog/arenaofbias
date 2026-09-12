// 鹈鹕集取景补丁 v4（用户指令修正版）：
//   ①竞技场小预览框内：鹈鹕+自行车居中放大展示，允许裁掉离主体很远的文字；
//   ②点开放大预览 / 独立打开作品页 = 原始 HTML 原样展示，可滚动看全貌——
//     v3 把取景焊死在文件里导致放大视图也被裁，v4 改为参数驱动：
//     前端预览 iframe 的 src 带 ?aob=prev，作品内脚本据此加 html.aob-prev 类，
//     取景 CSS 全部挂在 .aob-prev 下；无参数时文件就是原始页面的样子；
//   ③标题/文案是作品的一部分——预览取景也不允许被场景盖掉：海报排版作品
//     保留标题区，场景在标题下方剩余区域内满幅居中；
//   ④大设置面板：预览模式整体隐藏（放大后看原始页面自然能看到）；
//     v3 的 ⚙ 把手随 height 媒体查询方案一并撤销；
//   ⑤动画主体左右跑的作品不管（取景对主体活动区），不修作品逻辑 bug。
// svg 的 viewBox/preserveAspectRatio 永久还原为原件值（ORIG 表，逐份比对
// 新建文件夹/tihu 原件得出），预览模式由脚本临时改写，不落盘。
// 幂等：每次运行先剥掉旧补丁再重打。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = 'data/works/001';

// 逐份配置：
//   vb        预览取景 viewBox（null = 原框已合适）
//   mode      fixed = 纯场景满屏（默认）｜ poster = 保留标题区，场景在剩余区域居中
//   extra     poster/容器型作品的逐份布局 CSS（选择器需自带 html.aob-prev 前缀）
//   panel     设置面板选择器（预览模式隐藏）
//   canvas    主体画在 canvas 位图上（CSS transform 取景）
//   orig      原件 svg 的 viewBox / preserveAspectRatio（还原用）
const CONFIG = {
  '001-deepseek-v4-pro-0813-high': {
    vb: '7 65 762 475',
    orig: { vb: '0 0 900 540', par: 'xMidYMid slice' },
  },
  '001-deepseek-v4.1-flash-expires-on-0910': {
    vb: '45 58 696 391',
    orig: { vb: '0 0 800 450' },
  },
  '001-deepseek-v4.1-flash-wb-high': {
    orig: { vb: '0 0 900 450' },
  },
  '001-gemini-3.5-flash-lite': {
    vb: '108 150 635 350',
    orig: { vb: '0 0 800 500' },
  },
  '001-gemini-3.8-flash-high': {
    orig: { vb: '0 0 1200 675' },
  },
  '001-glm-5.3': {
    orig: { vb: '0 0 800 500' },
  },
  '001-gpt-6-astra-1hhmw': {
    vb: '32 0 1125 712',
    orig: { vb: '0 0 1200 760', par: 'xMidYMid slice' },
  },
  '001-gpt-6-astra-low-0nd6u': {
    vb: '32 18 928 522',
    orig: { vb: '0 0 960 540' },
  },
  '001-gpt-6-astra-low-2': {
    vb: '0 120 1000 436',
    mode: 'poster',
    orig: { vb: '0 0 1000 590' },
    extra: `
html.aob-prev body{display:flex!important;align-items:stretch!important;place-items:unset!important}
html.aob-prev .poster{width:100%!important;height:100%!important;display:flex!important;flex-direction:column!important;padding:18px 0 12px!important}
html.aob-prev svg.aob-scene{position:static!important;inset:auto!important;flex:1 1 auto!important;width:100%!important;height:auto!important;min-height:0!important}`,
  },
  '001-gpt-6-astra-low': {
    vb: '50 0 893 625',
    orig: { vb: '0 0 1000 700', par: 'xMidYMid slice' },
  },
  '001-gpt-6-astra-medium-2': {
    vb: '0 0 1100 650',
    mode: 'poster',
    orig: { vb: '0 0 1100 650' },
    extra: `
html.aob-prev body{padding:14px 16px!important;height:100%!important;display:flex!important;place-items:stretch!important;align-items:stretch!important}
html.aob-prev main{width:100%!important;height:100%!important;display:flex!important;flex-direction:column!important}
html.aob-prev header{flex:0 0 auto!important;margin-bottom:14px!important}
html.aob-prev .scene{flex:1 1 auto!important;min-height:0!important}
html.aob-prev svg.aob-scene{position:static!important;inset:auto!important;width:100%!important;height:100%!important}`,
  },
  '001-gpt-6-astra-medium': {
    vb: '9 44 1183 656',
    mode: 'poster',
    orig: { vb: '0 0 1200 700' },
    extra: `
html.aob-prev svg.aob-scene{position:static!important;inset:auto!important;width:100%!important;height:100%!important}`,
  },
  '001-gpt-6-astra': {
    vb: '87 102 917 508',
    mode: 'poster',
    orig: { vb: '0 0 1100 610' },
    extra: `
html.aob-prev body{height:100%!important}
html.aob-prev main{height:100%!important;display:flex!important;flex-direction:column!important;padding:12px 20px 8px!important}
html.aob-prev header,html.aob-prev .intro{flex:0 0 auto!important}
html.aob-prev .scene{flex:1 1 auto!important;min-height:0!important}
html.aob-prev svg.aob-scene{position:static!important;inset:auto!important;width:100%!important;height:100%!important}`,
  },
  '001-lfm2.5-2.6b': {
    vb: '0 30 360 270',
    orig: { vb: '0 0 400 300' },
  },
  '001-mimo-x-flash-preview': {
    mode: 'noSvg',
    orig: { vb: '0 0 1200 200', par: 'none' },
  },
  '001-qwen3.5-4b-thinking': {
    vb: '94 51 468 352',
    mode: 'poster',
    orig: { vb: '0 0 600 450' },
    extra: `
html.aob-prev body{align-items:center!important}
html.aob-prev .container{display:flex!important;flex-direction:column!important;justify-content:center!important;gap:10px!important;max-height:100%!important}
html.aob-prev svg.aob-scene{position:static!important;inset:auto!important;width:auto!important;height:auto!important;max-width:94vw!important;max-height:calc(100vh - 120px)!important}`,
  },
  '001-qwen3.8-27b-gsq-rco-iq3-s-xhigh': {
    vb: '117 0 928 580',
    orig: { vb: '0 0 1200 675', par: 'xMidYMid slice' },
  },
  '001-seed-2.1-pro-2': {
    vb: '204 14 960 560',
    panel: '.panel',
    orig: { vb: '0 0 1200 700', par: 'xMidYMid slice' },
  },
  '001-seed-2.1-pro-high': {
    panel: '#hud',
    canvas: true,
    orig: { vb: '0 0 1400 700', par: 'xMidYMid slice' },
  },
  '001-seed-2.1-pro': {
    orig: { vb: '0 0 800 460' },
  },
};

const FRAME_STYLE = (cfg) => `<style id="aob-frame">
/* aob 取景补丁 v4：只在预览模式生效（iframe src 带 ?aob=prev，前端注入）。
   放大预览 / 独立打开不带参数 = 原始页面，可滚动看全貌。 */
html.aob-prev, html.aob-prev body {
  margin: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
}
${cfg.mode === 'poster' || cfg.mode === 'noSvg' ? '' : `html.aob-prev svg.aob-scene {
  /* 纯场景作品：满屏（fixed 抵消「场景排在文字排版下方」的文档流布局） */
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  display: block !important;
}`}
${cfg.canvas ? `html.aob-prev canvas {
  position: fixed !important;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-50%, -50%) scale(2.7) translate(-63.5%, -66.7%) !important;
}` : ''}
${cfg.extra ?? ''}
${cfg.panel ? `html.aob-prev ${cfg.panel}{display:none!important}` : ''}
</style>
`;

const FRAME_JS = (cfg) => {
  const box = (vb) => vb.split(/\s+/).map(Number).join(', ');
  // 纯场景作品：取景框运行时按容器比例计算（见下方脚本注释）。
  // 海报/容器型（poster）、canvas 位图、无 svg（noSvg）三类维持固定框 + 固定 PAR。
  const dynamic = !cfg.canvas && cfg.mode !== 'poster' && cfg.mode !== 'noSvg';
  const staticJs = `  ${cfg.vb ? `svg.setAttribute('viewBox', '${cfg.vb}');` : '/* viewBox 原框已合适 */'}
  /* 纯场景铺满用 slice；海报类场景区在宽窗口下是超宽横条，slice 必裁上下——
     用 meet 完整呈现取景窗，两侧露出海报自身底色 */
  svg.setAttribute('preserveAspectRatio', '${cfg.mode === 'poster' ? 'xMidYMid meet' : 'xMidYMid slice'}');`;
  const dynamicJs = `  var ORIG = [${box(cfg.orig.vb)}];        /* 原画范围（不可越过，越界会露底） */
  var SUBJ = [${box(cfg.vb ?? cfg.orig.vb)}]; /* 主体取景框（无逐份配置时以原画为准） */
  /* 取景框以主体为中心向外扩到容器比例；夹回原画范围后若仍略有缺口（≤10%），
     用居中裁切补满——可见区域必须仍完整包含主体，否则退到「整幅原画 + 留边」
     并给页面铺上与原画背景相配的底色。任何窗口比例下主体都完整可见。 */
  function expand(a) {
    var f = SUBJ.slice();
    if (f[2] / f[3] < a) {
      var w = f[3] * a;
      f[0] -= (w - f[2]) / 2;
      f[2] = w;
    } else {
      var h = f[2] / a;
      f[1] -= (h - f[3]) / 2;
      f[3] = h;
    }
    return f;
  }
  function clip(f, box) {
    if (f[2] > box[2]) { f[2] = box[2]; f[0] = box[0]; }
    if (f[3] > box[3]) { f[3] = box[3]; f[1] = box[1]; }
    f[0] = Math.min(Math.max(f[0], box[0]), box[0] + box[2] - f[2]);
    f[1] = Math.min(Math.max(f[1], box[1]), box[1] + box[3] - f[3]);
    return f;
  }
  function visible(f, a) {
    var w = f[2], h = f[3];
    if (w / h > a) w = h * a; else h = w / a;
    return [f[0] + (f[2] - w) / 2, f[1] + (f[3] - h) / 2, w, h];
  }
  function hideOutside() {
    /* 留边模式下隐藏场景之外的兄弟元素：画面缩进后，作品页自己的提示条 /
       标题会浮在留边区域外，看着像页面漏了；隐藏它们（现状 slice 铺满时
       这些元素本来也被画面盖住看不见）。 */
    var node = svg;
    while (node && node !== document.documentElement) {
      var parent = node.parentElement;
      if (parent) {
        for (var i = 0; i < parent.children.length; i++) {
          var k = parent.children[i];
          if (k === node || k.contains(node)) continue;
          if (k.classList && k.classList.contains('aob-haze')) continue;
          if (k.tagName === 'SCRIPT' || k.tagName === 'STYLE' || k.tagName === 'LINK' || k.tagName === 'HEAD') continue;
          k.style.visibility = 'hidden';
        }
      }
      node = parent;
    }
  }
  var haze = null;
  var hazeStyleAdded = false;
  function setHaze(on) {
    /* 留边区域铺「画面自己的模糊放大版」（播放器 letterbox 的通行做法），
       比纯色填充自然得多；切回铺满模式时移除。 */
    if (on && !haze) {
      haze = svg.cloneNode(true);
      haze.removeAttribute('id');
      haze.setAttribute('class', 'aob-haze');
      haze.setAttribute('aria-hidden', 'true');
      haze.setAttribute('viewBox', ORIG.join(' '));
      haze.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      var inner = haze.querySelectorAll('script');
      for (var i = 0; i < inner.length; i++) inner[i].remove();
      if (!hazeStyleAdded) {
        hazeStyleAdded = true;
        var st = document.createElement('style');
        st.textContent =
          'html.aob-prev svg.aob-haze{position:fixed!important;left:-8vw!important;top:-8vh!important;width:116vw!important;height:116vh!important;filter:blur(30px) saturate(1.05) brightness(.97);z-index:0;pointer-events:none}' +
          'html.aob-prev svg.aob-haze *{animation:none!important}' +
          'html.aob-prev svg.aob-scene{z-index:1}';
        document.head.appendChild(st);
      }
      document.body.insertBefore(haze, document.body.firstChild);
    } else if (!on && haze) {
      haze.remove();
      haze = null;
    }
  }
  function apply() {
    var a = window.innerWidth / Math.max(1, window.innerHeight);
    var fit = clip(expand(a), ORIG);
    var band = visible(fit, a);
    /* 裁掉的份额：取景框是宽松框（主体占框 70–90%，四周有余量），
       ≤6% 的裁边不可见、直接裁满容器；再大就退「整幅原画 + 模糊留边」，
       宁可留边也不裁进主体（用户要求：主体必须完整）。 */
    var crop = Math.max(1 - band[2] / fit[2], 1 - band[3] / fit[3]);
    var useSlice = crop <= 0.06;
    var f = useSlice ? fit : clip(ORIG.slice(), ORIG);
    svg.setAttribute(
      'viewBox',
      f.map(function (n) { return Math.round(n * 10) / 10; }).join(' '),
    );
    svg.setAttribute('preserveAspectRatio', useSlice ? 'xMidYMid slice' : 'xMidYMid meet');
    setHaze(!useSlice);
    if (!useSlice) hideOutside();
  }
  apply();
  window.addEventListener('resize', apply);`;
  return `<script id="aob-frame-js">
/* aob 预览模式开关：?aob=prev 时加 html.aob-prev（激活取景 CSS）并临时改写
   viewBox 取景；无参数（放大预览 / 独立打开）什么都不做 = 原始页面。 */
(function () {
  if (location.search.indexOf('aob=prev') < 0) return;
  document.documentElement.classList.add('aob-prev');
  var svg = document.querySelector('svg.aob-scene');
  if (!svg) return;
${dynamic ? dynamicJs : staticJs}
})();
</script>
`;
};

let patched = 0;
const notes = [];
for (const name of readdirSync(DIR).filter((f) => f.endsWith('.html')).sort()) {
  const file = path.join(DIR, name);
  const key = name.replace(/\.html$/, '');
  const cfg = CONFIG[key] ?? {};
  let html = readFileSync(file, 'utf8');
  const changed = [];

  // 剥旧补丁（v3 及更早遗留的 style/把手脚本）
  const oldStyle = html.match(/<style id="aob-frame">[\s\S]*?<\/style>/);
  if (oldStyle) {
    html = html.replace(oldStyle[0], '');
    changed.push('剥旧style');
  }
  const oldJs = html.match(/<script id="aob-frame-js">[\s\S]*?<\/script>/);
  if (oldJs) {
    html = html.replace(oldJs[0], '');
    changed.push('剥旧script');
  }

  // svg 属性永久还原为原件值（幂等：每次都写 ORIG）
  if (!cfg.noSvg && cfg.orig) {
    const start = html.indexOf('<svg');
    const end = html.indexOf('>', start);
    let tag = html.slice(start, end + 1);
    if (/viewBox="[^"]*"/.test(tag)) {
      tag = tag.replace(/viewBox="[^"]*"/, `viewBox="${cfg.orig.vb}"`);
    } else {
      tag = tag.replace('<svg', `<svg viewBox="${cfg.orig.vb}"`);
    }
    if (cfg.orig.par) {
      if (/preserveAspectRatio="[^"]*"/.test(tag)) {
        tag = tag.replace(/preserveAspectRatio="[^"]*"/, `preserveAspectRatio="${cfg.orig.par}"`);
      } else {
        tag = tag.replace('<svg', `<svg preserveAspectRatio="${cfg.orig.par}"`);
      }
    } else if (/ preserveAspectRatio="[^"]*"/.test(tag)) {
      // v2 时代残留的 slice：原件没有该属性就必须剥掉，否则「无参数=原始页面」不成立
      tag = tag.replace(/ preserveAspectRatio="[^"]*"/, '');
      changed.push('剥残留PAR');
    }
    html = html.slice(0, start) + tag + html.slice(end + 1);
    changed.push('svg还原');
  }

  // 主 svg 标记（幂等；noSvg 不动）
  if (!cfg.noSvg && !html.includes('aob-scene')) {
    const start = html.indexOf('<svg');
    const end = html.indexOf('>', start);
    let tag = html.slice(start, end + 1);
    if (/class="[^"]*"/.test(tag)) {
      tag = tag.replace(/class="([^"]*)"/, (m, c) => `class="${c} aob-scene"`);
    } else {
      tag = tag.replace('<svg', '<svg class="aob-scene"');
    }
    html = html.slice(0, start) + tag + html.slice(end + 1);
    changed.push('class');
  }

  // 注入 v4 补丁（style + 脚本，均挂 body 尾；无参数时脚本直接 return）
  const patch = FRAME_STYLE(cfg) + FRAME_JS(cfg);
  html = html.includes('</body>') ? html.replace('</body>', `${patch}</body>`) : html + patch;
  changed.push('v4补丁');

  writeFileSync(file, html);
  patched++;
  notes.push(`${name}: ${changed.join('+')}`);
}
console.log(`补丁完成：${patched} 份处理（v4：取景参数化，放大视图还原原始页面）`);
for (const note of notes) console.log('  ' + note);
