/**
 * Villa Happ — Cinematic motion engine
 *
 * - Lenis smooth scroll
 * - Loader fade
 * - Hero parallax + entrance
 * - Manifesto word-by-word fill on scroll
 * - Heritage horizontal pinned scroll (poezabride-style)
 * - Spotlight image parallax
 * - Scroll reveals
 * - Custom cursor follower (fctrylab-style)
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

// Mobiel: URL-balk verschijnt/verdwijnt tijdens scroll; zonder dit springen pins
ScrollTrigger.config({ ignoreMobileResize: true });

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDesktop = window.matchMedia('(min-width: 901px)').matches;
const hasHover = window.matchMedia('(hover: hover)').matches;

// Markeer reduced-motion zodat CSS de heritage-scroll vlak legt + loader verbergt
if (reduce) document.documentElement.classList.add('vh-reduced');

let lenis: Lenis | null = null;

/* ---------- Lenis ---------- */
function initLenis() {
  if (reduce) return;
  lenis = new Lenis({
    duration: 1.15,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis!.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ---------- Loader (jaarteller 1960 → 2026) ---------- */
function initLoader() {
  const loader = document.getElementById('vh-loader');
  const hero = document.getElementById('vh-hero');
  if (!loader) { hero?.classList.add('is-ready'); return; }
  const bar = loader.querySelector('.vh-loader-bar span') as HTMLElement | null;
  const yearEl = loader.querySelector('[data-loader-year]') as HTMLElement | null;

  function dismiss() {
    if (loader!.classList.contains('is-done')) return;
    if (bar) bar.style.width = '100%';
    if (yearEl) yearEl.textContent = '2026';
    loader!.classList.add('is-done');
    hero?.classList.add('is-ready');
    setTimeout(() => loader!.remove(), 600);
  }

  // Snel: vul progressbar + tik de jaren op; dismiss zodra pagina geladen is
  let p = 0;
  const iv = setInterval(() => {
    p = Math.min(95, p + 22);
    if (bar) bar.style.width = p + '%';
    if (yearEl) yearEl.textContent = String(1960 + Math.round((p / 95) * 66));
  }, 60);

  const finish = () => { clearInterval(iv); dismiss(); };
  if (document.readyState === 'complete') {
    setTimeout(finish, 250);
  } else {
    window.addEventListener('load', () => setTimeout(finish, 150));
    // Failsafe: nooit langer dan 0.9s blijven hangen
    setTimeout(finish, 900);
  }
}

/* ---------- Hero: cinematic pull-back naar archief-polaroid ---------- */
function initHeroCinema() {
  if (reduce) return;
  const hero = document.getElementById('vh-hero');
  if (!hero) return;
  const media = hero.querySelector('.vh-hero-media') as HTMLElement | null;
  const img = hero.querySelector('.vh-hero-media img') as HTMLElement | null;
  const stage = hero.querySelector('.vh-hero-stage') as HTMLElement | null;
  const chrome = hero.querySelector('.vh-hero-chrome') as HTMLElement | null;
  const scrim = hero.querySelector('.vh-hero-scrim') as HTMLElement | null;

  if (!media || !img) return;

  if (!isDesktop) {
    // Mobiel: eigen pinned cinema. Titelregels schuiven door hun masker weg,
    // de foto klikt in een afgeronde archiefkaart, achtergrond wordt papier.
    gsap.set(media, { clipPath: 'inset(0% 0% 0% 0% round 0px)' });
    const lines = hero.querySelectorAll<HTMLElement>('.vh-hero-title .vh-line > span');
    const bottom = hero.querySelector<HTMLElement>('.vh-hero-bottom');

    // De entree-animatie draait op CSS-transities; zodra de scrub begint
    // moeten die uit, anders vertragen ze elke scrubframe (mushy gevoel).
    let entranceCleared = false;
    const clearEntrance = () => {
      if (entranceCleared) return;
      entranceCleared = true;
      lines.forEach((s) => { s.style.transition = 'none'; });
      if (bottom) bottom.style.transition = 'none';
    };

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: hero,
        pin: true,
        scrub: 0.8,
        end: '+=110%',
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => { if (self.progress > 0.02) clearEntrance(); },
      },
    });

    tl.to(img, { yPercent: -6, scale: 1.08, ease: 'none', duration: 1 }, 0);
    if (lines.length) tl.to(lines, { yPercent: -130, duration: 0.3, stagger: 0.05, ease: 'power1.in' }, 0);
    tl.to('.vh-hero-bottom', { opacity: 0, y: -30, pointerEvents: 'none', duration: 0.22, ease: 'power1.in' }, 0)
      .to(['.vh-viewfinder', '.vh-hero-scroll-cue', '.vh-hero-corner'], { opacity: 0, duration: 0.16 }, 0.05)
      .to(media, { clipPath: 'inset(11% 7% 27% 7% round 18px)', duration: 0.5, ease: 'power2.inOut' }, 0.3);
    if (scrim) tl.to(scrim, { opacity: 0.2, duration: 0.4 }, 0.3);
    tl.to(hero, { backgroundColor: '#F4EEE3', duration: 0.35, ease: 'none' }, 0.38);
    if (chrome) tl.fromTo(chrome, { opacity: 0 }, { opacity: 1, duration: 0.18 }, 0.62);
    return;
  }

  if (!stage) return;

  gsap.set(media, { clipPath: 'inset(0% 0% 0% 0% round 0px)' });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: hero,
      pin: true,
      scrub: 1,
      end: '+=130%',
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });

  tl.to(img, { yPercent: -8, ease: 'none', duration: 1 }, 0)
    .to('.vh-hero-inner', { opacity: 0, y: -60, pointerEvents: 'none', duration: 0.22, ease: 'power1.in' }, 0)
    .to(['.vh-viewfinder', '.vh-seal', '.vh-hero-scroll-cue'], { opacity: 0, duration: 0.15 }, 0.04)
    .to(media, {
      clipPath: 'inset(15% 31% 23% 31% round 14px)',
      duration: 0.5,
      ease: 'power2.inOut',
    }, 0.22)
    .to(scrim, { opacity: 0, duration: 0.4 }, 0.22)
    .to(stage, { rotate: -3, duration: 0.5, ease: 'power2.inOut' }, 0.22)
    .to(hero, { backgroundColor: '#F4EEE3', duration: 0.35, ease: 'none' }, 0.3)
    .fromTo(chrome, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.52);
}

