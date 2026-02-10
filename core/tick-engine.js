// core/tick-engine.js — Тактовый движок (LAYERS pattern)
//
// Реализует цикл:
//   1. СНИМОК — иммутабельная копия текущего состояния
//   2. СБОР ДЕЛЬТ — каждый слой читает снимок и возвращает дельту
//   3. ВНЕШНИЕ ДЕЛЬТЫ — дельты от proposeDelta() (действия пользователей)
//   4. АТОМАРНЫЙ КОММИТ — все дельты применяются к состоянию разом
//   5. ОПОВЕЩЕНИЕ — подписчики получают уведомление (рассылка клиентам)
//
// Гарантии:
//   ✅ Все слои видят одинаковый снимок в рамках одного такта
//   ✅ Конфликты невозможны — дельты применяются последовательно в атомарном коммите
//   ✅ Детерминизм — при одинаковых входных данных → одинаковый результат

class TickEngine {
  constructor(tickRateMs = 16) {
    this.tickRateMs = tickRateMs;
    this.tickCount = 0;
    this.running = false;
    this.stateLayer = null;     // Ссылка на StateLayer
    this.layers = [];           // Зарегистрированные слои (упорядоченный список)
    this._handlers = {};
    this._interval = null;

    // ── Snapshot History (Time-Travel Debugging) ────────────
    // Сохраняем снимки только при наличии дельт (изменений).
    // AI-агент может использовать историю для:
    //   1. Отладки — посмотреть что произошло на конкретном такте
    //   2. Тестирования — взять реальный snapshot как входные данные для теста
    //   3. Воспроизведения — перемотка времени для анализа багов
    this._history = [];
    this._maxHistorySize = 600;  // ~10 секунд при 60fps (только такты с дельтами)
    this._historyEnabled = true;
  }

  /**
   * Привязка центрального слоя состояния.
   */
  setStateLayer(stateLayer) {
    this.stateLayer = stateLayer;
  }

  /**
   * Регистрация слоя-сущности.
   * Порядок регистрации определяет порядок обработки в такте.
   * Слой должен иметь: name (string), tick(snapshot, tickCount) → delta
   */
  registerLayer(layer) {
    this.layers.push(layer);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._interval = setInterval(() => this._runTick(), this.tickRateMs);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this._interval);
    this._interval = null;
  }

  /**
   * Один такт — полный цикл LAYERS.
   */
  _runTick() {
    this.tickCount++;

    // ─── 1. СНИМОК ─────────────────────────────────────────────
    // Иммутабельная копия состояния.
    // Все слои видят ОДИНАКОВЫЙ снимок — это ключевая гарантия.
    const snapshot = this.stateLayer.getSnapshot();

    // ─── 2. СБОР ДЕЛЬТ ОТ СЛОЁВ ───────────────────────────────
    // Каждый слой читает снимок, обрабатывает свои действия,
    // и возвращает дельту (объект с изменениями).
    // Слой НИКОГДА не мутирует снимок — только возвращает дельту.
    const allDeltas = [];

    for (const layer of this.layers) {
      try {
        const delta = layer.tick(snapshot, this.tickCount);
        if (delta && Object.keys(delta).length > 0) {
          allDeltas.push({ layer: layer.name, delta });
        }
      } catch (err) {
        console.error(`[TickEngine] Ошибка в слое "${layer.name}":`, err);
      }
    }

    // ─── 3. ВНЕШНИЕ ДЕЛЬТЫ ─────────────────────────────────────
    // Дельты от proposeDelta() — действия извне тактового цикла
    // (например, addPlayer при подключении по WebSocket).
    const externalDeltas = this.stateLayer.flushPendingDeltas();
    allDeltas.push(...externalDeltas);

    // ─── 4. АТОМАРНЫЙ КОММИТ ───────────────────────────────────
    // ВСЕ дельты применяются к состоянию РАЗОМ.
    // После этого состояние переходит в новую согласованную версию.
    if (allDeltas.length > 0) {
      this.stateLayer.applyDeltas(allDeltas);
    }
    this.stateLayer.state.tickCount = this.tickCount;

    // ─── 5. SNAPSHOT HISTORY (Time-Travel) ─────────────────────
    // Записываем ТОЛЬКО такты с изменениями — экономия памяти.
    // Каждая запись: { tick, timestamp, deltas[], snapshotAfter }
    if (this._historyEnabled && allDeltas.length > 0) {
      this._recordHistory(allDeltas);
    }

    // ─── 6. ОПОВЕЩЕНИЕ ────────────────────────────────────────
    this._emit('tick', { tickCount: this.tickCount, deltaCount: allDeltas.length });
  }

  // ══════════════════════════════════════════════════════════════
  //  SNAPSHOT HISTORY — Time-Travel Debugging
  // ══════════════════════════════════════════════════════════════

  /**
   * Записать текущий такт в историю.
   * Сохраняет: номер такта, время, дельты, и снимок ПОСЛЕ применения.
   */
  _recordHistory(deltas) {
    const entry = {
      tick: this.tickCount,
      timestamp: Date.now(),
      deltas: deltas.map(d => ({ layer: d.layer, delta: JSON.parse(JSON.stringify(d.delta)) })),
      snapshotAfter: this.stateLayer.getSnapshot()
    };

    this._history.push(entry);

    // Ограничение размера истории (FIFO)
    if (this._history.length > this._maxHistorySize) {
      this._history.shift();
    }
  }

  /**
   * Получить полную историю снапшотов.
   * AI-агент или debug-страница может использовать для:
   *   - Просмотра состояния на любом такте
   *   - Анализа дельт от каждого слоя
   *   - Воспроизведения последовательности изменений
   */
  getHistory() {
    return this._history;
  }

  /**
   * Получить запись конкретного такта.
   */
  getHistoryEntry(tick) {
    return this._history.find(e => e.tick === tick) || null;
  }

  /**
   * Получить последние N записей (для отображения в UI).
   */
  getRecentHistory(count = 50) {
    return this._history.slice(-count);
  }

  /**
   * Краткая статистика истории для debug-endpoints.
   */
  getHistoryStats() {
    if (this._history.length === 0) {
      return { entries: 0, firstTick: null, lastTick: null, totalDeltas: 0 };
    }
    const first = this._history[0];
    const last = this._history[this._history.length - 1];
    const totalDeltas = this._history.reduce((sum, e) => sum + e.deltas.length, 0);
    return {
      entries: this._history.length,
      firstTick: first.tick,
      lastTick: last.tick,
      totalDeltas,
      durationMs: last.timestamp - first.timestamp
    };
  }

  // ── Простая система событий ────────────────────────────────
  on(event, fn) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(fn);
  }

  off(event, fn) {
    if (!this._handlers[event]) return;
    this._handlers[event] = this._handlers[event].filter(f => f !== fn);
  }

  _emit(event, data) {
    const fns = this._handlers[event];
    if (fns) fns.forEach(fn => fn(data));
  }
}

module.exports = { TickEngine };
