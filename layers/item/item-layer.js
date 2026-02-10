// layers/item/item-layer.js — Слой предметов (LAYERS pattern)
//
// Сущность: Item (предмет на игровом поле — яблоко или бомба)
// Полный цикл: генерация, сбор, подсчёт очков, раунды.
//
// ┌──────────────────────────────────────────────────────────────┐
// │  ItemLayer                                                    │
// │                                                                │
// │  Владеет:   state.items.*                                      │
// │  Модиф.:    state.players.*.score (при сборе предмета)        │
// │  Читает:    state.game.phase (для генерации/сброса)           │
// │  Действия:  collect                                            │
// │                                                                │
// │  Механика раундов:                                             │
// │    Раунд = все яблоки на поле собраны                          │
// │    Яблок:  ceil(round/2) → 1,1,2,2,3,3,4,4,...               │
// │    Бомб:   всегда 3, меняют позицию каждый раунд              │
// │                                                                │
// │  КЛЮЧЕВАЯ ДЕМОНСТРАЦИЯ LAYERS:                                 │
// │  Два игрока кликнули на один предмет в одном такте →           │
// │  обрабатываются последовательно внутри tick() →                │
// │  первый получает, второй — УПУЩЕНО. Атомарно.                 │
// └──────────────────────────────────────────────────────────────┘

class ItemLayer {
  constructor() {
    this.name = 'item';
    this._pendingActions = [];
    this._nextItemId = 0;
    this._gameActive = false;
    this._round = 0;
  }

  /**
   * Поставить действие в очередь (клик на предмет).
   */
  queueAction(action) {
    this._pendingActions.push(action);
  }

  /**
   * Тактовая функция.
   *
   * @param {object} snapshot — иммутабельный снимок (только чтение!)
   * @param {number} tickCount
   * @returns {object|null} delta
   */
  tick(snapshot, tickCount) {
    const phase = snapshot.game?.phase;

    // ── Сброс при завершении / ожидании ────────────────────────
    if (phase !== 'playing') {
      if (this._gameActive) {
        this._gameActive = false;
        this._round = 0;
      }
      // Сбрасываем очередь действий если игра не идёт
      this._pendingActions.splice(0);
      return null;
    }

    // ── Первый такт фазы playing → запуск раунда 1 ─────────────
    if (!this._gameActive) {
      this._gameActive = true;
      this._round = 0;
      this._pendingActions.splice(0); // Очищаем старые действия

      const delta = {};
      this._startNewRound(snapshot, delta);
      return Object.keys(delta).length > 0 ? delta : null;
    }

    // ── Обработка действий «collect» ───────────────────────────
    // КЛЮЧЕВОЙ МОМЕНТ: гонка состояния разрешается здесь.
    // Два клика на один предмет → первый в очереди побеждает.
    const delta = {};
    const actions = this._pendingActions.splice(0);

    for (const action of actions) {
      if (action.type !== 'collect') continue;

      const { playerId, itemId } = action;
      const item = snapshot.items?.[itemId];

      // Предмет не существует или уже собран в предыдущем такте?
      if (!item || item.collected) continue;

      // Предмет уже забрали ВНУТРИ ЭТОГО ТАКТА (другой игрок раньше в очереди)?
      if (delta.items?.[itemId]?.collected) continue;

      // ✅ Предмет свободен — забираем!
      if (!delta.items) delta.items = {};
      delta.items[itemId] = { collected: true, collectedBy: playerId };

      // Обновляем счёт (cross-layer write: item → player)
      const points = item.type === 'apple' ? 1 : -1;
      const currentScore = delta.players?.[playerId]?.score
        ?? snapshot.players?.[playerId]?.score
        ?? 0;

      if (!delta.players) delta.players = {};
      delta.players[playerId] = {
        ...(delta.players[playerId] || {}),
        score: currentScore + points
      };

      // Считаем собранные яблоки отдельно (для проверки целостности)
      if (item.type === 'apple') {
        const currentApples = delta.players[playerId].applesCollected
          ?? snapshot.players?.[playerId]?.applesCollected
          ?? 0;
        delta.players[playerId].applesCollected = currentApples + 1;
      }
    }

    // ── Проверка: все яблоки собраны → новый раунд ─────────────
    if (this._allApplesCollected(snapshot, delta)) {
      this._cleanupOldItems(snapshot, delta);
      this._startNewRound(snapshot, delta);
    }

    return Object.keys(delta).length > 0 ? delta : null;
  }

