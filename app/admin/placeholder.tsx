// 后台未开放模块的占位页：诚实标注未实现，写明当前阶段的手工替代方式
// （用户定的原则：占位功能不能假装成功）。
export function AdminPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p className="admin-sub">此模块尚未开放。</p>
      <div className="admin-placeholder">
        <b>该功能未开放</b>
        <p style={{ margin: 0 }}>{note}</p>
      </div>
    </section>
  );
}
