/** 档案入场只负责呈现；选题同步生效，切换时由组件卸载清理旧轨道。 */
export function revealLibrary(
  root: HTMLElement,
  media = window.matchMedia('(prefers-reduced-motion: reduce)'),
): () => void {
  if (media.matches) return () => {};
  const animations = Array.from(
    root.querySelectorAll<HTMLElement>('[data-library-reveal]'),
  ).map((node, index) => {
    const animation = node.animate(
      [
        { backgroundColor: 'var(--entry-wash)' },
        { backgroundColor: 'transparent' },
      ],
      {
        duration: 620,
        delay: Math.min(index, 5) * 55,
        easing: 'cubic-bezier(.16,1,.3,1)',
        fill: 'both',
      },
    );
    animation.onfinish = () => animation.cancel();
    return animation;
  });
  const cancel = () => animations.forEach((animation) => animation.cancel());
  const onPreference = () => {
    if (media.matches) cancel();
  };
  media.addEventListener('change', onPreference);
  return () => {
    media.removeEventListener('change', onPreference);
    cancel();
  };
}
