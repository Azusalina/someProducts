(() => {
 const media = matchMedia('(prefers-color-scheme: dark)');
 let preference = 'system';
 try { preference = localStorage.getItem('track-theme') || 'system'; } catch {}
 if (!['system','light','dark'].includes(preference)) preference = 'system';
 function apply() {
  document.documentElement.dataset.theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
  document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
  window.dispatchEvent(new Event('track-theme-change'));
 }
 window.TrackTheme = {get: () => preference, set: value => {
  preference = ['system','light','dark'].includes(value) ? value : 'system';
  try { localStorage.setItem('track-theme', preference); } catch {}
  apply();
 }};
 media.addEventListener('change', () => { if (preference === 'system') apply(); });
 apply();
})();