  // =====================
  //    PRIVATE — Раунды
  // =====================

  /**
   * Проверка: все яблоки на поле собраны?
   * Учитывает и снимок, и текущую дельту (для случая, когда
   * последнее яблоко собрано в этом же такте).
   */
  _allApplesCollected(snapshot, delta) {
    let hasApples = false;

    for (const [id, item] of Object.entries(snapshot.items || {})) {
      if (item.type !== 'apple') continue;
      if (item.collected) continue;         // Уже собрано в прошлом такте
      hasApples = true;
      if (delta.items?.[id]?.collected) continue; // Собрано в ЭТОМ такте
      return false; // Есть несобранное яблоко
    }

    return hasApples; // true если яблоки были и все собраны
  }

  /**
   * Удаление старых несобранных предметов (бомбы предыдущего раунда).
   * Собранные предметы сохраняются на 1 такт для эффектов "+1"/"-2" на клиенте.
   */
  _cleanupOldItems(snapshot, delta) {
    if (!delta.items) delta.items = {};

    for (const [id, item] of Object.entries(snapshot.items || {})) {
      // Убираем несобранные предметы (бомбы, которые никто не трогал)
      if (!item.collected && !delta.items[id]?.collected) {
        delta.items[id] = null; // null = удаление через deepMerge
      }
    }
  }

  /**
   * Запуск нового раунда.
   *
   * Количество яблок = ceil(round / 2):
   *   Раунд 1→1, Раунд 2→1, Раунд 3→2, Раунд 4→2, Раунд 5→3, ...
   *
   * Бомб всегда 3, они получают новые случайные позиции.
   * Все предметы размещаются на разных ячейках.
   */
  _startNewRound(snapshot, delta) {
    this._round++;
    const appleCount = Math.ceil(this._round / 2);

    // Обновляем статистику (cross-layer write: item → stats)
    const prevTotal = delta.stats?.totalApples ?? snapshot.stats?.totalApples ?? 0;
    if (!delta.stats) delta.stats = {};
    delta.stats.totalApples = prevTotal + appleCount;
    delta.stats.totalRounds = this._round;

    if (!delta.items) delta.items = {};

    // Множество занятых позиций (для предотвращения наложения)
    const occupied = new Set();

    // Генерация яблок
    for (let i = 0; i < appleCount; i++) {
      const id = `item_${this._nextItemId++}`;
      const pos = this._randomFreePosition(occupied);
      delta.items[id] = {
        id,
        type: 'apple',
        x: pos.x,
        y: pos.y,
        collected: false,
        collectedBy: null
      };
    }

    // Генерация 3 бомб (новые позиции каждый раунд)
    for (let i = 0; i < 3; i++) {
      const id = `item_${this._nextItemId++}`;
      const pos = this._randomFreePosition(occupied);
      delta.items[id] = {
        id,
        type: 'bomb',
        x: pos.x,
        y: pos.y,
        collected: false,
        collectedBy: null
      };
    }
  }

  /**
   * Случайная свободная позиция на поле 10x10.
   * Гарантирует, что два предмета не окажутся на одной ячейке.
   */
  _randomFreePosition(occupied) {
    let x, y, attempts = 0;
    do {
      x = Math.floor(Math.random() * 10);
      y = Math.floor(Math.random() * 10);
      attempts++;
    } while (occupied.has(`${x},${y}`) && attempts < 100);

    occupied.add(`${x},${y}`);
    return { x, y };
  }
}

module.exports = { ItemLayer };