/* ---------- Manifesto word fill ---------- */
function initManifesto() {
  const text = document.querySelector('.vh-manifesto-text');
  if (!text) return;
  const words = text.querySelectorAll('.vh-word');
  // Bewust geen reduce-guard: woord-vulling is puur kleur, geen beweging.
  ScrollTrigger.create({
    trigger: text,
    start: 'top 75%',
    end: 'bottom 55%',
    scrub: true,
    onUpdate: (self) => {
      const lit = Math.floor(self.progress * words.length);
      words.forEach((w, i) => w.classList.toggle('is-lit', i <= lit));
    },
  });
}

/* ---------- Heritage horizontal scroll ---------- */
function initHeritage() {
  if (reduce || !isDesktop) return;
  const section = document.querySelector('.vh-heritage');
  const track = document.querySelector('.vh-heritage-track') as HTMLElement | null;
  const progress = document.querySelector('.vh-heritage-progress span') as HTMLElement | null;
  if (!section || !track) return;

  const getScrollAmount = () => track.scrollWidth - window.innerWidth;

  const tween = gsap.to(track, {
    x: () => -getScrollAmount(),
    ease: 'none',
    scrollTrigger: {
      trigger: section,
      pin: true,
      scrub: 1,
      end: () => '+=' + getScrollAmount(),
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        if (progress) progress.style.width = self.progress * 100 + '%';
      },
    },
  });

  // Subtle parallax on heritage images
  gsap.utils.toArray<HTMLElement>('.vh-heritage-media img').forEach((img) => {
    gsap.fromTo(img, { scale: 1.15 }, {
      scale: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: img.closest('.vh-heritage-panel'),
        containerAnimation: tween,
        start: 'left right',
        end: 'right left',
        scrub: true,
      },
    });
  });
}

