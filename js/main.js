/* VERDANT — landing page interactions */
(function () {
  'use strict';

  // Floating spores in the background
  const field = document.getElementById('particles');
  if (field) {
    const count = window.innerWidth < 700 ? 18 : 38;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'spore';
      const size = 2 + Math.random() * 4;
      s.style.width = s.style.height = size + 'px';
      s.style.left = Math.random() * 100 + 'vw';
      s.style.bottom = '-10px';
      s.style.animationDuration = 8 + Math.random() * 14 + 's';
      s.style.animationDelay = -Math.random() * 14 + 's';
      s.style.opacity = 0.3 + Math.random() * 0.6;
      field.appendChild(s);
    }
  }

  // Count-up stats
  document.querySelectorAll('.stat-num').forEach((el) => {
    const target = el.dataset.count;
    if (target === '∞') return;
    const end = parseInt(target, 10);
    let cur = 0;
    const step = Math.max(1, Math.round(end / 40));
    const tick = () => {
      cur = Math.min(end, cur + step);
      el.textContent = cur;
      if (cur < end) requestAnimationFrame(tick);
    };
    // start when hero is in view (it is at load) after small delay
    setTimeout(tick, 300);
  });

  // Reveal-on-scroll
  document.querySelectorAll('.section, .card, .key-row').forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // Leaderboard from localStorage
  const list = document.getElementById('leaderboard-list');
  if (list) {
    let scores = [];
    try { scores = JSON.parse(localStorage.getItem('verdant_scores') || '[]'); } catch (_) {}
    if (Array.isArray(scores) && scores.length) {
      scores.sort((a, b) => b.score - a.score);
      list.innerHTML = '';
      scores.slice(0, 5).forEach((r, i) => {
        const li = document.createElement('li');
        li.innerHTML =
          `<span class="lb-rank">#${i + 1}</span>` +
          `<span class="lb-score">${String(r.score).padStart(5, '0')}</span>` +
          `<span class="lb-wave">Wave ${r.wave}</span>`;
        list.appendChild(li);
      });
    }
  }
})();
