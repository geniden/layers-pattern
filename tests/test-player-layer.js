// tests/test-player-layer.js — Изолированные тесты PlayerLayer
//
// ДЕМОНСТРАЦИЯ LAYERS:
//   Каждый слой — чистая функция: (snapshot, actions) → delta
//   Тестирование БЕЗ сервера, БЕЗ WebSocket, БЕЗ других слоёв.
//   AI-агент может написать тест, запустить его и убедиться что слой работает.
//
// Входные данные:  snapshot (из LAYER.md или из snapshot-истории)
// Выходные данные: delta (проверяется на соответствие ожиданиям)

const { PlayerLayer } = require('../layers/player/player-layer');

// ── Мини-фреймворк тестирования ────────────────────────────
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
console.log('║  PlayerLayer — Изолированные тесты           ║');
console.log('╚══════════════════════════════════════════════╝');

describe('add_player', () => {

  test('добавление игрока создаёт корректную дельту', () => {
    // ВХОД: пустой снимок + действие add_player
    const layer = new PlayerLayer();
    const snapshot = { players: {}, game: { phase: 'waiting' } };

    layer.queueAction({ type: 'add_player', playerId: 'player1', name: 'Alice' });
    const delta = layer.tick(snapshot, 1);

    // ВЫХОД: дельта с данными нового игрока
    assert(delta !== null, 'delta не null');
    assert(delta.players !== undefined, 'delta содержит players');
    assert(delta.players.player1 !== undefined, 'delta содержит player1');
    assertEq(delta.players.player1.name, 'Alice', 'имя игрока');
    assertEq(delta.players.player1.score, 0, 'начальный счёт = 0');
    assertEq(delta.players.player1.ready, false, 'ready = false');
  });

  test('добавление двух игроков за один такт', () => {
    const layer = new PlayerLayer();
    const snapshot = { players: {} };

    layer.queueAction({ type: 'add_player', playerId: 'player1', name: 'Alice' });
    layer.queueAction({ type: 'add_player', playerId: 'player2', name: 'Bob' });
    const delta = layer.tick(snapshot, 1);

    assert(delta.players.player1 !== undefined, 'player1 в дельте');
    assert(delta.players.player2 !== undefined, 'player2 в дельте');
    assertEq(delta.players.player1.name, 'Alice', 'player1 имя');
    assertEq(delta.players.player2.name, 'Bob', 'player2 имя');
  });
});

describe('remove_player', () => {

  test('удаление игрока создаёт null-дельту', () => {
    const layer = new PlayerLayer();
    // ВХОД: снимок с существующим игроком
    const snapshot = {
      players: {
        player1: { id: 'player1', name: 'Alice', score: 5, ready: true }
      }
    };

    layer.queueAction({ type: 'remove_player', playerId: 'player1' });
    const delta = layer.tick(snapshot, 1);

    // ВЫХОД: null в дельте = удаление через deepMerge
    assert(delta.players.player1 === null, 'player1 = null (удаление)');
  });
});

describe('ready', () => {

  test('установка готовности игрока', () => {
    const layer = new PlayerLayer();
    // ВХОД: снимок где игрок НЕ готов
    const snapshot = {
      players: {
        player1: { id: 'player1', name: 'Alice', score: 0, ready: false }
      }
    };

    layer.queueAction({ type: 'ready', playerId: 'player1' });
    const delta = layer.tick(snapshot, 1);

    // ВЫХОД: дельта с ready: true
    assertEq(delta.players.player1.ready, true, 'ready = true');
  });

  test('повторный ready на уже готового игрока — нет дельты', () => {
    const layer = new PlayerLayer();
    // ВХОД: игрок УЖЕ готов
    const snapshot = {
      players: {
        player1: { id: 'player1', name: 'Alice', score: 0, ready: true }
      }
    };

    layer.queueAction({ type: 'ready', playerId: 'player1' });
    const delta = layer.tick(snapshot, 1);

    // ВЫХОД: null — изменений нет
    assert(delta === null, 'delta = null (нет изменений)');
  });

  test('ready на несуществующего игрока — нет дельты', () => {
    const layer = new PlayerLayer();
    const snapshot = { players: {} };

    layer.queueAction({ type: 'ready', playerId: 'ghost' });
    const delta = layer.tick(snapshot, 1);

    assert(delta === null, 'delta = null (игрок не найден)');
  });
});

describe('пустой такт', () => {

  test('без действий — нет дельты', () => {
    const layer = new PlayerLayer();
    const snapshot = { players: { player1: { id: 'player1', name: 'Alice', score: 0, ready: false } } };

    // НЕ добавляем действий
    const delta = layer.tick(snapshot, 1);

    assert(delta === null, 'delta = null (нет действий)');
  });
});

// ── Экспорт результата ──
const failures = summary();
process.exit(failures > 0 ? 1 : 0);
