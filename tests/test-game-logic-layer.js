// tests/test-game-logic-layer.js — Изолированные тесты GameLogicLayer
//
// ДЕМОНСТРАЦИЯ LAYERS:
//   Реактивный слой (без внешних действий) — читает snapshot и решает
//   нужна ли смена фазы. Чистая функция: snapshot → delta.
//
//   Машина состояний:  waiting → countdown → playing → finished
//
// Для AI-агента: этот слой легко модифицировать (добавить фазу, изменить таймер)
// потому что он ИЗОЛИРОВАН — не зависит от ItemLayer, PlayerLayer или сервера.

const { GameLogicLayer } = require('../layers/game-logic/game-logic-layer');

// ── Мини-фреймворк ─────────────────────────────────────────
let _passed = 0, _failed = 0, _currentTest = '';
function describe(name, fn) { console.log(`\n  📦 ${name}`); fn(); }
function test(name, fn) {
  _currentTest = name;
  try { fn(); } catch (e) { _failed++; console.log(`    ❌ ${name}\n       ${e.message}`); }
}
function assert(condition, msg) {
  if (condition) { _passed++; console.log(`    ✅ ${_currentTest}: ${msg}`); }
  else { _failed++; console.log(`    ❌ ${_currentTest}: ${msg}`); }
}
function assertEq(actual, expected, msg) {
  assert(actual === expected, `${msg} (got: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)})`);
}
function summary() {
  console.log(`\n  ── Результат: ${_passed} passed, ${_failed} failed ──`);
  return _failed;
}

// ════════════════════════════════════════════════════════════
//  ТЕСТЫ
// ════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════╗');
console.log('║  GameLogicLayer — Изолированные тесты         ║');
console.log('╚══════════════════════════════════════════════╝');

describe('Фаза WAITING', () => {

  test('меньше 2 игроков → нет перехода', () => {
    const layer = new GameLogicLayer();
    // ВХОД: 1 игрок, ещё не готов
    const snapshot = {
      game: { phase: 'waiting', countdown: 5, gameTime: 30 },
      players: { player1: { ready: false } }
    };

    const delta = layer.tick(snapshot, 1);
    assert(delta === null, 'delta = null (мало игроков)');
  });

  test('2 игрока, не все готовы → нет перехода', () => {
    const layer = new GameLogicLayer();
    const snapshot = {
      game: { phase: 'waiting' },
      players: {
        player1: { ready: true },
        player2: { ready: false }  // НЕ готов
      }
    };

    const delta = layer.tick(snapshot, 1);
    assert(delta === null, 'delta = null (не все готовы)');
  });

  test('2 игрока, оба готовы → переход в countdown', () => {
    const layer = new GameLogicLayer();
    // ВХОД: оба игрока ready: true
    const snapshot = {
      game: { phase: 'waiting' },
      players: {
        player1: { ready: true },
        player2: { ready: true }
      }
    };

    const delta = layer.tick(snapshot, 1);

    // ВЫХОД: смена фазы на countdown
    assert(delta !== null, 'delta не null');
    assertEq(delta.game.phase, 'countdown', 'фаза → countdown');
    assertEq(delta.game.countdown, 5, 'обратный отсчёт = 5');
    assert(delta.game.phaseStartTime > 0, 'phaseStartTime установлен');
  });
});

describe('Фаза COUNTDOWN', () => {

  test('отсчёт уменьшается с течением времени', () => {
    const layer = new GameLogicLayer();
    // ВХОД: фаза countdown, прошло 2 секунды
    const snapshot = {
      game: {
        phase: 'countdown',
        countdown: 5,
        phaseStartTime: Date.now() - 2000 // 2 секунды назад
      },
      players: {}
    };

    const delta = layer.tick(snapshot, 1);

    // ВЫХОД: countdown уменьшился
    assert(delta !== null, 'delta не null');
    assertEq(delta.game.countdown, 3, 'countdown = 3 (прошло 2 сек)');
  });

  test('5 секунд прошло → переход в playing', () => {
    const layer = new GameLogicLayer();
    // ВХОД: countdown, прошло 5+ секунд
    const snapshot = {
      game: {
        phase: 'countdown',
        countdown: 1,
        phaseStartTime: Date.now() - 5500 // 5.5 секунд назад
      },
      players: {}
    };

    const delta = layer.tick(snapshot, 1);

    assertEq(delta.game.phase, 'playing', 'фаза → playing');
    assertEq(delta.game.gameTime, 30, 'gameTime = 30');
  });
});

describe('Фаза PLAYING', () => {

  test('таймер уменьшается с течением времени', () => {
    const layer = new GameLogicLayer();
    // ВХОД: playing, прошло 10 секунд
    const snapshot = {
      game: {
        phase: 'playing',
        gameTime: 30,
        phaseStartTime: Date.now() - 10000
      },
      players: {}
    };

    const delta = layer.tick(snapshot, 1);

    assertEq(delta.game.gameTime, 20, 'gameTime = 20 (прошло 10 сек)');
  });

  test('время вышло → переход в finished', () => {
    const layer = new GameLogicLayer();
    // ВХОД: прошло 31 секунда
    const snapshot = {
      game: {
        phase: 'playing',
        gameTime: 1,
        phaseStartTime: Date.now() - 31000
      },
      players: {}
    };

    const delta = layer.tick(snapshot, 1);

    assertEq(delta.game.phase, 'finished', 'фаза → finished');
    assertEq(delta.game.gameTime, 0, 'gameTime = 0');
  });
});

describe('Фаза FINISHED', () => {

  test('finished → нет дельты (игра окончена)', () => {
    const layer = new GameLogicLayer();
    const snapshot = {
      game: { phase: 'finished', gameTime: 0 },
      players: {}
    };

    const delta = layer.tick(snapshot, 1);
    assert(delta === null, 'delta = null (игра окончена)');
  });
});

describe('Нет объекта game', () => {

  test('snapshot без game → нет дельты', () => {
    const layer = new GameLogicLayer();
    const snapshot = { players: {} };

    const delta = layer.tick(snapshot, 1);
    assert(delta === null, 'delta = null (нет game)');
  });
});

// ── Экспорт результата ──
const failures = summary();
process.exit(failures > 0 ? 1 : 0);