/* ---------- Heritage mobiel: swipebare story-carousel ---------- */
function initHeritageMobile() {
  if (isDesktop) return;
  const track = document.querySelector<HTMLElement>('.vh-heritage-track');
  const progress = document.querySelector<HTMLElement>('.vh-heritage-progress span');
  if (!track) return;
  const panels = Array.from(track.querySelectorAll<HTMLElement>('.vh-heritage-panel'));

  // Panel in beeld -> jaartal en titel komen tot leven (CSS doet de animatie)
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => en.target.classList.toggle('is-active', en.isIntersecting));
  }, { root: track, threshold: 0.55 });
  panels.forEach((p) => io.observe(p));

  // Voortgangsbalk + parallax in de beelden tijdens het swipen
  let raf = 0;
  const update = () => {
    raf = 0;
    const max = track.scrollWidth - track.clientWidth;
    if (progress && max > 0) progress.style.width = (track.scrollLeft / max) * 100 + '%';
    if (reduce) return;
    const vw = window.innerWidth;
    panels.forEach((p) => {
      const img = p.querySelector<HTMLElement>('.vh-heritage-media img');
      if (!img) return;
      const r = p.getBoundingClientRect();
      const off = (r.left + r.width / 2 - vw / 2) / vw; // -1 .. 1 t.o.v. schermmidden
      img.style.transform = `translateX(${(off * -26).toFixed(1)}px) scale(1.12)`;
    });
  };
  track.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  update();
}

/* ---------- Gyroscoop-diepte: kantel de telefoon, lagen bewegen mee ---------- */
function initGyro() {
  if (isDesktop || reduce || !('DeviceOrientationEvent' in window)) return;
  // iOS vraagt een permissieprompt voor deze events; die tonen we bewust niet.
  // Zonder toestemming vuurt de listener simpelweg nooit (graceful no-op).
  const targets = [
    document.querySelector<HTMLElement>('.vh-hero-media img'),
    document.querySelector<HTMLElement>('[data-cine-img]'),
  ].filter(Boolean) as HTMLElement[];
  if (!targets.length) return;

  const movers = targets.map((t) => ({
    x: gsap.quickTo(t, 'x', { duration: 0.6, ease: 'power2.out' }),
    y: gsap.quickTo(t, 'y', { duration: 0.6, ease: 'power2.out' }),
  }));

  let base: { b: number; g: number } | null = null;
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null || e.beta == null) return;
    if (!base) base = { b: e.beta, g: e.gamma }; // hoe je 'm vasthoudt = neutraal
    const dx = Math.max(-1, Math.min(1, (e.gamma - base.g) / 28));
    const dy = Math.max(-1, Math.min(1, (e.beta - base.b) / 28));
    movers.forEach((m) => { m.x(dx * 14); m.y(dy * 10); });
  }, { passive: true });
}

