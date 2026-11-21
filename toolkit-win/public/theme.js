(() => {
  const key = 'toolkit-theme', root = document.documentElement;
  const normalize = value => value === 'light' ? 'light' : 'dark';
  function updateButton() {
    const button = document.getElementById('theme-toggle');
    if (!button) return;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    button.textContent = next === 'light' ? 'Light mode' : 'Dark mode';
    button.setAttribute('aria-label', `Switch to ${next} mode`);
  }
  function apply(value) {
    root.dataset.theme = normalize(value);
    updateButton();
    document.dispatchEvent(new Event('toolkit-theme-change'));
  }
  let saved;
  try { saved = localStorage.getItem(key); } catch {}
  apply(saved);
  document.addEventListener('DOMContentLoaded', () => {
    updateButton();
    document.getElementById('theme-toggle').addEventListener('click', () => {
      apply(root.dataset.theme === 'dark' ? 'light' : 'dark');
      try { localStorage.setItem(key, root.dataset.theme); } catch {}
    });
  }, { once: true });
  window.addEventListener('storage', event => {
    if (event.storageArea === localStorage && (event.key === key || event.key === null)) apply(event.newValue);
  });
})();
