(function () {
    'use strict';

    // 0: A (ОК), 1: B (Назад), 12: Up, 13: Down, 14: Left, 15: Right
    const XBOX_BUTTONS = {
        0: 'ok',
        1: 'back',
        12: { code: 38, key: 'ArrowUp' },
        13: { code: 40, key: 'ArrowDown' },
        14: { code: 37, key: 'ArrowLeft' },
        15: { code: 39, key: 'ArrowRight' }
    };

    // --- НАСТРОЙКИ АВТОПОВТОРА ---
    const REPEAT_DELAY = 350;    // Задержка перед началом повтора (в мс)
    const REPEAT_INTERVAL = 90;  // Интервал между повторами при зажатии (в мс)

    // Хранилище состояния зажатых кнопок: buttonIndex -> { initialPress, lastTrigger }
    let heldButtons = new Map();
    let loopRunning = false;

    function dispatchFullKeyEvent(keyCode, keyName) {
        ['keydown', 'keyup'].forEach(eventType => {
            const event = new KeyboardEvent(eventType, {
                key: keyName,
                code: keyName,
                keyCode: keyCode,
                which: keyCode,
                bubbles: true,
                cancelable: true
            });

            Object.defineProperty(event, 'keyCode', { get: () => keyCode });
            Object.defineProperty(event, 'which', { get: () => keyCode });
            Object.defineProperty(event, 'key', { get: () => keyName });

            const target = document.activeElement || document.body || document;
            target.dispatchEvent(event);
        });
    }

    function handleButton(action) {
        if (action === 'ok') {
            if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.enter === 'function') {
                Lampa.Controller.enter();
                return;
            }
            const focusEl = document.querySelector('.focus');
            if (focusEl && typeof focusEl.click === 'function') {
                focusEl.click();
            }
            dispatchFullKeyEvent(13, 'Enter');
        } 
        else if (action === 'back') {
            if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.back === 'function') {
                Lampa.Controller.back();
                return;
            }
            dispatchFullKeyEvent(27, 'Escape');
            dispatchFullKeyEvent(8, 'Backspace');
        } 
        else if (typeof action === 'object') {
            const event = new KeyboardEvent('keydown', {
                key: action.key,
                code: action.key,
                keyCode: action.code,
                which: action.code,
                bubbles: true,
                cancelable: true
            });

            Object.defineProperty(event, 'keyCode', { get: () => action.code });
            Object.defineProperty(event, 'which', { get: () => action.code });

            const target = document.activeElement || document.body || document;
            target.dispatchEvent(event);
        }
    }

    function updateGamepad() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[0];
        const now = Date.now();

        if (gp) {
            gp.buttons.forEach((button, index) => {
                let action = XBOX_BUTTONS[index];

                if (action) {
                    if (button.pressed) {
                        if (!heldButtons.has(index)) {
                            // Первое нажатие
                            heldButtons.set(index, { initialPress: now, lastTrigger: now });
                            handleButton(action);
                        } else {
                            // Кнопка зажата — обрабатываем повтор (только для стрелок)
                            const isArrow = typeof action === 'object';
                            if (isArrow) {
                                const btnState = heldButtons.get(index);
                                const timeHeld = now - btnState.initialPress;
                                const timeSinceLast = now - btnState.lastTrigger;

                                if (timeHeld >= REPEAT_DELAY && timeSinceLast >= REPEAT_INTERVAL) {
                                    btnState.lastTrigger = now;
                                    handleButton(action);
                                }
                            }
                        }
                    } else if (heldButtons.has(index)) {
                        // Кнопка отпущена
                        heldButtons.delete(index);
                    }
                }
            });
        }

        requestAnimationFrame(updateGamepad);
    }

    function init() {
        console.log("[Xbox Plugin] Контроллер Lampa с поддержкой зажатия стрелок запущен.");

        window.addEventListener("gamepadconnected", () => {
            if (!loopRunning) {
                loopRunning = true;
                updateGamepad();
            }
        });

        window.addEventListener("gamepaddisconnected", () => {
            heldButtons.clear();
        });

        if (navigator.getGamepads && navigator.getGamepads()[0]) {
            if (!loopRunning) {
                loopRunning = true;
                updateGamepad();
            }
        }
    }

    if (window.appready) {
        init();
    } else {
        if (window.Lampa && Lampa.Listener) {
            Lampa.Listener.follow('app', function (e) {
                if (e.type == 'ready') init();
            });
        } else {
            init();
        }
    }
})();
