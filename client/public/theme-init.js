(() => {
  try {
    const stored = localStorage.getItem('dnd-vtt.theme');
    const followsSystem = stored === null || stored === 'system';
    const dark = stored === 'dark'
      || (followsSystem && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();
