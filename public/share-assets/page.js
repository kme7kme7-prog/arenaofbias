const canonical = document.querySelector('link[rel="canonical"]').href;
const shareStatus = document.getElementById('status');
document.getElementById('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(canonical);
    shareStatus.textContent = '链接已复制，发给朋友看看。';
  } catch {
    document.querySelector('.manual').hidden = false;
    document.querySelector('.manual input').select();
    shareStatus.textContent = '请手动复制上面的链接。';
  }
});
const native = document.getElementById('native');
const card = document.getElementById('card');
let imageFile = null;
// 提前准备文件，点击分享时不再等待网络，避免耗尽用户激活。
void fetch(card.src).then(async response => {
  if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) return;
  imageFile = new File([await response.blob()], 'arena-of-bias.png', { type: 'image/png' });
}).catch(() => {});
if (navigator.share) {
  native.hidden = false;
  native.addEventListener('click', async () => {
    try {
      const files = imageFile ? [imageFile] : null;
      await navigator.share(files && navigator.canShare?.({ files })
        ? { title: document.title, files }
        : { title: document.title, url: canonical });
    } catch (error) {
      if (error.name !== 'AbortError')
        shareStatus.textContent =
          '系统分享暂不可用，可以复制链接或长按保存图片。';
    }
  });
}
const save = document.querySelector('.actions a[download]');
if (save && window.matchMedia('(pointer: coarse)').matches) {
  save.href = card.src;
  save.removeAttribute('download');
  save.target = '_blank';
  save.rel = 'noreferrer';
  save.addEventListener('click', event => {
    if (!imageFile || !navigator.share || !navigator.canShare?.({ files: [imageFile] })) return;
    event.preventDefault();
    void navigator.share({ title: document.title, files: [imageFile] }).catch(error => {
      if (error.name !== 'AbortError')
        shareStatus.textContent = '请点“打开原图保存”后长按图片，也可在系统浏览器中打开。';
    });
  });
}
const original = document.createElement('a');
original.href = card.src;
original.target = '_blank';
original.rel = 'noreferrer';
original.textContent = '打开原图保存 ↗';
document.querySelector('.actions').append(original);
document.getElementById('card').addEventListener('error', () => {
  shareStatus.textContent = '图片暂未生成，请刷新重试；你仍可以复制链接。';
});
