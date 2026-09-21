// 内测提示（2026-09-20）：首次进入主站首页弹一次，localStorage 记住「已看过」。
// 只在首页路由弹（src/main.tsx 挂载点控制）；文案改版时把 STORAGE_VERSION
// 加一，老访客会再看一次。ESC / 点遮罩 / 点按钮都关闭（Dialog 自带）。
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/lib/locale';
import '@/components/beta-notice.css';

const STORAGE_KEY = 'aob-beta-notice';
const STORAGE_VERSION = 'v3';

function dismiss() {
  try {
    localStorage.setItem(STORAGE_KEY, STORAGE_VERSION);
  } catch {
    /* 存储不可用时不记，下次还会弹 */
  }
}

export function BetaNotice() {
  const { t } = useI18n();
  // 惰性初始化：不进 effect，避开「effect 体内不得同步 setState」的项目规则
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== STORAGE_VERSION;
    } catch {
      return false; // 隐私模式等读不到存储：不弹，不烦人
    }
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
        setOpen(next);
      }}
    >
      <DialogContent
        className="beta-notice-card"
        overlayClassName="beta-notice-overlay"
        showCloseButton={false}
      >
        <DialogTitle className="beta-notice-title">{t('内测版')}</DialogTitle>
        <p>{t('这个小游戏网站还在小范围内测。')}</p>
        <p>{t('玩法与榜单功能大致做完了，剩下还在打磨，预计有特别多bug。')}</p>
        <p>{t('现在投票都会被计入；如果遇到哪里不对劲，马上发给我。')}</p>
        <button
          type="button"
          className="beta-notice-enter"
          onClick={() => {
            dismiss();
            setOpen(false);
          }}
        >
          {t('知道了')}
        </button>
      </DialogContent>
    </Dialog>
  );
}
