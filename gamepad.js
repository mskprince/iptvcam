/*!
 * Lampa Gamepad Plugin
 * Навигация по Lampa с помощью геймпада (Xbox Series X|S / Xbox One и др. со стандартной раскладкой)
 *
 * Раскладка:
 *   D-pad / левый стик ...... вверх / вниз / влево / вправо
 *   A ....................... OK (Enter)
 *   B ....................... Назад
 *   X ....................... Пауза / Воспроизведение (в плеере)
 *   Y ....................... Поиск
 *   LB / RB ................. Перемотка назад / вперёд (в плеере)
 *   LT / RT ................. Перемотка назад / вперёд (в плеере, аналог LB/RB)
 *   Menu (≡) ................ Открыть боковое меню
 *   View (⧉) ................ Назад
 *   Правый стик (вверх/вниз)  Прокрутка вверх / вниз (быстрое перемещение)
 */
(function () {
    'use strict';

    if (window.lampa_gamepad_plugin) return;
    window.lampa_gamepad_plugin = true;

    // ---------- Настройки ----------
    var CONFIG = {
        deadzone: 0.55,        // мёртвая зона стика (0..1)
        repeatDelay: 350,      // задержка перед автоповтором, мс
        repeatRate: 110,       // интервал автоповтора, мс
        fastRate: 55,          // интервал автоповтора для правого стика, мс
        vibrate: false         // лёгкая вибрация при нажатии (если поддерживается)
    };

    // Коды клавиш, которые понимает Lampa
    var KEY = {
        up: 38,
        down: 40,
        left: 37,
        right: 39,
        enter: 13,
        back: 27,
        play: 415,
        pause: 19,
        rewind: 412,
        forward: 417
    };

    // Стандартная раскладка Gamepad API (Xbox)
    var BTN = {
        A: 0, B: 1, X: 2, Y: 3,
        LB: 4, RB: 5, LT: 6, RT: 7,
        VIEW: 8, MENU: 9,
        LS: 10, RS: 11,
        UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
        XBOX: 16
    };

    // ---------- Эмуляция клавиш ----------
    function fireKey(code, type) {
        type = type || 'keydown';
        try {
            var ev = new KeyboardEvent(type, {
                bubbles: true,
                cancelable: true,
                keyCode: code,
                which: code
            });
            // На случай браузеров, которые игнорируют keyCode в конструкторе
            if (ev.keyCode !== code) {
                Object.defineProperty(ev, 'keyCode', { get: function () { return code; } });
                Object.defineProperty(ev, 'which', { get: function () { return code; } });
            }
            (document.body || document).dispatchEvent(ev);
        } catch (e) {
            console.log('Gamepad', 'key error', e);
        }
    }

    function press(code) {
        fireKey(code, 'keydown');
        setTimeout(function () { fireKey(code, 'keyup'); }, 20);
    }

    function isPlayerActive() {
        try {
            return !!(window.Lampa && Lampa.Player && Lampa.Player.opened && Lampa.Player.opened());
        } catch (e) {
            return false;
        }
    }

    function notify(text) {
        try { if (window.Lampa && Lampa.Noty) Lampa.Noty.show(text); } catch (e) {}
    }

    function rumble() {
        if (!CONFIG.vibrate) return;
        try {
            var pad = getPad();
            if (pad && pad.vibrationActuator) {
                pad.vibrationActuator.playEffect('dual-rumble', {
                    duration: 40, strongMagnitude: 0.2, weakMagnitude: 0.2
                });
            }
        } catch (e) {}
    }

    // ---------- Действия кнопок ----------
    function actionOpenMenu() {
        try {
            Lampa.Controller.toggle('menu');
        } catch (e) {
            press(KEY.left);
        }
    }

    function actionSearch() {
        try {
            Lampa.Activity.push({
                url: '',
                title: Lampa.Lang ? Lampa.Lang.translate('title_search') : 'Поиск',
                component: 'search',
                search: '',
                page: 1
            });
        } catch (e) {
            console.log('Gamepad', 'search error', e);
        }
    }

    function actionPlayPause() {
        if (isPlayerActive()) press(KEY.play);
    }

    // Кнопки с одиночным срабатыванием
    var BUTTON_ACTIONS = {};
    BUTTON_ACTIONS[BTN.A] = function () { press(KEY.enter); };
    BUTTON_ACTIONS[BTN.B] = function () { press(KEY.back); };
    BUTTON_ACTIONS[BTN.VIEW] = function () { press(KEY.back); };
    BUTTON_ACTIONS[BTN.X] = actionPlayPause;
    BUTTON_ACTIONS[BTN.Y] = actionSearch;
    BUTTON_ACTIONS[BTN.MENU] = actionOpenMenu;

    // Кнопки с автоповтором: [код клавиши | функция]
    function seekBack() { press(isPlayerActive() ? KEY.left : KEY.left); }
    function seekForward() { press(isPlayerActive() ? KEY.right : KEY.right); }

    var REPEAT_BUTTONS = {};
    REPEAT_BUTTONS[BTN.UP] = function () { press(KEY.up); };
    REPEAT_BUTTONS[BTN.DOWN] = function () { press(KEY.down); };
    REPEAT_BUTTONS[BTN.LEFT] = function () { press(KEY.left); };
    REPEAT_BUTTONS[BTN.RIGHT] = function () { press(KEY.right); };
    REPEAT_BUTTONS[BTN.LB] = seekBack;
    REPEAT_BUTTONS[BTN.RB] = seekForward;
    REPEAT_BUTTONS[BTN.LT] = seekBack;
    REPEAT_BUTTONS[BTN.RT] = seekForward;

    // ---------- Опрос геймпада ----------
    var activeIndex = null;
    var state = {};        // состояние по ключам: { down: bool, next: timestamp, started: bool }

    function getPad() {
        var pads = navigator.getGamepads ? navigator.getGamepads() : [];
        if (!pads) return null;

        if (activeIndex !== null && pads[activeIndex] && pads[activeIndex].connected) {
            return pads[activeIndex];
        }
        for (var i = 0; i < pads.length; i++) {
            if (pads[i] && pads[i].connected) {
                activeIndex = i;
                return pads[i];
            }
        }
        return null;
    }

    function isPressed(b) {
        if (!b) return false;
        return typeof b === 'object' ? (b.pressed || b.value > 0.5) : b === 1;
    }

    // Обработка "удерживаемого" входа с автоповтором
    function handleRepeat(key, down, fn, now, rate) {
        var s = state[key] || (state[key] = { down: false, next: 0 });

        if (down) {
            if (!s.down) {
                s.down = true;
                s.next = now + CONFIG.repeatDelay;
                fn();
                rumble();
            } else if (now >= s.next) {
                s.next = now + (rate || CONFIG.repeatRate);
                fn();
            }
        } else {
            s.down = false;
        }
    }

    // Обработка одиночного нажатия
    function handleOnce(key, down, fn) {
        var s = state[key] || (state[key] = { down: false });
        if (down && !s.down) {
            s.down = true;
            fn();
            rumble();
        } else if (!down) {
            s.down = false;
        }
    }

    function poll() {
        var pad = getPad();

        if (pad) {
            var now = Date.now();
            var b = pad.buttons;
            var ax = pad.axes || [];

            // Кнопки с автоповтором (D-pad, бамперы, триггеры)
            Object.keys(REPEAT_BUTTONS).forEach(function (idx) {
                handleRepeat('btn' + idx, isPressed(b[idx]), REPEAT_BUTTONS[idx], now);
            });

            // Одиночные кнопки (A, B, X, Y, Menu, View)
            Object.keys(BUTTON_ACTIONS).forEach(function (idx) {
                handleOnce('once' + idx, isPressed(b[idx]), BUTTON_ACTIONS[idx]);
            });

            // Левый стик -> стрелки
            var lx = ax[0] || 0;
            var ly = ax[1] || 0;
            var dz = CONFIG.deadzone;

            // Отдаём приоритет доминирующей оси, чтобы не было диагональных срабатываний
            var horizontal = Math.abs(lx) > Math.abs(ly);

            handleRepeat('ls_left', horizontal && lx < -dz, function () { press(KEY.left); }, now);
            handleRepeat('ls_right', horizontal && lx > dz, function () { press(KEY.right); }, now);
            handleRepeat('ls_up', !horizontal && ly < -dz, function () { press(KEY.up); }, now);
            handleRepeat('ls_down', !horizontal && ly > dz, function () { press(KEY.down); }, now);

            // Правый стик (вертикаль) -> быстрое перемещение вверх/вниз
            var ry = ax[3] || 0;
            handleRepeat('rs_up', ry < -dz, function () { press(KEY.up); }, now, CONFIG.fastRate);
            handleRepeat('rs_down', ry > dz, function () { press(KEY.down); }, now, CONFIG.fastRate);
        }

        requestAnimationFrame(poll);
    }

    // ---------- Подключение / отключение ----------
    window.addEventListener('gamepadconnected', function (e) {
        activeIndex = e.gamepad.index;
        console.log('Gamepad', 'connected:', e.gamepad.id);
        notify('Геймпад подключён');
    });

    window.addEventListener('gamepaddisconnected', function (e) {
        if (activeIndex === e.gamepad.index) activeIndex = null;
        state = {};
        console.log('Gamepad', 'disconnected:', e.gamepad.id);
        notify('Геймпад отключён');
    });

    // ---------- Запуск ----------
    function start() {
        if (!navigator.getGamepads) {
            console.log('Gamepad', 'Gamepad API не поддерживается');
            return;
        }
        requestAnimationFrame(poll);
        console.log('Gamepad', 'plugin started');
    }

    if (window.appready) {
        start();
    } else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    } else {
        // Запасной вариант, если Lampa ещё не инициализирована
        var timer = setInterval(function () {
            if (window.Lampa && Lampa.Listener) {
                clearInterval(timer);
                if (window.appready) start();
                else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });
            }
        }, 200);
    }
})();
