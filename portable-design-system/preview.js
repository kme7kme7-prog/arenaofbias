/* Optional showcase behavior; design-kit.css never depends on this file. */
(() => {
  const dialog = document.querySelector('#sample-dialog');
  const trigger = document.querySelector('[data-open-dialog]');
  if (typeof dialog.showModal === 'function') {
    trigger.hidden = false;
    trigger.addEventListener('click', () => dialog.showModal());
    document.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => trigger.focus());
  }

  const form = document.querySelector('#sample-form');
  const status = document.querySelector('#form-status');
  form.querySelector('[data-js]').hidden = false;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = form.elements.project.value.trim();
    if (!name) {
      form.elements.project.setCustomValidity('请输入项目名称，不能只填空格。');
      form.elements.project.reportValidity();
      return;
    }
    status.textContent = `已演示保存“${name}”。数据未发送，也未写入存储。`;
  });
  form.elements.project.addEventListener('input', () => form.elements.project.setCustomValidity(''));
  form.addEventListener('reset', () => {
    form.elements.project.setCustomValidity('');
    status.textContent = '尚未保存。';
  });

  const tablist = document.querySelector('#pattern-tabs');
  const tabs = [...tablist.querySelectorAll('button')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  function select(index, moveFocus = false) {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (moveFocus) tabs[index].focus();
  }
  tablist.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].tabIndex = 0;
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      select(next, true);
    });
  });
  select(0);
  tablist.hidden = false;
})();
