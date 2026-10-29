/*!
 * Lampa Gamepad Plugin v2
 * Навигация по Lampa геймпадом (Xbox Series X|S / One, стандартная раскладка)
 *
 *   D-pad / левый стик ... вверх / вниз / влево / вправо
 *   A .................... OK
 *   B / View ............. Назад
 *   X .................... Пауза / Воспроизведение
 *   Y .................... Поиск
 *   Menu (≡) ............. Боковое меню
 *   LB/RB, LT/RT ......... Влево / вправо (перемотка в плеере)
 *   Правый стик .......... Быстрая прокрутка вверх / вниз
 *
 * Отладка: пока CONFIG.debug = true, плагин показывает уведомления
 * о загрузке, подключении геймпада и нажатых кнопках.
 */
(function () {
    'use strict';

    if (window.lampa_gamepad_plugin) return;
    window.lampa_gamepad_plugin = true;

    var CONFIG = {
        debug: true,        // поставьте false, когда всё заработает
        deadzone: 0.55,
        repeatDelay: 350,
        repeatRate: 110,
        fastRate: 55,
        pollInterval: 16
    };

    var KEY = { up: 38, down: 40, left: 37, right: 39, enter: 13, back: 27, play: 415 };

    var BTN = {
        A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
        VIEW: 8, MENU: 9, LS: 10, RS: 11,
        UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, XBOX: 16
    };

    // ---------- Утилиты ----------
    function log() {
        try { console.log.apply(console, ['[Gamepad]'].concat([].slice.call(arguments))); } catch (e) {}
    }

    function notify(text, force) {
        if (!force && !CONFIG.debug) return;
        try {
            if (window.Lampa && Lampa.Noty) Lampa.Noty.show(text);
        } catch (e) {}
    }

    function fireKey(code, type) {
        try {
            var ev = new KeyboardEvent(type, { bubbles: true, cancelable: true, keyCode: code, which: code });
            if (ev.keyCode !== code) {
                Object.defineProperty(ev, 'keyCode', { get: function () { return code; } });
                Object.defineProperty(ev, 'which', { get: function () { return code; } });
            }
            window.dispatchEvent(ev);
        } catch (e) {
            log('key error', e);
        }
    }

    function pressKey(code) {
        fireKey(code, 'keydown');
        setTimeout(function () { fireKey(code, 'keyup'); }, 20);
    }

    function hasController() {
        return !!(window.Lampa && Lampa.Controller);
    }

    // ---------- Действия ----------
    function move(dir) {
        var code = KEY[dir];
        try {
            if (hasController() && typeof Lampa.Controller.move === 'function') {
                Lampa.Controller.move(dir);
                return;
            }
        } catch (e) { log('move error', e); }
        pressKey(code);
    }

    function enter() {
        try {
            if (hasController() && typeof Lampa.Controller.enter === 'function') {
                Lampa.Controller.enter();
                return;
            }
        } catch (e) { log('enter error', e); }
        pressKey(KEY.enter);
    }

    function back() {
        try {
            if (hasController() && typeof Lampa.Controller.back === 'function') {
                Lampa.Controller.back();
                return;
            }
        } catch (e) { log('back error', e); }
        pressKey(KEY.back);
    }

    function playPause() {
        pressKey(KEY.play);
    }

    function search() {
        try {
            Lampa.Activity.push({
                url: '',
                title: (Lampa.Lang && Lampa.Lang.translate) ? Lampa.Lang.translate('title_search') : 'Поиск',
                component: 'search',
                search: '',
                page: 1
            });
        } catch (e) { log('search error', e); }
    }

    function openMenu() {
        try { Lampa.Controller.toggle('menu'); }
        catch (e) { log('menu error', e); move('left'); }
    }

    var ONCE = {};
    ONCE[BTN.A] = enter;
    ONCE[BTN.B] = back;
    ONCE[BTN.VIEW] = back;
    ONCE[BTN.X] = playPause;
    ONCE[BTN.Y] = search;
    ONCE[BTN.MENU] = openMenu;

    var REPEAT = {};
    REPEAT[BTN.UP] = function () { move('up'); };
    REPEAT[BTN.DOWN] = function () { move('down'); };
    REPEAT[BTN.LEFT] = function () { move('left'); };
    REPEAT[BTN.RIGHT] = function () { move('right'); };
    REPEAT[BTN.LB] = function () { move('left'); };
    REPEAT[BTN.RB] = function () { move('right'); };
    REPEAT[BTN.LT] = function () { move('left'); };
    REPEAT[BTN.RT] = function () { move('right'); };

    // ---------- Опрос ----------
    var activeIndex = null;
    var state = {};
    var announced = false;

    function getPad() {
        var pads = navigator.getGamepads ? navigator.getGamepads() : null;
        if (!pads) return null;

        if (activeIndex !== null && pads[activeIndex] && pads[activeIndex].connected) {
            return pads[activeIndex];
        }
        for (var i = 0; i < pads.length; i++) {
            if (pads[i] && pads[i].connected) {
                activeIndex = i;
                if (!announced) {
                    announced = true;
                    log('found:', pads[i].id, 'mapping=' + pads[i].mapping);
                    notify('Геймпад найден: ' + pads[i].id.slice(0, 40));
                }
                return pads[i];
            }
        }
        return null;
    }

    function isPressed(b) {
        if (!b) return false;
        return typeof b === 'object' ? (b.pressed || b.value > 0.5) : b === 1;
    }

    function repeat(key, down, fn, now, rate) {
        var s = state[key] || (state[key] = { down: false, next: 0 });
        if (down) {
            if (!s.down) {
                s.down = true;
                s.next = now + CONFIG.repeatDelay;
                fn();
            } else if (now >= s.next) {
                s.next = now + (rate || CONFIG.repeatRate);
                fn();
            }
        } else {
            s.down = false;
        }
    }

    function once(key, down, fn, label) {
        var s = state[key] || (state[key] = { down: false });
        if (down && !s.down) {
            s.down = true;
            if (CONFIG.debug) notify('Кнопка: ' + label);
            fn();
        } else if (!down) {
            s.down = false;
        }
    }

    function poll() {
        var pad = getPad();
        if (!pad) return;

        var now = Date.now();
        var b = pad.buttons || [];
        var ax = pad.axes || [];

        Object.keys(REPEAT).forEach(function (i) {
            repeat('r' + i, isPressed(b[i]), REPEAT[i], now);
        });

        Object.keys(ONCE).forEach(function (i) {
            once('o' + i, isPressed(b[i]), ONCE[i], '#' + i);
        });

        var lx = ax[0] || 0, ly = ax[1] || 0, dz = CONFIG.deadzone;
        var horizontal = Math.abs(lx) > Math.abs(ly);

        repeat('ls_l', horizontal && lx < -dz, function () { move('left'); }, now);
        repeat('ls_r', horizontal && lx > dz, function () { move('right'); }, now);
        repeat('ls_u', !horizontal && ly < -dz, function () { move('up'); }, now);
        repeat('ls_d', !horizontal && ly > dz, function () { move('down'); }, now);

        var ry = ax[3] || 0;
        repeat('rs_u', ry < -dz, function () { move('up'); }, now, CONFIG.fastRate);
        repeat('rs_d', ry > dz, function () { move('down'); }, now, CONFIG.fastRate);
    }

    // ---------- События ----------
    window.addEventListener('gamepadconnected', function (e) {
        activeIndex = e.gamepad.index;
        announced = true;
        log('connected:', e.gamepad.id);
        notify('Геймпад подключён: ' + e.gamepad.id.slice(0, 40), true);
    });

    window.addEventListener('gamepaddisconnected', function (e) {
        if (activeIndex === e.gamepad.index) activeIndex = null;
        announced = false;
        state = {};
        log('disconnected');
        notify('Геймпад отключён', true);
    });

    // ---------- Запуск ----------
    var started = false;

    function start() {
        if (started) return;
        started = true;

        if (!navigator.getGamepads) {
            log('Gamepad API не поддерживается');
            notify('Gamepad API не поддерживается в этом клиенте', true);
            return;
        }

        setInterval(poll, CONFIG.pollInterval);
        log('started');
        notify('Плагин геймпада загружен. Нажмите любую кнопку на геймпаде.');
    }

    function init() {
        if (window.appready) return start();

        if (window.Lampa && Lampa.Listener) {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') start();
            });
            // На случай, если событие уже прошло
            setTimeout(start, 3000);
        } else {
            setTimeout(init, 200);
        }
    }

    init();
})();
