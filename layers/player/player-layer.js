// layers/player/player-layer.js — Слой игрока (LAYERS pattern)
//
// Сущность: Player (игрок)
// Полный цикл: регистрация, готовность, управление данными игрока.
//
// ┌──────────────────────────────────────────────────┐
// │  PlayerLayer                                      │
// │                                                    │
// │  Владеет:   state.players.*                        │
// │  Читает:    — (не зависит от других слоёв)        │
// │  Действия:  add_player, remove_player, ready      │
// │                                                    │
// │  Дельта:    { players: { [id]: { ... } } }        │
// └──────────────────────────────────────────────────┘
//
// LAYERS Flow:
//   1. Внешнее событие (подключение, клик «Готов») → queueAction()
//   2. TickEngine вызывает tick(snapshot, tickCount)
//   3. Слой читает snapshot + обрабатывает _pendingActions
//   4. Возвращает дельту (НЕ мутирует snapshot!)
//   5. TickEngine применяет дельту атомарно

class PlayerLayer {
  constructor() {
    this.name = 'player';
    this._pendingActions = [];
  }

  /**
   * Поставить действие в очередь.
   * Вызывается сервером при получении сообщения от клиента.
   * Обработка произойдёт на следующем такте.
   */
  queueAction(action) {
    this._pendingActions.push(action);
  }

  /**
   * Тактовая функция — вызывается TickEngine каждый такт.
   *
   * @param {object} snapshot — иммутабельный снимок всего состояния (только чтение!)
   * @param {number} tickCount — номер текущего такта
   * @returns {object|null} delta — объект с изменениями или null
   */
  tick(snapshot, tickCount) {
    const actions = this._pendingActions.splice(0);
    if (actions.length === 0) return null;

    const delta = {};

    for (const action of actions) {
      switch (action.type) {

        // ── Добавление нового игрока ────────────────────
        case 'add_player': {
          if (!delta.players) delta.players = {};
          delta.players[action.playerId] = {
            id: action.playerId,
            name: action.name || action.playerId,
            score: 0,
            applesCollected: 0,
            ready: false
          };
          break;
        }

        // ── Удаление игрока ─────────────────────────────
        case 'remove_player': {
          if (!delta.players) delta.players = {};
          delta.players[action.playerId] = null; // null = удаление через deepMerge
          break;
        }

        // ── Игрок нажал «Готов» ─────────────────────────
        case 'ready': {
          const player = snapshot.players?.[action.playerId];
          if (player && !player.ready) {
            if (!delta.players) delta.players = {};
            delta.players[action.playerId] = {
              ...(delta.players[action.playerId] || {}),
              ready: true
            };
          }
          break;
        }
      }
    }

    return Object.keys(delta).length > 0 ? delta : null;
  }
}

module.exports = { PlayerLayer };
