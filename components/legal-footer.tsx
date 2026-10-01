import { useI18n } from '@/lib/locale';
import { CONTACT, SITE_NAME, beianFor } from '@/lib/legal';
import '@/app/legal.css';

// 页面底部的法律信息行：版权、AI 生成说明、条款与隐私、联系方式、备案号。
// 用在首页、玩法菜单、题库与榜单的页脚之后。
export function LegalFooter() {
  const { t } = useI18n();
  const beian = beianFor();
  return (
    <div className="legal-footer">
      <p>
        © {new Date().getFullYear()} {SITE_NAME} · {t('站内作品由 AI 模型生成，仅供比较与学习参考')} ·{' '}
        {t('引用或转载请')}<a href="#terms/cite">{t('注明来源')}</a>
        {' · '}<a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        {beian && <>{' · '}<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{beian}</a></>}
      </p>
      <nav aria-label={t('站点信息')}>
        <a href="#terms">{t('使用条款')}</a>
        <a href="#privacy">{t('隐私政策')}</a>
        <a href={`mailto:${CONTACT}`}>{t('联系我们')}</a>
      </nav>
    </div>
  );
}

// 作品的显式标识（《人工智能生成合成内容标识办法》）：出现在作品栏头与放大预览标题。
export function AigcLabel() {
  const { t } = useI18n();
  return (
    <span className="aigc-label" title={t('本作品由人工智能模型生成')}>
      {t('AI 生成')}
    </span>
  );
}
