import { Languages } from 'lucide-react';
import { setLocale, useI18n } from '@/lib/locale';

export function LanguageSwitch() {
  const { language } = useI18n();
  return (
    <button
      type="button"
      className="language-switch"
      onClick={() => setLocale(language === 'zh' ? 'en' : 'zh')}
      aria-label={language === 'zh' ? '切换为英文' : 'Switch to Chinese'}
      title={language === 'zh' ? '切换为英文' : 'Switch to Chinese'}
    >
      <Languages size={16} aria-hidden="true" />
      <span>{language === 'zh' ? '中文' : 'English'}</span>
    </button>
  );
}
