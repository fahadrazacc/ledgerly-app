{
  // Header border once the page scrolls
  const top = document.querySelector('.top');
  const onScroll = () => top.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu
  const btn = document.querySelector('.menu-btn');
  const menu = document.getElementById('mobile-menu');
  btn.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  // Already using Ledgerly in this browser? Say "Open Ledgerly" instead of "Log in".
  try {
    if (localStorage.getItem('ledgerly.vault.v1')) {
      document.querySelectorAll('[data-open-label]').forEach((a) => (a.textContent = 'Open Ledgerly'));
    }
  } catch {
    /* storage blocked: keep the default label */
  }
}
