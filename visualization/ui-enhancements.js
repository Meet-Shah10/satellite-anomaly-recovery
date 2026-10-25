/**
 * ui-enhancements.js
 * Premium space-ops UI layer:
 *   - Canvas starfield
 *   - Typing animation with glitch/techy gibberish
 *   - Floating particles
 *   - Scroll-triggered reveal
 *   - Counter number animation
 *   - Section switching (hero nav)
 *   - Parallax on scroll
 *   - Bounce arrow animation
 */

// ═══════════════════════════════════════════════════════════════════════════
// STARFIELD
// ═══════════════════════════════════════════════════════════════════════════
(function initStarfield() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, stars = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    buildStars();
  }

  function buildStars() {
    stars = [];
    const count = Math.floor((W * H) / 5000);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.2,
        o: Math.random() * 0.6 + 0.1,
        speed: Math.random() * 0.015 + 0.003,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    frame += 0.01;
    stars.forEach(s => {
      const twinkle = Math.sin(frame * s.twinkleSpeed * 60 + s.twinklePhase);
      const opacity = s.o + twinkle * 0.15;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, opacity)})`;
      ctx.fill();
      // Slow drift downward
      s.y += s.speed;
      if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();
})();

// ═══════════════════════════════════════════════════════════════════════════
// FLOATING PARTICLES
// ═══════════════════════════════════════════════════════════════════════════
(function initParticles() {
  const count = 18;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size  = Math.random() * 2 + 1;
    const dur   = Math.random() * 20 + 15;
    const delay = Math.random() * -30;
    const drift = (Math.random() - 0.5) * 120;
    const hue   = Math.random() > 0.5 ? '270, 70%, 65%' : '260, 60%, 70%';
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      background: hsl(${hue});
      box-shadow: 0 0 ${size * 3}px hsl(${hue});
      animation-duration:${dur}s;
      animation-delay:${delay}s;
      --drift:${drift}px;
    `;
    document.body.appendChild(p);
  }
})();

// ═══════════════════════════════════════════════════════════════════════════
// TYPING ANIMATION with techy gibberish
// ═══════════════════════════════════════════════════════════════════════════
(function initTyping() {
  const el = document.getElementById('typing-text');
  if (!el) return;

  const GIBBERISH = '01ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*-+=><';
  const LINES = [
    'f(n) = g(n) + h_d(n) + λ·R(n)',
    'Isolation Forest · 200 trees · 32-dim features',
    'Spacecraft telemetry anomaly → recovery plan',
    'Hard constraints pruned · anytime fallback',
    'Dynamic A* · H₂ heuristic · λ = 50',
    'SoC · T_bat · T_pay · T_bus → nominal bands',
  ];

  let lineIdx = 0;
  let charIdx = 0;
  let deleting = false;
  let glitchFrames = 0;
  let pauseFrames = 0;

  function getGlitchChar() {
    return GIBBERISH[Math.floor(Math.random() * GIBBERISH.length)];
  }

  function tick() {
    const target = LINES[lineIdx];

    if (pauseFrames > 0) {
      pauseFrames--;
      setTimeout(tick, 50);
      return;
    }

    if (glitchFrames > 0) {
      // Show glitch characters for target length
      const glitchStr = target.split('').map((c, i) => {
        if (i < charIdx) return c;
        return Math.random() > 0.7 ? getGlitchChar() : c;
      }).join('').substring(0, charIdx + 3);
      el.textContent = glitchStr;
      glitchFrames--;
      setTimeout(tick, 40);
      return;
    }

    if (!deleting) {
      if (charIdx < target.length) {
        // Occasionally inject glitch frames mid-typing
        if (Math.random() < 0.04) { glitchFrames = 3; }
        el.textContent = target.substring(0, charIdx + 1);
        charIdx++;
        setTimeout(tick, charIdx === 1 ? 200 : (30 + Math.random() * 40));
      } else {
        // Pause at end, then start deleting
        pauseFrames = 60;
        deleting = true;
        setTimeout(tick, 50);
      }
    } else {
      if (charIdx > 0) {
        el.textContent = target.substring(0, charIdx - 1);
        charIdx--;
        setTimeout(tick, 18);
      } else {
        deleting = false;
        lineIdx = (lineIdx + 1) % LINES.length;
        pauseFrames = 8;
        setTimeout(tick, 50);
      }
    }
  }

  setTimeout(tick, 800);
})();

// ═══════════════════════════════════════════════════════════════════════════
// SCROLL REVEAL
// ═══════════════════════════════════════════════════════════════════════════
(function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  function observeAll() {
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }

  observeAll();

  // Re-observe when sections become active
  document.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => setTimeout(observeAll, 50));
  });
})();

