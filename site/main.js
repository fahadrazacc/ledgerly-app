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

  // Contact form: saved to the project's Firestore "feedback" collection (create-only).
  const form = document.getElementById('contact-form');
  const status = form && form.querySelector('.form-status');
  const ENDPOINT =
    'https://firestore.googleapis.com/v1/projects/ledgerly-f2170/databases/(default)/documents/feedback?key=AIzaSyDBpxfpda1K1t5fxB1y5S0a67LjSRuMr10';
  const say = (text, kind) => {
    status.textContent = text;
    status.dataset.kind = kind || '';
  };
  form && form.addEventListener('input', () => status.dataset.kind === 'ok' && say(''));
  form &&
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const message = String(f.get('message') || '').trim();
      const email = String(f.get('email') || '').trim();
      if (f.get('website')) return say('Thanks, your message was sent.', 'ok'); // bot
      if (!message) {
        form.message.focus();
        return say('Write a message before sending.', 'error');
      }
      if (email && !form.email.checkValidity()) {
        form.email.focus();
        return say('Check the email address, or leave it empty.', 'error');
      }
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      say('Sending…');
      const str = (v) => ({ stringValue: v });
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              kind: str(String(f.get('kind') || 'feedback')),
              name: str(String(f.get('name') || '').trim().slice(0, 100)),
              email: str(email.slice(0, 200)),
              message: str(message.slice(0, 2000)),
              source: str('website'),
              createdAt: { timestampValue: new Date().toISOString() },
            },
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        say(email ? 'Thanks, your message was sent. We’ll reply by email.' : 'Thanks, your message was sent.', 'ok');
      } catch {
        say('Your message wasn’t sent. Check your connection and try again.', 'error');
      } finally {
        button.disabled = false;
      }
    });
}
