import { useReducedMotion } from '@/lib/motion';
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
  const systemReduced = useReducedMotion();
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
      motionBlur: false,
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
    controller.current?.update({ text, animated: !reduced && !systemReduced });
  }, [text, reduced, systemReduced]);
  return <span ref={host} />;
}
