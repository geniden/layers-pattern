// core/state-layer.js — Единый слой состояния (LAYERS pattern)
//
// Центральный объект состояния всего приложения.
// ВСЕ слои читают из него через getSnapshot() — получают иммутабельный снимок.
// НИКТО не пишет в state напрямую — только через proposeDelta() или через дельты из tick().
// Коммит всех дельт происходит АТОМАРНО раз в такт через applyDeltas().
//
// Это гарантирует:
//   ✅ Нет гонок записей — все изменения в один момент
//   ✅ Детерминизм — при одинаковых дельтах → одинаковый результат
//   ✅ Видимость — любой слой видит полное состояние через снимок
//   ✅ Отладка — debugSnapshot() показывает полную картину в любой момент

class StateLayer {
  constructor() {
    this.state = {};            // Единый объект состояния
    this._pendingDeltas = [];   // Дельты от proposeDelta(), ждут следующего коммита
  }

  // =====================
  //    ИНИЦИАЛИЗАЦИЯ
  // =====================

  /**
   * Установка начального состояния.
   * Вызывается один раз при создании сессии.
   */
  init(initialState) {
    this.state = JSON.parse(JSON.stringify(initialState));
  }

  // =====================
  //    ЧТЕНИЕ (для слоёв)
  // =====================

  /**
   * Иммутабельный снимок текущего состояния.
   * Слои получают его в tick() и используют ТОЛЬКО для чтения.
   * Гарантия: снимок не изменится, пока слой вычисляет дельту.
   */
  getSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Прямая ссылка на состояние (для рассылки клиентам).
   * НЕ использовать для записи!
   */
  getState() {
    return this.state;
  }

  // =====================
  //    ЗАПИСЬ (через дельты)
  // =====================

  /**
   * Предложение дельты из внешнего источника (не из tick()).
   * Примеры: добавление игрока при подключении, удаление при отключении.
   * Дельта будет применена на следующем такте вместе с дельтами от слоёв.
   *
   * @param {string} layerName — имя слоя-источника (для отладки)
   * @param {object} delta — объект с изменениями (глубокий мерж)
   */
  proposeDelta(layerName, delta) {
    this._pendingDeltas.push({ layer: layerName, delta });
  }

  /**
   * Извлечение и очистка накопленных внешних дельт.
   * Вызывается TickEngine раз в такт.
   */
  flushPendingDeltas() {
    const deltas = this._pendingDeltas;
    this._pendingDeltas = [];
    return deltas;
  }

  /**
   * Атомарное применение массива дельт к состоянию.
   * Вызывается TickEngine ОДИН раз за такт — после сбора всех дельт.
   *
   * @param {Array<{layer: string, delta: object}>} deltas
   */
  applyDeltas(deltas) {
    for (const { delta } of deltas) {
      this._deepMerge(this.state, delta);
    }
  }

  // =====================
  //    ОТЛАДКА
  // =====================

  /**
   * Полный дамп состояния для отладки.
   * AI-агент может вызвать это в любой момент и увидеть ВСЮ картину.
   */
  debugSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  // =====================
  //    PRIVATE
  // =====================

  /**
   * Глубокое слияние source в target.
   * - Вложенные объекты: рекурсивный мерж
   * - null/undefined: удаление ключа (поддержка удаления сущностей)
   * - Примитивы и массивы: перезапись
   */
  _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      const val = source[key];

      if (val === null || val === undefined) {
        // Удаление ключа (например, удаление игрока)
        delete target[key];
      } else if (typeof val === 'object' && !Array.isArray(val)) {
        // Вложенный объект — рекурсивный мерж
        if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
          target[key] = {};
        }
        this._deepMerge(target[key], val);
      } else {
        // Примитив или массив — перезапись
        target[key] = val;
      }
    }
  }
}

module.exports = { StateLayer };