// ═══════════════════════════════════════════════════════════════════════════
// NUMBER COUNTER ANIMATION
// ═══════════════════════════════════════════════════════════════════════════
(function initCounters() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseFloat(el.dataset.target || el.textContent);
      const suffix = el.dataset.suffix || '';
      const prefix = el.dataset.prefix || '';
      if (isNaN(target)) { observer.unobserve(el); return; }

      let current = 0;
      const step = target / 40;
      const timer = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = prefix + (Number.isInteger(target) ? Math.round(current) : current.toFixed(1)) + suffix;
        if (current >= target) clearInterval(timer);
      }, 30);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-target]').forEach(el => observer.observe(el));
})();

// ═══════════════════════════════════════════════════════════════════════════
// SECTION NAVIGATION (handles all nav pills and hero CTA buttons)
// ═══════════════════════════════════════════════════════════════════════════
function switchSection(name) {
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const pill = document.querySelector(`.pill[data-section="${name}"]`);
  const sec  = document.getElementById(`section-${name}`);
  if (pill) pill.classList.add('active');
  if (sec)  sec.classList.add('active');

  if (name === 'pipeline') {
    if (typeof startOrbitAnim === 'function') startOrbitAnim();
  } else {
    if (typeof stopOrbitAnim === 'function') stopOrbitAnim();
  }
  if (name === 'results') { if (typeof initResults === 'function') initResults(); }
  if (name === 'search')  { if (typeof resetSearch  === 'function') resetSearch(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.switchSection = switchSection;

// Attach click listeners to all pills
document.querySelectorAll('.pill').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.section) {
      switchSection(btn.dataset.section);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARALLAX on scroll (subtle, for hero elements)
// ═══════════════════════════════════════════════════════════════════════════
(function initParallax() {
  const metaBar = document.querySelector('.hero-meta-bar');
  const horizonLine = document.querySelector('.hero-horizon-line');

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (metaBar)     metaBar.style.transform     = `translateY(${y * 0.2}px)`;
    if (horizonLine) horizonLine.style.transform = `rotate(-8deg) translateY(${y * 0.15}px)`;
  }, { passive: true });
})();

// ═══════════════════════════════════════════════════════════════════════════
// BOUNCE ARROW CSS (add keyframe via JS for portability)
// ═══════════════════════════════════════════════════════════════════════════
(function addBounceKeyframe() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes bounce-arrow {
      0%, 100% { transform: translateY(0); opacity: 0.5; }
      50%       { transform: translateY(6px); opacity: 1; }
    }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
})();

// ═══════════════════════════════════════════════════════════════════════════
// HEADER: Add scroll-aware shadow/shrink
// ═══════════════════════════════════════════════════════════════════════════
(function initHeaderScroll() {
  const header = document.getElementById('site-header');
  if (!header) return;
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.style.background = 'rgba(0,0,0,0.88)';
      header.style.borderBottomColor = 'rgba(139,92,246,0.15)';
    } else {
      header.style.background = 'rgba(0,0,0,0.7)';
      header.style.borderBottomColor = 'rgba(255,255,255,0.06)';
    }
  }, { passive: true });
})();

// ═══════════════════════════════════════════════════════════════════════════
// GLITCH text effect on hover for logo
// ═══════════════════════════════════════════════════════════════════════════
(function initLogoGlitch() {
  const wordmark = document.querySelector('.logo-wordmark');
  if (!wordmark) return;
  const orig = wordmark.textContent;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let glitchInt = null;

  wordmark.addEventListener('mouseenter', () => {
    let iter = 0;
    clearInterval(glitchInt);
    glitchInt = setInterval(() => {
      wordmark.textContent = orig.split('').map((c, i) => {
        if (i < iter) return orig[i];
        return chars[Math.floor(Math.random() * chars.length)];
      }).join('');
      if (iter >= orig.length) {
        clearInterval(glitchInt);
        wordmark.textContent = orig;
      }
      iter += 0.5;
    }, 40);
  });

  wordmark.addEventListener('mouseleave', () => {
    clearInterval(glitchInt);
    wordmark.textContent = orig;
  });
})();

// ═══════════════════════════════════════════════════════════════════════════
// MATH TAB switching (copy from app.js pattern if not already handled)
// ═══════════════════════════════════════════════════════════════════════════
document.querySelectorAll('.math-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.math-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.math-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const pane = document.getElementById('mpane-' + btn.dataset.mtab);
    if (pane) pane.classList.add('active');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RESULTS metric tabs
// ═══════════════════════════════════════════════════════════════════════════
document.querySelectorAll('.m-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.m-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    if (typeof updateChart === 'function') updateChart(btn.dataset.metric);
  });
});

console.log('%c SAR UI v2.0 — Turion-Inspired Premium Space-Ops Dashboard ', 
  'background: #8b5cf6; color: #fff; font-family: monospace; font-size: 13px; padding: 4px 8px; border-radius: 4px;');
