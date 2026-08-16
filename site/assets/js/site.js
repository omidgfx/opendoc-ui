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
     The embedded SPA can grab focus when it finishes booting, which makes
     the browser scroll the page down to the iframe (jumping past the hero).
     1) Only set src once the visitor actually scrolls the stage into view.
     2) If focus lands in the iframe without any user interaction, blur it
        and restore the scroll position. */
  var demoFrame = document.querySelector('.stage-iframe[data-src]');
  if (demoFrame) {
    var userActed = false;
    ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, function () { userActed = true; }, { passive: true, once: true });
    });
    var loadDemo = function () {
      if (demoFrame.src) return;
      demoFrame.src = demoFrame.getAttribute('data-src');
      var guardUntil = Date.now() + 15000;
      var guard = setInterval(function () {
        if (Date.now() > guardUntil) { clearInterval(guard); return; }
        if (!userActed && document.activeElement === demoFrame) {
          var x = window.scrollX, y = window.scrollY;
          demoFrame.blur();
          if (document.activeElement === demoFrame && document.activeElement.blur) document.activeElement.blur();
          window.scrollTo(x, y);
        }
      }, 120);
    };
    if ('IntersectionObserver' in window) {
      var fio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { loadDemo(); fio.disconnect(); }
        });
      }, { rootMargin: '120px 0px' });
      fio.observe(demoFrame);
    } else {
      loadDemo();
    }
  }

  /* ---------- current year ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
