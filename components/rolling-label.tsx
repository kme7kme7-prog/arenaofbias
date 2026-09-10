import { useLayoutEffect, useRef } from 'react';
import {
  createRollingText,
  type RollingTextController,
} from '@kitlangton/rolling-number';
import '@kitlangton/rolling-number/styles.css';

export function RollingLabel({
  text,
  reduced = false,
}: {
  text: string;
  reduced?: boolean;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const controller = useRef<RollingTextController | null>(null);
  useLayoutEffect(() => {
    if (!host.current) return;
    controller.current = createRollingText(host.current, {
      text: '',
      transition: 'direct',
      stagger: 'none',
      duration: 460,
      direction: 'up',
      motionBlur: true,
      animated: false,
    });
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) controller.current?.refresh();
    });
    return () => {
      live = false;
      controller.current?.destroy();
      controller.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    controller.current?.update({ text, animated: !reduced });
  }, [text, reduced]);
  return <span ref={host} />;
}