/* ---------- Cinematic takeover: cap groeit naar fullscreen ---------- */
function initCinematic() {
  const section = document.getElementById('vh-cine');
  if (!section) return;
  if (reduce) {
    section.classList.add('is-static');
    return;
  }
  const media = section.querySelector('[data-cine-media]') as HTMLElement | null;
  const img = section.querySelector('[data-cine-img]') as HTMLElement | null;
  const scrim = section.querySelector('[data-cine-scrim]') as HTMLElement | null;
  const overlay = section.querySelector('[data-cine-overlay]') as HTMLElement | null;
  const intro1 = section.querySelector('[data-cine-intro="1"]') as HTMLElement | null;
  const intro2 = section.querySelector('[data-cine-intro="2"]') as HTMLElement | null;
  if (!media || !img) return;

  // Schaal die nodig is om het kaartje het hele scherm te laten vullen
  const fullScale = () => {
    const r = media.getBoundingClientRect();
    const w = r.width / (gsap.getProperty(media, 'scaleX') as number || 1);
    const h = r.height / (gsap.getProperty(media, 'scaleY') as number || 1);
    return Math.max(window.innerWidth / w, window.innerHeight / h) * 1.02;
  };

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      pin: true,
      scrub: 1,
      end: isDesktop ? '+=180%' : '+=150%',
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        overlay?.classList.toggle('is-on', self.progress > 0.8);
      },
    },
  });

  // Tekstlagen driften omhoog op verschillende snelheden (diepte)
  if (intro1) tl.to(intro1, { yPercent: isDesktop ? -340 : -220, opacity: 0, duration: 0.34, ease: 'power1.in' }, 0);
  if (intro2) tl.to(intro2, { yPercent: isDesktop ? -160 : -110, opacity: 0, duration: 0.42, ease: 'power1.in' }, 0);

  // Het beeld neemt het scherm over; de foto erin zoomt tegengesteld
  tl.to(media, { scale: fullScale, borderRadius: 0, duration: 0.62, ease: 'power2.inOut' }, 0.10)
    .fromTo(img, { scale: 1.18 }, { scale: 1, duration: 0.62, ease: 'power2.inOut' }, 0.10);

  if (scrim) tl.to(scrim, { opacity: 1, duration: 0.22 }, 0.56);
  if (overlay) {
    tl.to(overlay, { opacity: 1, duration: 0.2 }, 0.72)
      .fromTo(overlay.children, { y: 44 }, { y: 0, duration: 0.26, stagger: 0.05, ease: 'power2.out' }, 0.72);
  }
}

/* ---------- Drift: kolommen tegengesteld, woord kruist ---------- */
function initDrift() {
  if (reduce) return;
  const section = document.querySelector('.vh-drift');
  if (!section) return;
  const colA = section.querySelector('[data-drift="a"]');
  const colB = section.querySelector('[data-drift="b"]');
  const word = section.querySelector('[data-drift-word]') as HTMLElement | null;
  const st = { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } as const;

  if (colA) gsap.fromTo(colA,
    { y: () => window.innerHeight * 0.12 },
    { y: () => -window.innerHeight * 0.20, ease: 'none', scrollTrigger: { ...st } });
  if (colB) gsap.fromTo(colB,
    { y: () => -window.innerHeight * 0.16 },
    { y: () => window.innerHeight * 0.14, ease: 'none', scrollTrigger: { ...st } });
  if (word) {
    gsap.set(word, { xPercent: -50, yPercent: -50 });
    gsap.fromTo(word,
      { x: () => window.innerWidth * 0.12 },
      { x: () => -window.innerWidth * 0.12, ease: 'none', scrollTrigger: { ...st } });
  }
}

