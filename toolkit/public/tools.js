const tools = [
  ['markdown-tab', 'Markdown to PDF', 'markdown'],
  ['pdf-pages-tab', 'PDF pages', 'pdf'],
  ['photos-tab', 'Photos to PDF', 'photos'],
  ['media-tab', 'URL audio', 'media'],
  ['omr-tab', 'OMR scan', 'omr'],
];
for (const [id, title, mode] of tools) {
  document.getElementById(id).addEventListener('click', () => {
    document.body.classList.toggle('pdf-mode', mode === 'pdf');
    document.body.classList.toggle('photos-mode', mode === 'photos');
    document.getElementById('pdf-pages-workspace').hidden = mode !== 'pdf';
    document.getElementById('photos-workspace').hidden = mode !== 'photos';
    document.getElementById('omr-workspace').hidden = mode !== 'omr';
    for (const [button] of tools) document.getElementById(button).setAttribute('aria-pressed', String(button === id));
    document.getElementById('tool-title').textContent = title;
    document.body.classList.toggle('omr-mode',mode==='omr');
    document.body.classList.toggle('media-mode',mode==='media');
    document.getElementById('media-workspace').hidden = mode !== 'media';
  });
}
