(function () {
    'use strict';

    if (window.gamepad_nav_plugin) return;
    window.gamepad_nav_plugin = true;

    var DEADZONE = 0.5;      // мёртвая зона стика
    var REPEAT_DELAY = 400;  // задержка перед автоповтором, мс
    var REPEAT_RATE = 120;   // интервал автоповтора, мс

    // keyCode, которые понимает Lampa
    var KEY = {
        up: 38, down: 40, left: 37, right: 39,
        enter: 13, back: 27, space: 32,
        rewind: 412, forward: 417
    };

    var state = {};   // состояние кнопок: { pressed, time, repeating }
    var active = null;

    function fireKey(code) {
        ['keydown', 'keyup'].forEach(function (type) {
            var e = new KeyboardEvent(type, { bubbles: true, cancelable: true });
            Object.defineProperty(e, 'keyCode', { get: function () { return code; } });
            Object.defineProperty(e, 'which',   { get: function () { return code; } });
            Object.defineProperty(e, 'key',     { get: function () { return ''; } });
            (document.activeElement || document.body).dispatchEvent(e);
        });
    }

    function safe(fn) {
        try { fn(); } catch (err) { console.log('Gamepad plugin:', err); }
    }

    var actions = {
        up:      function () { fireKey(KEY.up); },
        down:    function () { fireKey(KEY.down); },
        left:    function () { fireKey(KEY.left); },
        right:   function () { fireKey(KEY.right); },
        enter:   function () { fireKey(KEY.enter); },
        back:    function () { fireKey(KEY.back); },
        playpause: function () { fireKey(KEY.space); },
        rewind:  function () { fireKey(KEY.rewind); },
        forward: function () { fireKey(KEY.forward); },
        menu: function () {
            safe(function () { Lampa.Controller.toggle('menu'); });
        },
        search: function () {
            safe(function () {
                Lampa.Activity.push({
                    url: '',
                    title: Lampa.Lang.translate('title_search'),
                    component: 'search',
                    page: 1
                });
            });
        }
    };

    // Какие действия допускают автоповтор
    var repeatable = { up: 1, down: 1, left: 1, right: 1, rewind: 1, forward: 1 };

    function handle(name, isDown, now) {
        var s = state[name] || (state[name] = { pressed: false, time: 0, repeating: false });

        if (isDown) {
            if (!s.pressed) {
                s.pressed = true;
                s.time = now;
                s.repeating = false;
                actions[name]();
            } else if (repeatable[name]) {
                var wait = s.repeating ? REPEAT_RATE : REPEAT_DELAY;
                if (now - s.time >= wait) {
                    s.time = now;
                    s.repeating = true;
                    actions[name]();
                }
            }
        } else {
            s.pressed = false;
            s.repeating = false;
        }
    }

    function poll() {
        var pads = navigator.getGamepads ? navigator.getGamepads() : [];
        var pad = null;

        for (var i = 0; i < pads.length; i++) {
            if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
        }

        if (pad) {
            var b = function (i) { return pad.buttons[i] && pad.buttons[i].pressed; };
            var lx = pad.axes[0] || 0, ly = pad.axes[1] || 0, ry = pad.axes[3] || 0;
            var now = performance.now();

            handle('up',    b(12) || ly < -DEADZONE || ry < -DEADZONE, now);
            handle('down',  b(13) || ly >  DEADZONE || ry >  DEADZONE, now);
            handle('left',  b(14) || lx < -DEADZONE, now);
            handle('right', b(15) || lx >  DEADZONE, now);

            handle('enter',     b(0), now); // A
            handle('back',      b(1), now); // B
            handle('playpause', b(2), now); // X
            handle('search',    b(3), now); // Y
            handle('rewind',    b(4), now); // LB
            handle('forward',   b(5), now); // RB
            handle('menu',      b(9), now); // Menu
        }

        active = requestAnimationFrame(poll);
    }

    function start() {
        window.addEventListener('gamepadconnected', function (e) {
            console.log('Gamepad connected:', e.gamepad.id);
            safe(function () { Lampa.Noty.show('Геймпад подключён'); });
        });
        window.addEventListener('gamepaddisconnected', function () {
            safe(function () { Lampa.Noty.show('Геймпад отключён'); });
        });

        if (!active) poll();
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }
})();