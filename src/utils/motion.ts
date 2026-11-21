/** Gentle scroll-reveal. Elements fade/slide in once; nothing runs when the user prefers reduced motion. */
let io: IntersectionObserver | null = null;
const SEL = '.card, .cat, .panel, .banner, .sec-head, details, .cart-row, .gallery, .pdp > div, .hero-art';

export function reveal(root: ParentNode = document) {
  if (document.body.classList.contains('motion-off')) return;
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  io ??= new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io?.unobserve(e.target); }
  }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  root.querySelectorAll<HTMLElement>(SEL).forEach((el, i) => {
    if (el.classList.contains('reveal')) return;
    el.classList.add('reveal');
    el.style.setProperty('--d', `${(i % 4) * 80}ms`);
    io?.observe(el);
  });
}

export function watchHeader() {
  const h = document.getElementById('site-header');
  const on = () => h?.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', on, { passive: true });
  on();
}
