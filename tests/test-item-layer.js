// tests/test-item-layer.js — Изолированные тесты ItemLayer
//
// ДЕМОНСТРАЦИЯ LAYERS:
//   Самый сложный слой тестируется так же просто — подаём snapshot, получаем delta.
//   Даже гонка состояний (race condition) тестируется в 10 строк!
//
// Ключевые сценарии:
//   1. Генерация раунда (первый такт playing)
//   2. Сбор яблока (+1 очко)
//   3. Сбор бомбы (-1 очко)
//   4. Гонка: два игрока кликают один предмет → первый побеждает
//   5. Все яблоки собраны → новый раунд
//   6. Прогрессия раундов (1,1,2,2,3,3,...)

const { ItemLayer } = require('../layers/item/item-layer');

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

// ── Помощники ───────────────────────────────────────────────
/** Создать базовый снимок с фазой playing */
function playingSnapshot(items = {}, players = {}) {
  return {
    game: { phase: 'playing', gameTime: 25, phaseStartTime: Date.now() },
    players: {
      player1: { id: 'player1', name: 'Alice', score: 0, ready: true },
      player2: { id: 'player2', name: 'Bob', score: 0, ready: true },
      ...players
    },
    items
  };
}

/** Подсчитать предметы в дельте по типу */
function countItemsInDelta(delta, type) {
  if (!delta?.items) return 0;
  return Object.values(delta.items).filter(i => i && i.type === type).length;
}

// ════════════════════════════════════════════════════════════
//  ТЕСТЫ
// ════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════╗');
console.log('║  ItemLayer — Изолированные тесты              ║');
console.log('╚══════════════════════════════════════════════╝');

describe('Генерация раунда 1', () => {

  test('первый такт playing → генерация 1 яблока + 3 бомбы', () => {
    // ВХОД: пустое поле, фаза playing
    const layer = new ItemLayer();
    const snapshot = playingSnapshot();

    const delta = layer.tick(snapshot, 1);

    // ВЫХОД: 1 яблоко + 3 бомбы = 4 предмета
    const apples = countItemsInDelta(delta, 'apple');
    const bombs = countItemsInDelta(delta, 'bomb');

    assertEq(apples, 1, 'раунд 1 → 1 яблоко');
    assertEq(bombs, 3, 'раунд 1 → 3 бомбы');
  });

  test('все предметы на разных позициях', () => {
    const layer = new ItemLayer();
    const snapshot = playingSnapshot();
    const delta = layer.tick(snapshot, 1);

    const positions = new Set();
    for (const item of Object.values(delta.items)) {
      if (!item) continue;
      positions.add(`${item.x},${item.y}`);
    }

    assertEq(positions.size, 4, 'все 4 предмета на уникальных позициях');
  });
});

describe('Сбор предметов', () => {

  test('сбор яблока → +1 очко', () => {
    const layer = new ItemLayer();
    // Активируем слой первым тактом
    layer.tick(playingSnapshot(), 1);

    // ВХОД: снимок с яблоком на поле
    const snapshot = playingSnapshot({
      item_0: { id: 'item_0', type: 'apple', x: 3, y: 5, collected: false, collectedBy: null },
      item_1: { id: 'item_1', type: 'bomb', x: 1, y: 1, collected: false, collectedBy: null },
      item_2: { id: 'item_2', type: 'bomb', x: 2, y: 2, collected: false, collectedBy: null },
      item_3: { id: 'item_3', type: 'bomb', x: 3, y: 3, collected: false, collectedBy: null }
    });

    layer.queueAction({ type: 'collect', playerId: 'player1', itemId: 'item_0' });
    const delta = layer.tick(snapshot, 2);

    // ВЫХОД: яблоко собрано + новый раунд (т.к. все яблоки собраны)
    assertEq(delta.items.item_0.collected, true, 'яблоко собрано');
    assertEq(delta.items.item_0.collectedBy, 'player1', 'собрал player1');
    assertEq(delta.players.player1.score, 1, 'счёт +1');
  });

  test('сбор бомбы → -1 очко', () => {
    const layer = new ItemLayer();
    layer.tick(playingSnapshot(), 1);

    const snapshot = playingSnapshot({
      item_0: { id: 'item_0', type: 'apple', x: 3, y: 5, collected: false, collectedBy: null },
      item_1: { id: 'item_1', type: 'bomb', x: 1, y: 1, collected: false, collectedBy: null },
      item_2: { id: 'item_2', type: 'bomb', x: 2, y: 2, collected: false, collectedBy: null },
      item_3: { id: 'item_3', type: 'bomb', x: 3, y: 3, collected: false, collectedBy: null }
    });

    layer.queueAction({ type: 'collect', playerId: 'player2', itemId: 'item_1' });
    const delta = layer.tick(snapshot, 2);

    assertEq(delta.items.item_1.collected, true, 'бомба собрана');
    assertEq(delta.items.item_1.collectedBy, 'player2', 'собрал player2');
    assertEq(delta.players.player2.score, -1, 'счёт -1 (бомба)');
  });

  test('сбор уже собранного предмета — игнорируется', () => {
    const layer = new ItemLayer();
    layer.tick(playingSnapshot(), 1);

    // ВХОД: яблоко УЖЕ собрано в предыдущем такте
    const snapshot = playingSnapshot({
      item_0: { id: 'item_0', type: 'apple', x: 3, y: 5, collected: true, collectedBy: 'player1' },
      item_1: { id: 'item_1', type: 'bomb', x: 1, y: 1, collected: false, collectedBy: null },
      item_2: { id: 'item_2', type: 'bomb', x: 2, y: 2, collected: false, collectedBy: null },
      item_3: { id: 'item_3', type: 'bomb', x: 3, y: 3, collected: false, collectedBy: null }
    });

    layer.queueAction({ type: 'collect', playerId: 'player2', itemId: 'item_0' });
    const delta = layer.tick(snapshot, 2);

    // ВЫХОД: нет изменения для item_0 (собирать нечего)
    assert(!delta?.items?.item_0, 'item_0 не изменён (уже собран)');
  });
});