/* ---------- Campagnemoment: monumentale reveal + trage parallax ---------- */
function initCampaign() {
  const section = document.getElementById('vh-campaign');
  if (!section) return;

  // Reveal van de monumentale regels via IntersectionObserver: gegarandeerd,
  // los van de scroll-engine. De CSS doet de maskeranimatie.
  if (reduce) {
    section.classList.add('is-revealed');
  } else {
    const reveal = () => section.classList.add('is-revealed');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { reveal(); io.disconnect(); }
      });
    }, { threshold: 0.25 });
    io.observe(section);
    // Failsafe: als de IO ooit faalt, mag de kernregel nooit onzichtbaar blijven.
    // Zodra de sectie binnen bereik scrolt, onthullen we sowieso.
    const onScroll = () => {
      const r = section.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.85 && r.bottom > 0) {
        reveal();
        window.removeEventListener('scroll', onScroll);
        io.disconnect();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Trage parallax-drift op het beeld (visueel; faalt het, dan staat het stil)
  const media = section.querySelector('[data-campaign-media]') as HTMLElement | null;
  if (!reduce && media) {
    gsap.fromTo(media, { yPercent: -5 }, {
      yPercent: 5,
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  }
}

/* ---------- Hero muis-diepte: lagen reageren op de cursor ---------- */
function initHeroMouse() {
  if (reduce || !isDesktop || !hasHover) return;
  const hero = document.getElementById('vh-hero');
  if (!hero) return;
  const img = hero.querySelector('.vh-hero-media img') as HTMLElement | null;
  const inner = hero.querySelector('.vh-hero-inner') as HTMLElement | null;
  if (!img) return;

  const imgX = gsap.quickTo(img, 'x', { duration: 0.9, ease: 'power3.out' });
  const innerX = inner ? gsap.quickTo(inner, 'x', { duration: 1.2, ease: 'power3.out' }) : null;

  hero.addEventListener('mousemove', (e) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1; // -1 .. 1
    imgX(nx * -16);
    innerX?.(nx * 8);
  });
  hero.addEventListener('mouseleave', () => { imgX(0); innerX?.(0); });
}

/* ---------- Kinetic wordmark horizontal scroll ---------- */
function initKinetic() {
  if (reduce) return;
  const row = document.querySelector('[data-kinetic-row]') as HTMLElement | null;
  if (!row) return;
  const overflow = row.scrollWidth - window.innerWidth;
  gsap.fromTo(row, { x: 0 }, {
    x: -overflow,
    ease: 'none',
    scrollTrigger: {
      trigger: '.vh-kinetic',
      start: 'top bottom',
      end: 'bottom top',
      scrub: 1,
      invalidateOnRefresh: true,
    },
  });
}

/* ---------- Yearmask: foto pant binnenin de letters ---------- */
function initYearMask() {
  const el = document.querySelector<HTMLElement>('[data-yearmask]');
  if (!el) return;
  if (reduce) { el.style.backgroundPosition = '50% 50%'; return; }
  gsap.fromTo(el, { backgroundPosition: '50% 18%' }, {
    backgroundPosition: '50% 82%',
    ease: 'none',
    scrollTrigger: { trigger: '.vh-yearmask', start: 'top bottom', end: 'bottom top', scrub: 1 },
  });
}

/* ---------- Filmstrip: sleepbaar + auto-drift + inertia ---------- */
function initFilmstrip() {
  const wrap = document.querySelector<HTMLElement>('.vh-film');
  const track = document.querySelector<HTMLElement>('[data-film-track]');
  if (!wrap || !track) return;
  if (reduce) return;

  const drift = -0.45;
  let x = 0;
  let vx = drift;
  let dragging = false;
  let lastX = 0;

  wrap.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    vx = 0;
    wrap.setPointerCapture(e.pointerId);
    wrap.classList.add('is-grabbing');
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    x += dx;
    vx = dx;
  });
  const release = () => { dragging = false; wrap.classList.remove('is-grabbing'); };
  wrap.addEventListener('pointerup', release);
  wrap.addEventListener('pointercancel', release);
  wrap.addEventListener('pointerleave', () => { if (dragging) release(); });

  function loop() {
    if (!dragging) {
      x += vx;
      vx += (drift - vx) * 0.035;
    }
    const half = track!.scrollWidth / 2;
    if (half > 0) {
      x = ((x % half) + half) % half;
      track!.style.transform = `translate3d(${x - half}px, 0, 0)`;
    }
    const skew = Math.max(-5, Math.min(5, vx * 0.32));
    track!.style.setProperty('--film-skew', skew.toFixed(2) + 'deg');
    requestAnimationFrame(loop);
  }
  loop();
}

