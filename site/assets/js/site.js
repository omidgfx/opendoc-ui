/* OpenDoc UI marketing site — shared behavior */
(function () {
  'use strict';

  /* ---------- theme (light / dark / system) ---------- */
  var THEME_KEY = 'opendoc-site-theme';
  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  var themeBtn = document.getElementById('theme-btn');

  function stored() {
    try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { return 'system'; }
  }
  function apply(choice) {
    var dark = choice === 'dark' || (choice === 'system' && mql.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (themeBtn) {
      var icon = choice === 'light' ? 'ph-sun' : choice === 'dark' ? 'ph-moon' : 'ph-monitor';
      themeBtn.innerHTML = '<i class="ph ' + icon + '"></i>';
      themeBtn.setAttribute('title', 'Theme: ' + choice + ' (click to change)');
      themeBtn.setAttribute('aria-label', 'Theme: ' + choice + '. Click to change.');
    }
  }
  apply(stored());
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var order = ['light', 'dark', 'system'];
      var next = order[(order.indexOf(stored()) + 1) % order.length];
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      apply(next);
    });
  }
  if (mql.addEventListener) mql.addEventListener('change', function () { apply(stored()); });

  /* ---------- sticky header + scroll progress ---------- */
  var header = document.getElementById('site-header');
  var progress = document.querySelector('.scroll-progress');
  var onScroll = function () {
    if (header) header.classList.toggle('scrolled', window.scrollY > 8);
    if (progress) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- mobile nav ---------- */
  var toggle = document.getElementById('nav-toggle');
  var links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.firstElementChild.className = open ? 'ph ph-x' : 'ph ph-list';
    });
    document.addEventListener('click', function (e) {
      if (!links.contains(e.target) && !toggle.contains(e.target) && links.classList.contains('open')) {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.firstElementChild.className = 'ph ph-list';
      }
    });
  }

  /* ---------- scroll reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- stat count-up ---------- */
  var counters = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window && counters.length) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        cio.unobserve(entry.target);
        var el = entry.target;
        var target = parseInt(el.getAttribute('data-count'), 10);
        var start = null, dur = 1100;
        function tick(ts) {
          if (!start) start = ts;
          var p = Math.min((ts - start) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = String(Math.round(eased * target));
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---------- sticky TOC highlight (subpages) ---------- */
  var tocLinks = document.querySelectorAll('.doc-toc a[href^="#"]');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {}, sections = [];
    tocLinks.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var sec = document.getElementById(id);
      if (sec) { map[id] = a; sections.push(sec); }
    });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          tocLinks.forEach(function (a) { a.classList.remove('on'); });
          if (map[entry.target.id]) map[entry.target.id].classList.add('on');
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- live-demo iframe: lazy load + anti scroll-jump ----------
     The embedded SPA focuses an element when it finishes booting. Focusing
     inside an iframe makes the browser scroll the parent page to reveal it,
     which yanked first-time visitors past the hero.
     Strategy:
       - iframe src is only set when the stage nears the viewport
       - a rolling history of scroll positions lets us restore the position
         from BEFORE the steal (not after it, which was pointless)
       - a steal is: focus lands on the iframe while the pointer is not over
         it and there was no recent user input. An intentional click/tab into
         the demo disarms the guard permanently. */
  var demoFrame = document.querySelector('.stage-iframe[data-src]');
  if (demoFrame) {
    var lastInput = 0, overFrame = false, engaged = false, guardTimer = null;
    ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, function () { lastInput = Date.now(); }, { passive: true });
    });
    demoFrame.addEventListener('pointerenter', function () { overFrame = true; });
    demoFrame.addEventListener('pointerleave', function () { overFrame = false; });

    var hist = [[Date.now(), window.scrollX, window.scrollY]];
    var record = function () {
      hist.push([Date.now(), window.scrollX, window.scrollY]);
      if (hist.length > 80) hist.shift();
    };
    setInterval(record, 100);
    var posBefore = function (ms) {
      var cut = Date.now() - ms;
      for (var i = hist.length - 1; i >= 0; i--) if (hist[i][0] <= cut) return hist[i];
      return hist[0];
    };

    var disarm = function () {
      engaged = true;
      if (guardTimer) { clearInterval(guardTimer); guardTimer = null; }
    };
    var checkSteal = function () {
      if (engaged || document.activeElement !== demoFrame) return;
      var intentional = overFrame || (Date.now() - lastInput < 500);
      if (intentional) { disarm(); return; }
      /* focus was stolen: blur and restore the pre-steal position, instantly */
      var p = posBefore(400);
      try { demoFrame.blur(); } catch (e) {}
      try { window.focus(); } catch (e) {}
      var root = document.documentElement;
      var prev = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(p[1], p[2]);
      requestAnimationFrame(function () {
        window.scrollTo(p[1], p[2]);
        root.style.scrollBehavior = prev;
      });
    };

    var loadDemo = function () {
      if (demoFrame.src) return;
      var until = Date.now() + 25000;
      window.addEventListener('blur', function () { setTimeout(checkSteal, 0); });
      guardTimer = setInterval(function () {
        if (Date.now() > until) { disarm(); return; }
        checkSteal();
      }, 80);
      demoFrame.src = demoFrame.getAttribute('data-src');
    };
    if ('IntersectionObserver' in window) {
      var fio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { loadDemo(); fio.disconnect(); }
        });
      }, { threshold: 0.15 });
      fio.observe(demoFrame);
    } else {
      loadDemo();
    }
  }

  /* ---------- current year ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
