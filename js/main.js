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

  // ---- Achievements gallery ----
  const ACH = [
    ['firstblood', 'First Blood', 'Get your first kill'],
    ['headhunter', 'Headhunter', 'Land a headshot'],
    ['demolition', 'Demolition', 'Detonate an explosive barrel'],
    ['wave5', 'Survivor', 'Reach Wave 5'],
    ['wave10', 'Hardened', 'Reach Wave 10'],
    ['slayer', 'Boss Slayer', 'Defeat a Boss'],
    ['gunsmith', 'Gunsmith', 'Level a weapon to LV5'],
    ['globetrotter', 'Globetrotter', 'Fight on every map'],
    ['nightmare', 'Nightmare', 'Clear a wave on Nightmare'],
    ['basebuster', 'Base Buster', 'Destroy the enemy base'],
  ];
  const achHost = document.getElementById('ach-gallery');
  if (achHost) {
    let unlocked = new Set();
    try { unlocked = new Set(JSON.parse(localStorage.getItem('verdant_ach') || '[]')); } catch (_) {}
    achHost.innerHTML = '';
    ACH.forEach(([id, name, desc]) => {
      const on = unlocked.has(id);
      const el = document.createElement('div');
      el.className = 'ach-item ' + (on ? 'unlocked' : 'locked');
      el.innerHTML = `<span class="ach-medal">${on ? '🏆' : '🔒'}</span><div class="ach-info"><h4>${name}</h4><p>${desc}</p></div>`;
      achHost.appendChild(el);
    });
    const prog = document.getElementById('ach-progress');
    if (prog) prog.textContent = `${[...unlocked].filter((u) => ACH.some((a) => a[0] === u)).length} / ${ACH.length} unlocked`;
  }

  // ---- Online leaderboard widget (offline -> local fallback) ----
  const list = document.getElementById('leaderboard-list');
  if (list) {
    const MAP_NAMES = { plains: 'Verdant Plains', highlands: 'Ashen Highlands', lowlands: 'Mire Lowlands', mountains: 'Titan Peaks' };
    const netEl = document.getElementById('lb-net'), netTx = document.getElementById('lb-net-text');
    const base = (/^https?:$/.test(location.protocol)) ? location.origin + '/api' : null;
    let tab = 'global';

    const flagEmoji = (cc) => {
      if (!cc || typeof cc !== 'string') return '';
      cc = cc.toUpperCase().replace(/[^A-Z]/g, '');
      if (cc.length !== 2) return '';
      const A = 0x1f1e6;
      return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
    };
    const render = (scores, online) => {
      if (!scores || !scores.length) { list.innerHTML = '<li class="lb-empty">No runs yet — be the first to survive.</li>'; return; }
      list.innerHTML = '';
      scores.slice(0, 8).forEach((r, i) => {
        const li = document.createElement('li');
        const flag = flagEmoji(r.country);
        li.innerHTML =
          `<span class="lb-rank">#${i + 1}</span>` +
          `<span class="lb-name">${flag ? flag + ' ' : ''}${(r.name || (online ? 'GHOST' : 'YOU')).replace(/[<>]/g, '')}</span>` +
          `<span class="lb-score">${String(r.score).padStart(5, '0')}</span>` +
          `<span class="lb-map">W${r.wave} · ${MAP_NAMES[r.map] || ''}</span>`;
        list.appendChild(li);
      });
    };
    const local = () => { let s = []; try { s = JSON.parse(localStorage.getItem('verdant_scores') || '[]'); } catch (_) {} return s.sort((a, b) => b.score - a.score); };
    const setNet = (on) => { netEl.className = 'lb-net ' + (on ? 'online' : 'offline'); netTx.textContent = on ? 'online' : 'offline'; };

    const refresh = async () => {
      if (tab === 'local') { setNet(false); render(local(), false); return; }
      list.innerHTML = '<li class="lb-empty">Loading…</li>';
      if (base) {
        try {
          const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 3500);
          const r = await fetch(base + '/leaderboard', { signal: ctrl.signal }); clearTimeout(t);
          if (r.ok) { const d = await r.json(); setNet(true); render(d.scores || [], true); return; }
        } catch (_) {}
      }
      setNet(false); render(local(), false); // graceful offline fallback
    };
    document.getElementById('lb-tab-global').addEventListener('click', (e) => { tab = 'global'; e.target.classList.add('active'); document.getElementById('lb-tab-local').classList.remove('active'); refresh(); });
    document.getElementById('lb-tab-local').addEventListener('click', (e) => { tab = 'local'; e.target.classList.add('active'); document.getElementById('lb-tab-global').classList.remove('active'); refresh(); });
    refresh();
  }

  // ---- Gallery lightbox ----
  const lb = document.getElementById('lightbox'), lbImg = document.getElementById('lightbox-img');
  document.querySelectorAll('.shot').forEach((fig) => {
    fig.addEventListener('click', () => { lbImg.src = fig.dataset.full; lb.classList.add('open'); });
  });
  if (lb) lb.addEventListener('click', () => lb.classList.remove('open'));
})();