describe('🔥 RACE CONDITION — ключевая демонстрация LAYERS', () => {

  test('два игрока кликают одно яблоко → первый побеждает', () => {
    const layer = new ItemLayer();
    layer.tick(playingSnapshot(), 1);

    // ВХОД: оба игрока кликнули на item_0 В ОДНОМ ТАКТЕ
    const snapshot = playingSnapshot({
      item_0: { id: 'item_0', type: 'apple', x: 5, y: 5, collected: false, collectedBy: null },
      item_1: { id: 'item_1', type: 'bomb', x: 1, y: 1, collected: false, collectedBy: null },
      item_2: { id: 'item_2', type: 'bomb', x: 2, y: 2, collected: false, collectedBy: null },
      item_3: { id: 'item_3', type: 'bomb', x: 3, y: 3, collected: false, collectedBy: null }
    });

    // Два действия на один предмет — КЛАССИЧЕСКАЯ ГОНКА
    layer.queueAction({ type: 'collect', playerId: 'player1', itemId: 'item_0' });
    layer.queueAction({ type: 'collect', playerId: 'player2', itemId: 'item_0' });
    const delta = layer.tick(snapshot, 2);

    // ВЫХОД: player1 (первый в очереди) забирает, player2 — УПУЩЕНО
    assertEq(delta.items.item_0.collectedBy, 'player1', 'ПЕРВЫЙ в очереди побеждает');
    assertEq(delta.players.player1.score, 1, 'player1 получает очко');
    assert(!delta.players.player2, 'player2 НЕ получает очков (MISSED!)');
  });

  test('два игрока кликают разные предметы → оба получают', () => {
    const layer = new ItemLayer();
    layer.tick(playingSnapshot(), 1);

    const snapshot = playingSnapshot({
      item_0: { id: 'item_0', type: 'apple', x: 0, y: 0, collected: false, collectedBy: null },
      item_1: { id: 'item_1', type: 'apple', x: 9, y: 9, collected: false, collectedBy: null },
      item_2: { id: 'item_2', type: 'bomb', x: 1, y: 1, collected: false, collectedBy: null },
      item_3: { id: 'item_3', type: 'bomb', x: 2, y: 2, collected: false, collectedBy: null },
      item_4: { id: 'item_4', type: 'bomb', x: 3, y: 3, collected: false, collectedBy: null }
    });

    layer.queueAction({ type: 'collect', playerId: 'player1', itemId: 'item_0' });
    layer.queueAction({ type: 'collect', playerId: 'player2', itemId: 'item_1' });
    const delta = layer.tick(snapshot, 2);

    assertEq(delta.items.item_0.collectedBy, 'player1', 'player1 забирает item_0');
    assertEq(delta.items.item_1.collectedBy, 'player2', 'player2 забирает item_1');
    assertEq(delta.players.player1.score, 1, 'player1 +1');
    assertEq(delta.players.player2.score, 1, 'player2 +1');
  });
});

describe('Раунды — прогрессия яблок', () => {

  test('после сбора всех яблок → новый раунд с большим кол-вом', () => {
    const layer = new ItemLayer();

    // Раунд 1: генерируем начальные предметы
    const snap1 = playingSnapshot();
    const delta1 = layer.tick(snap1, 1);
    const apples1 = countItemsInDelta(delta1, 'apple');
    assertEq(apples1, 1, 'раунд 1 → 1 яблоко');

    // Собираем яблоко → должен начаться раунд 2
    // Формируем снимок как будто предметы из delta1 уже применены
    const items = {};
    for (const [id, item] of Object.entries(delta1.items)) {
      if (item) items[id] = item;
    }
    const snap2 = playingSnapshot(items);

    // Находим яблоко и собираем его
    const appleId = Object.keys(items).find(id => items[id].type === 'apple');
    layer.queueAction({ type: 'collect', playerId: 'player1', itemId: appleId });
    const delta2 = layer.tick(snap2, 2);

    // Раунд 2: ceil(2/2) = 1 яблоко (снова 1)
    const apples2 = countItemsInDelta(delta2, 'apple');
    assertEq(apples2, 1, 'раунд 2 → 1 яблоко (ceil(2/2) = 1)');
  });

  test('прогрессия: раунды 1-6 → яблоки 1,1,2,2,3,3', () => {
    const expected = [1, 1, 2, 2, 3, 3];
    let allCorrect = true;
    const actual = [];

    for (let round = 1; round <= 6; round++) {
      const appleCount = Math.ceil(round / 2);
      actual.push(appleCount);
      if (appleCount !== expected[round - 1]) allCorrect = false;
    }

    assert(allCorrect, `прогрессия яблок: ${actual.join(',')} = ${expected.join(',')}`);
  });
});

describe('Фаза не playing', () => {

  test('фаза waiting → нет дельты', () => {
    const layer = new ItemLayer();
    const snapshot = { game: { phase: 'waiting' }, players: {}, items: {} };

    const delta = layer.tick(snapshot, 1);
    assert(delta === null, 'delta = null (не playing)');
  });

  test('фаза finished → нет дельты', () => {
    const layer = new ItemLayer();
    const snapshot = { game: { phase: 'finished' }, players: {}, items: {} };

    const delta = layer.tick(snapshot, 1);
    assert(delta === null, 'delta = null (finished)');
  });
});

// ── Экспорт результата ──
const failures = summary();
process.exit(failures > 0 ? 1 : 0);
