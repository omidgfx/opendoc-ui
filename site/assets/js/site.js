/* OpenDoc UI site — theme, navigation, active links, footer year */
(function () {
    'use strict';

    var THEME_KEY = 'opendoc-site-theme';
    var root = document.documentElement;

    function systemDark() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function applyTheme(theme) {
        var resolved = theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme;
        root.setAttribute('data-theme', resolved);
        var buttons = document.querySelectorAll('[data-theme-choice]');
        Array.prototype.forEach.call(buttons, function (btn) {
            var active = btn.getAttribute('data-theme-choice') === theme;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function initTheme() {
        var stored = null;
        try { stored = localStorage.getItem(THEME_KEY); } catch (e) { /* private mode */ }
        var theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
        applyTheme(theme);

        var toggle = document.getElementById('theme-toggle');
        var menu = document.getElementById('theme-menu');
        if (toggle && menu) {
            toggle.addEventListener('click', function (event) {
                event.stopPropagation();
                menu.classList.toggle('open');
            });
            Array.prototype.forEach.call(menu.querySelectorAll('[data-theme-choice]'), function (btn) {
                btn.addEventListener('click', function () {
                    var choice = btn.getAttribute('data-theme-choice');
                    try { localStorage.setItem(THEME_KEY, choice); } catch (e) { /* ignore */ }
                    applyTheme(choice);
                    menu.classList.remove('open');
                });
            });
            document.addEventListener('click', function (event) {
                if (!menu.contains(event.target) && event.target !== toggle && !toggle.contains(event.target)) {
                    menu.classList.remove('open');
                }
            });
        }
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
                var current = null;
                try { current = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
                if (current === 'system' || !current) applyTheme('system');
            });
        }
    }

    function initNav() {
        var toggle = document.getElementById('nav-toggle');
        var links = document.getElementById('nav-links');
        if (!toggle || !links) return;
        toggle.addEventListener('click', function () {
            links.classList.toggle('open');
            toggle.setAttribute('aria-expanded', links.classList.contains('open') ? 'true' : 'false');
        });
        Array.prototype.forEach.call(links.querySelectorAll('a'), function (link) {
            link.addEventListener('click', function () { links.classList.remove('open'); });
        });
    }

    function initActiveNav() {
        var here = location.pathname.replace(/\/+$/, '') + '/';
        Array.prototype.forEach.call(document.querySelectorAll('.nav-links a, .subnav a'), function (a) {
            var href = a.getAttribute('href') || '';
            if (!href.startsWith('/') && !href.startsWith('http')) href = '/' + href;
            var target = href.split('#')[0].replace(/\/+$/, '') + '/';
            if (target === here || (target !== '/' && here.startsWith(target))) a.classList.add('active');
        });
    }

    function initYear() {
        var el = document.getElementById('year');
        if (el) el.textContent = String(new Date().getFullYear());
    }

    document.addEventListener('DOMContentLoaded', function () {
        initTheme();
        initNav();
        initActiveNav();
        initYear();
    });
})();
