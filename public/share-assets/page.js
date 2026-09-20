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
if (navigator.share) {
  native.hidden = false;
  native.addEventListener('click', async () => {
    try {
      await navigator.share({ title: document.title, url: canonical });
    } catch (error) {
      if (error.name !== 'AbortError')
        shareStatus.textContent =
          '系统分享暂不可用，可以复制链接或长按保存图片。';
    }
  });
}
document.getElementById('card').addEventListener('error', () => {
  shareStatus.textContent = '图片暂未生成，请刷新重试；你仍可以复制链接。';
});