/* ---------- Spin-stickers (scroll-driven rotatie) ---------- */
function initSpin() {
  if (reduce) return;
  document.querySelectorAll<HTMLElement>('[data-spin]').forEach((el) => {
    gsap.to(el, {
      rotation: 200,
      ease: 'none',
      scrollTrigger: {
        trigger: el.closest('section') || el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1,
      },
    });
  });
}

/* ---------- Scroll reveals ---------- */
function initReveals() {
  const els = document.querySelectorAll('.vh-reveal, .vh-reveal-img');
  if (reduce) { els.forEach((el) => el.classList.add('is-visible')); return; }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); obs.unobserve(entry.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  els.forEach((el) => obs.observe(el));
}

/* ---------- Counters ---------- */
function initCounters() {
  const counters = document.querySelectorAll<HTMLElement>('[data-count]');
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target as HTMLElement;
      const target = parseInt(el.dataset.count || '0', 10);
      // Tellers tikken ook onder reduced motion: waardeverandering, geen beweging.
      let start: number | null = null;
      const step = (ts: number) => {
        if (start === null) start = ts;
        const prog = Math.min((ts - start) / 1600, 1);
        el.textContent = String(Math.round(target * ease(prog)));
        if (prog < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      obs.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach((c) => obs.observe(c));
}

/* ---------- Custom cursor ---------- */
function initCursor() {
  if (!hasHover) return;
  const cursor = document.createElement('div');
  cursor.className = 'vh-cursor';
  cursor.innerHTML = '<span class="vh-cursor-label">View</span>';
  document.body.appendChild(cursor);

  let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  let tx = cx, ty = cy;
  let active = false;

  window.addEventListener('mousemove', (e) => {
    tx = e.clientX; ty = e.clientY;
    if (!active) { active = true; cursor.classList.add('is-active'); }
  });

  function render() {
    cx += (tx - cx) * 0.18;
    cy += (ty - cy) * 0.18;
    cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
    requestAnimationFrame(render);
  }
  render();

  const label = cursor.querySelector('.vh-cursor-label') as HTMLElement;
  const hoverTargets = document.querySelectorAll<HTMLElement>('a, button, .vh-shop-card-media, .vh-film, [data-cursor]');
  hoverTargets.forEach((el) => {
    el.addEventListener('mouseenter', () => {
      label.textContent = el.dataset.cursor || 'View';
      cursor.classList.add('is-hover');
    });
    el.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
  });
}

/* ---------- Magnetic ---------- */
function initMagnetic() {
  if (reduce || !hasHover) return;
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    let b: DOMRect;
    el.addEventListener('mouseenter', () => { b = el.getBoundingClientRect(); });
    el.addEventListener('mousemove', (e) => {
      if (!b) b = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - (b.left + b.width / 2)) * 0.25}px, ${(e.clientY - (b.top + b.height / 2)) * 0.25}px)`;
    });
    el.addEventListener('mouseleave', () => { el.style.transform = ''; });
  });
}

/* ---------- Countdown ---------- */
function initCountdown() {
  const el = document.querySelector<HTMLElement>('[data-countdown]');
  if (!el) return;
  const target = parseInt(el.dataset.countdown || '0', 10) * 1000;
  if (!target || target <= Date.now()) { el.style.display = 'none'; return; }
  const d = el.querySelector('[data-cd-days]') as HTMLElement;
  const h = el.querySelector('[data-cd-hours]') as HTMLElement;
  const m = el.querySelector('[data-cd-minutes]') as HTMLElement;
  const s = el.querySelector('[data-cd-seconds]') as HTMLElement;
  const pad = (n: number) => String(n).padStart(2, '0');
  const tick = () => {
    const diff = target - Date.now();
    if (diff <= 0) { el.style.display = 'none'; clearInterval(t); return; }
    if (d) d.textContent = pad(Math.floor(diff / 86400000));
    if (h) h.textContent = pad(Math.floor((diff % 86400000) / 3600000));
    if (m) m.textContent = pad(Math.floor((diff % 3600000) / 60000));
    if (s) s.textContent = pad(Math.floor((diff % 60000) / 1000));
  };
  tick();
  const t = setInterval(tick, 1000);
}

/* ---------- Scroll-velocity marquee (reactief skew) ---------- */
function initMarqueeVelocity() {
  if (reduce) return;
  const items = gsap.utils.toArray<HTMLElement>('.vh-marquee-item');
  if (!items.length) return;
  let skew = 0;
  let target = 0;
  if (lenis) {
    lenis.on('scroll', ({ velocity }: { velocity: number }) => {
      target = Math.max(-10, Math.min(10, velocity * 0.5));
    });
  } else {
    let last = window.scrollY;
    window.addEventListener('scroll', () => {
      const v = window.scrollY - last; last = window.scrollY;
      target = Math.max(-10, Math.min(10, v * 0.3));
    }, { passive: true });
  }
  function loop() {
    skew += (target - skew) * 0.1;
    target *= 0.9;
    items.forEach((i) => { i.style.transform = `skewX(${skew}deg)`; });
    requestAnimationFrame(loop);
  }
  loop();
}

/* ---------- 3D tilt op productcards ---------- */
function initTilt() {
  if (reduce || !hasHover) return;
  document.querySelectorAll<HTMLElement>('.vh-shop-card').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(1400px) rotateY(${px * 5}deg) rotateX(${-py * 5}deg) translateZ(8px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

/* ---------- Hero title skew op scroll-velocity ---------- */
function initHeroSkew() {
  if (reduce) return;
  const title = document.querySelector('.vh-hero-title') as HTMLElement | null;
  if (!title || !lenis) return;
  let cur = 0, tgt = 0;
  lenis.on('scroll', ({ velocity }: { velocity: number }) => {
    tgt = Math.max(-4, Math.min(4, velocity * 0.15));
  });
  function loop() {
    cur += (tgt - cur) * 0.1; tgt *= 0.9;
    title!.style.transform = `skewY(${cur * 0.3}deg)`;
    requestAnimationFrame(loop);
  }
  loop();
}

function init() {
  // Eén falende init mag nooit de rest van de motion-keten slopen.
  // De eerste fout bewaren we voor de ?vh-debug overlay.
  const safe = (name: string, fn: () => void) => {
    try { fn(); } catch (e) {
      const w = window as unknown as { __vhErr?: string };
      if (!w.__vhErr) w.__vhErr = name + ': ' + (e instanceof Error ? e.message : String(e));
    }
  };
  safe('lenis', initLenis);
  safe('loader', initLoader);
  safe('reveals', initReveals);
  safe('counters', initCounters);
  safe('countdown', initCountdown);
  safe('heroCinema', initHeroCinema);
  safe('manifesto', initManifesto);
  safe('heritage', initHeritage);
  safe('heritageMobile', initHeritageMobile);
  safe('campaign', initCampaign);
  safe('cinematic', initCinematic);
  safe('drift', initDrift);
  safe('heroMouse', initHeroMouse);
  safe('gyro', initGyro);
  safe('yearMask', initYearMask);
  safe('kinetic', initKinetic);
  safe('filmstrip', initFilmstrip);
  safe('spin', initSpin);
  safe('cursor', initCursor);
  safe('magnetic', initMagnetic);
  safe('marqueeVelocity', initMarqueeVelocity);
  safe('tilt', initTilt);
  safe('heroSkew', initHeroSkew);
  (window as unknown as { __vhMotion?: boolean }).__vhMotion = true;
  // Refresh after fonts/images settle
  window.addEventListener('load', () => setTimeout(() => ScrollTrigger.refresh(), 200));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
