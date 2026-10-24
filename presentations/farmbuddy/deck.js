/* Standalone presentation controls. Deliberately no dependencies or network calls. */
(() => {
  'use strict';
  const root = document.documentElement;
  const slides = [...document.querySelectorAll('.slide')];
  const notes = [...document.querySelectorAll('.speaker-notes details')];
  const previous = document.getElementById('previous');
  const next = document.getElementById('next');
  const page = document.getElementById('page');
  const overviewButton = document.getElementById('overview-toggle');
  let index = 0;
  let overview = false;
  let touchStart = null;
  const fromHash = () => {
    const match = location.hash.match(/^#slide-(\d+)$/);
    return match ? Math.max(0, Math.min(slides.length - 1, Number(match[1]) - 1)) : 0;
  };
  function fit() {
    const narrow = innerWidth <= 700;
    const availableWidth = innerWidth - (narrow ? 20 : 48);
    const gap = narrow ? 12 : 24;
    const widthScale = (overview ? (availableWidth - gap) / 2 : availableWidth) / 1600;
    const heightScale = Math.max(180, innerHeight - (narrow ? 155 : 165)) / 900;
    const scale = Math.max(0.08, Math.min(1, widthScale, overview ? 0.47 : heightScale));
    root.style.setProperty('--scale', String(scale));
    root.style.setProperty('--canvas-height', `${900 * scale}px`);
  }
  function show(target, updateHash = true) {
    index = Math.max(0, Math.min(slides.length - 1, target));
    slides.forEach((slide, position) => {
      slide.classList.toggle('is-active', position === index);
      // CSS hides inactive slides for accessibility, and print reveals all slides.
      slide.setAttribute('aria-label', `Slide ${position + 1} of ${slides.length}`);
    });
    notes.forEach((note, position) => note.classList.toggle('current', position === index));
    previous.disabled = index === 0;
    next.disabled = index === slides.length - 1;
    page.value = `${index + 1} / ${slides.length}`;
    page.textContent = page.value;
    document.title = `FarmBuddy | ${index + 1} / ${slides.length} | ${slides[index].querySelector('h1,h2').textContent.trim().replace(/\s+/g, ' ')}`;
    if (updateHash) history.replaceState(null, '', `#slide-${index + 1}`);
  }
  function toggleOverview(force) {
    overview = typeof force === 'boolean' ? force : !overview;
    document.body.classList.toggle('overview', overview);
    overviewButton.setAttribute('aria-pressed', String(overview));
    fit();
  }
  previous.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  overviewButton.addEventListener('click', () => toggleOverview());
  document.getElementById('print').addEventListener('click', () => window.print());
  document.addEventListener('keydown', event => {
    if (event.target.closest('input,textarea,select,summary') || event.altKey || event.ctrlKey || event.metaKey) return;
    if (['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Home') show(0);
      else if (event.key === 'End') show(slides.length - 1);
      else show(index + (['ArrowRight', 'PageDown'].includes(event.key) ? 1 : -1));
    } else if (event.key.toLowerCase() === 'o') toggleOverview();
    else if (event.key === 'Escape' && overview) toggleOverview(false);
  });
  slides.forEach((slide, position) => {
    slide.addEventListener('click', () => {
      if (!overview) return;
      show(position);
      toggleOverview(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  });
  const deck = document.getElementById('deck');
  deck.addEventListener('touchstart', event => {
    if (overview || event.touches.length !== 1) return;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  deck.addEventListener('touchend', event => {
    if (!touchStart || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1));
  }, { passive: true });
  deck.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
  window.addEventListener('hashchange', () => show(fromHash(), false));
  window.addEventListener('resize', fit);
  root.classList.add('js');
  fit();
  show(fromHash(), false);
})();
