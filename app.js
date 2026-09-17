/* Остров Октябрьский — рантайм лендинга.
   Ванильный JS без зависимостей: параллакс, появление блоков, счётчики,
   скроллспай, шапка, хронология с перетаскиванием, RU/EN и пасхалка. */
(function () {
  'use strict';

  var html = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // страховка из <head> больше не нужна: скрипт жив
  if (window.__revealSafety) clearTimeout(window.__revealSafety);

  /* ─────────── появление блоков ─────────── */

  var revealEls = Array.prototype.slice.call(
    document.querySelectorAll('[data-reveal],[data-reveal-x],[data-reveal-img]')
  );

  // задержка внутри одного родителя — блоки выходят «лесенкой»
  var groups = new Map();
  revealEls.forEach(function (el) {
    var p = el.parentElement;
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(el);
  });
  groups.forEach(function (list) {
    list.forEach(function (el, i) {
      if (list.length > 1) el.style.setProperty('--rd', Math.min(i, 6) * 70 + 'ms');
    });
  });

  function show(el) {
    el.classList.add('is-in');
    if (el.hasAttribute('data-count')) countUp(el);
    var nested = el.querySelectorAll('[data-count]');
    for (var i = 0; i < nested.length; i++) countUp(nested[i]);
  }

  if (reduced || !('IntersectionObserver' in window)) {
    revealEls.forEach(show);
  } else {
    var scroller = document.querySelector('.timeline-scroller');
    var inScroller = function (el) { return scroller && scroller.contains(el); };

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        show(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

    revealEls.forEach(function (el) { if (!inScroller(el)) io.observe(el); });

    // карточки хронологии живут в горизонтальной ленте — свой наблюдатель
    if (scroller) {
      var cards = Array.prototype.slice.call(scroller.querySelectorAll('[data-reveal-x]'));
      var railIO = null;
      var startRail = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        startRail.disconnect();
        railIO = new IntersectionObserver(function (entries2) {
          entries2.forEach(function (e) {
            if (!e.isIntersecting) return;
            show(e.target);
            railIO.unobserve(e.target);
          });
        }, { root: scroller, threshold: 0.15 });
        cards.forEach(function (c) { railIO.observe(c); });
      }, { threshold: 0.05 });
      startRail.observe(scroller);
    }
  }

  /* ─────────── счётчики ─────────── */

  function countUp(el) {
    if (el.__counted) return;
    el.__counted = true;
    var node = el.firstChild;
    while (node && node.nodeType !== 3) node = node.nextSibling;
    if (!node) return;
    var target = parseInt(node.nodeValue, 10);
    if (!isFinite(target)) return;
    if (reduced) return;

    var dur = 1100;
    var t0 = performance.now();
    function frame(now) {
      var p = Math.min(1, (now - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 4);
      node.nodeValue = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(frame);
      else node.nodeValue = String(target);
    }
    node.nodeValue = '0';
    requestAnimationFrame(frame);
  }

  /* ─────────── параллакс, прогресс, шапка ─────────── */

  var parallaxNodes = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  var progress = document.getElementById('progress');
  var header = document.querySelector('.site-header');
  var hint = document.querySelector('.scroll-hint');
  var heroMedia = document.querySelector('.hero-media');

  var pointerX = 0, pointerY = 0, targetX = 0, targetY = 0;
  var lastY = window.scrollY;
  var ticking = false;
  var idleFrames = 0;

  function tick() {
    var vh = window.innerHeight;

    if (!reduced) {
      pointerX += (targetX - pointerX) * 0.07;
      pointerY += (targetY - pointerY) * 0.07;

      for (var i = 0; i < parallaxNodes.length; i++) {
        var node = parallaxNodes[i];
        var r = node.getBoundingClientRect();
        if (r.bottom < -240 || r.top > vh + 240) continue;
        var img = node.tagName === 'IMG' ? node : node.querySelector('img');
        if (!img) continue;
        var k = parseFloat(node.getAttribute('data-parallax')) || 0.06;
        var d = (r.top + r.height / 2 - vh / 2) * k;
        var mx = node === heroMedia ? pointerX * 14 : 0;
        var my = node === heroMedia ? pointerY * 10 : 0;
        img.style.transform =
          'translate3d(' + mx.toFixed(1) + 'px,' + (-d + my).toFixed(1) + 'px,0)';
      }
    }

    if (progress) {
      var max = html.scrollHeight - window.innerHeight;
      var p = max > 0 ? (window.scrollY / max) * 100 : 0;
      progress.style.width = p.toFixed(2) + '%';
    }

    if (header) {
      var y = window.scrollY;
      header.classList.toggle('is-solid', y > 40);
      var goingDown = y > lastY + 4;
      var goingUp = y < lastY - 4;
      if (goingDown && y > 260) header.classList.add('is-hidden');
      else if (goingUp || y < 120) header.classList.remove('is-hidden');
      if (Math.abs(y - lastY) > 3) lastY = y;
      syncRailTop();
    }

    if (hint) hint.classList.toggle('is-gone', window.scrollY > 80);
  }

  function syncRailTop() {
    if (!header) return;
    var hidden = header.classList.contains('is-hidden');
    html.style.setProperty('--rail-top', hidden ? '0px' : header.offsetHeight + 'px');
  }

  function loop() {
    tick();
    var settled = Math.abs(targetX - pointerX) < 0.002 && Math.abs(targetY - pointerY) < 0.002;
    idleFrames = settled ? idleFrames + 1 : 0;
    if (idleFrames > 6) { ticking = false; return; }
    requestAnimationFrame(loop);
  }

  function request() {
    idleFrames = 0;
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(loop);
  }

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { syncRailTop(); request(); }, { passive: true });

  if (!reduced && window.matchMedia('(hover: hover)').matches) {
    window.addEventListener('pointermove', function (e) {
      targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetY = (e.clientY / window.innerHeight - 0.5) * 2;
      request();
    }, { passive: true });
  }

  syncRailTop();
  request();

  /* ─────────── скроллспай: рейка объектов и меню ─────────── */

  var spyLinks = Array.prototype.slice.call(document.querySelectorAll('[data-spy]'));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-link'));

  if ('IntersectionObserver' in window && spyLinks.length) {
    var activeId = null;
    var spyIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) setActive(e.target.id);
      });
    }, { rootMargin: '-25% 0px -60% 0px' });

    spyLinks.forEach(function (a) {
      var el = document.getElementById(a.getAttribute('data-spy'));
      if (el) spyIO.observe(el);
    });

    var setActive = function (id) {
      if (activeId === id) return;
      activeId = id;
      spyLinks.forEach(function (a) {
        var on = a.getAttribute('data-spy') === id;
        a.classList.toggle('is-active', on);
        if (!on || !a.parentElement) return;
        var p = a.parentElement;
        var target = a.offsetLeft - 24;
        if (Math.abs(p.scrollLeft - target) > 8) {
          p.scrollTo({ left: target, behavior: reduced ? 'auto' : 'smooth' });
        }
      });
    };
  }

  if ('IntersectionObserver' in window && navLinks.length) {
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-current', a.getAttribute('href') === '#' + e.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    navLinks.forEach(function (a) {
      var el = document.querySelector(a.getAttribute('href'));
      if (el) navIO.observe(el);
    });
  }

  /* ─────────── хронология: тянем мышью ─────────── */

  var strip = document.querySelector('.timeline-scroller');
  if (strip) {
    var dragging = false, startX = 0, startLeft = 0, moved = 0;

    strip.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return; // на тач-устройствах хватает нативного скролла
      dragging = true;
      moved = 0;
      startX = e.clientX;
      startLeft = strip.scrollLeft;
      strip.classList.add('is-dragging');
      strip.setPointerCapture(e.pointerId);
    });

    strip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      strip.scrollLeft = startLeft - dx;
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      strip.addEventListener(ev, function () {
        dragging = false;
        strip.classList.remove('is-dragging');
      });
    });

    strip.addEventListener('click', function (e) {
      if (moved > 6) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  /* ─────────── язык RU / EN ─────────── */

  var langBtn = document.getElementById('langBtn');
  var current = 'ru';

  function applyLang(lang) {
    var nodes = document.querySelectorAll('[data-en]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.hasAttribute('data-ru')) el.setAttribute('data-ru', el.textContent);
      el.textContent = lang === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-ru');
    }
    if (langBtn) {
      langBtn.textContent = lang === 'en' ? 'RU' : 'EN';
      langBtn.setAttribute('aria-label', lang === 'en' ? 'Переключить на русский' : 'Switch to English');
    }
    html.setAttribute('lang', lang);
    current = lang;
    try { localStorage.setItem('oo-lang', lang); } catch (err) { /* приватный режим */ }
  }

  function switchLang(lang) {
    if (lang === current) return;
    if (reduced) { applyLang(lang); return; }
    document.body.classList.add('is-swapping');
    setTimeout(function () {
      applyLang(lang);
      document.body.classList.remove('is-swapping');
    }, 170);
  }

  if (langBtn) {
    langBtn.addEventListener('click', function () {
      switchLang(current === 'ru' ? 'en' : 'ru');
    });
  }

  var saved = null;
  try { saved = localStorage.getItem('oo-lang'); } catch (err) { /* нет доступа */ }
  var fromQuery = /[?&]lang=en\b/.test(location.search) ? 'en' : null;
  var wanted = fromQuery || saved;
  if (wanted === 'en') applyLang('en');

  /* ─────────── пасхалка ─────────── */

  var egg = document.getElementById('egg');
  var eggDot = document.getElementById('eggDot');

  function openEgg() {
    if (!egg || egg.classList.contains('is-open')) return;
    egg.classList.add('is-open');
    var text = egg.querySelector('.egg-text');
    if (text) text.setAttribute('aria-hidden', 'false');
    if (reduced) return;

    for (var i = 0; i < 7; i++) {
      var flea = document.createElement('span');
      flea.className = 'flea';
      flea.style.left = (12 + Math.random() * 76) + '%';
      flea.style.top = (Math.random() * 70) + '%';
      flea.style.animationDelay = (Math.random() * 1.2).toFixed(2) + 's';
      flea.style.animationDuration = (1.2 + Math.random() * 1.1).toFixed(2) + 's';
      egg.appendChild(flea);
    }
    setTimeout(function () {
      var fleas = egg.querySelectorAll('.flea');
      for (var j = 0; j < fleas.length; j++) fleas[j].remove();
    }, 9000);
  }

  function closeEgg() {
    if (!egg) return;
    egg.classList.remove('is-open');
    var fleas = egg.querySelectorAll('.flea');
    for (var j = 0; j < fleas.length; j++) fleas[j].remove();
  }

  if (eggDot) {
    eggDot.addEventListener('click', function () {
      if (egg.classList.contains('is-open')) closeEgg();
      else openEgg();
    });
  }

  // konami: ↑↑↓↓←→←→BA
  var konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
  var step = 0;
  window.addEventListener('keydown', function (e) {
    step = e.keyCode === konami[step] ? step + 1 : 0;
    if (step === konami.length) {
      step = 0;
      openEgg();
      if (egg) egg.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }
  });

  if (window.console && console.log) {
    console.log(
      '%c Остров Октябрьский %c точка · внизу страницы ',
      'background:#d19a5c;color:#0b0c0e;padding:3px 6px;font-family:monospace',
      'background:#14161a;color:#a9a7a1;padding:3px 6px;font-family:monospace'
    );
  }

  /* ─────────── старт ─────────── */

  function ready() {
    html.classList.add('is-loaded');
    syncRailTop();
    request();

    // цифры первого экрана не ждут скролла — они уже видны
    var heroCounts = document.querySelectorAll('#top [data-count]');
    setTimeout(function () {
      for (var i = 0; i < heroCounts.length; i++) countUp(heroCounts[i]);
    }, reduced ? 0 : 700);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    requestAnimationFrame(ready);
  } else {
    document.addEventListener('DOMContentLoaded', function () { requestAnimationFrame(ready); });
  }
})();
