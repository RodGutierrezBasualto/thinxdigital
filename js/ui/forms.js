/* ==========================================================================
   forms.js — the contact form on /contact/. Validates, then shows a local
   thank-you state. It NEVER sends data anywhere (no fetch, no form action).
   ========================================================================== */
import { gsap, qs, qsa } from './core.js';

const RULES = {
  name: (v) => (v.trim().length >= 2 ? '' : 'Please tell me your name.'),
  mobile: (v) => (!v.trim() || /^[+()\d\s-]{6,}$/.test(v.trim()) ? '' : 'That number doesn’t look right.'),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Please enter a valid email address.'),
  business: (v) => (v.trim() ? '' : 'Please add your business name.'),
  website: (v) => (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i.test(v.trim()) ? '' : 'Please add your website, e.g. yourbusiness.com.au'),
  spend: (v) => (v ? '' : 'Please choose a range.'),
  goals: (v) => (v.trim().length >= 5 ? '' : 'A sentence or two about your goals helps a lot.'),
};

export function initForms(m) {
  const form = qs('form.form', m);
  if (!form) return () => {};
  const card = form.closest('.contact__card');
  const thanks = qs('.form__thanks', card);

  function check(field) {
    const input = field.querySelector('input, select, textarea');
    if (!input || !RULES[input.name]) return true;
    const msg = RULES[input.name](input.value);
    field.classList.toggle('is-invalid', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    const err = field.querySelector('.field__err');
    if (err) {
      err.textContent = msg;
      err.id ||= `${input.id}-err`;
      if (msg) input.setAttribute('aria-describedby', err.id);
      else input.removeAttribute('aria-describedby');
    }
    return !msg;
  }

  // validate a field once the visitor leaves it, then live while they fix it
  const onOut = (e) => { const f = e.target.closest('.field'); if (f && e.target.value) check(f); };
  const onInput = (e) => { const f = e.target.closest('.field'); if (f?.classList.contains('is-invalid')) check(f); };
  const onSubmit = (e) => {
    e.preventDefault();
    const ok = qsa('.field', form).map(check).every(Boolean);
    if (!ok) {
      qs('.field.is-invalid input, .field.is-invalid select, .field.is-invalid textarea', form)?.focus();
      return;
    }

    // TODO: connect to a form backend (e.g. Netlify Forms, which the current site uses).
    // Until then nothing leaves the browser: the values are only read locally.
    // const data = Object.fromEntries(new FormData(form));

    form.reset();
    form.hidden = true;
    thanks.hidden = false;
    gsap.fromTo(thanks.children, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.08, ease: 'thx.out' });
    thanks.focus({ preventScroll: true });
  };
  const again = qs('.form__again', thanks);
  const onAgain = () => {
    thanks.hidden = true;
    form.hidden = false;
    qs('#f-name', form)?.focus();
  };

  form.addEventListener('focusout', onOut);
  form.addEventListener('input', onInput);
  form.addEventListener('submit', onSubmit);
  again?.addEventListener('click', onAgain);
  return () => {
    form.removeEventListener('focusout', onOut);
    form.removeEventListener('input', onInput);
    form.removeEventListener('submit', onSubmit);
    again?.removeEventListener('click', onAgain);
  };
}
