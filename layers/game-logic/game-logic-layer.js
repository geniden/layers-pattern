// layers/game-logic/game-logic-layer.js — Слой игровой логики (LAYERS pattern)
//
// Сущность: Game (состояние игры, фазы, таймеры)
// Полный цикл: машина состояний waiting → countdown → playing → finished.
//
// ┌────────────────────────────────────────────────────────────┐
// │  GameLogicLayer                                             │
// │                                                              │
// │  Владеет:   state.game.*                                     │
// │  Читает:    state.players.* (проверка готовности)            │
// │  Действия:  нет (реактивный слой — реагирует на состояние)  │
// │                                                              │
// │  Машина состояний:                                           │
// │    waiting ──(все готовы)──→ countdown                        │
// │    countdown ──(5 сек)────→ playing                           │
// │    playing ──(30 сек)─────→ finished                          │
// └────────────────────────────────────────────────────────────┘

class GameLogicLayer {
  constructor() {
    this.name = 'game-logic';
  }

  /**
   * Тактовая функция — машина состояний игры.
   * Этот слой НЕ получает внешних действий — он полностью реактивный.
   * Читает снимок состояния и решает, нужна ли смена фазы.
   *
   * @param {object} snapshot — иммутабельный снимок (только чтение!)
   * @param {number} tickCount
   * @returns {object|null} delta
   */
  tick(snapshot, tickCount) {
    const game = snapshot.game;
    if (!game) return null;

    switch (game.phase) {

      // ── WAITING: ждём пока все игроки нажмут «Готов» ──────
      case 'waiting':
        return this._checkAllReady(snapshot);

      // ── COUNTDOWN: обратный отсчёт 5-4-3-2-1 ─────────────
      case 'countdown':
        return this._tickCountdown(snapshot);

      // ── PLAYING: игра идёт, таймер 30 секунд ─────────────
      case 'playing':
        return this._tickPlaying(snapshot);

      // ── FINISHED: игра окончена ───────────────────────────
      case 'finished':
        return null; // Ничего не делаем — сервер обработает сброс
    }

    return null;
  }

  // =====================
  //    PRIVATE
  // =====================

  /**
   * Проверка: все ли игроки готовы?
   * Требуется минимум 2 игрока, все с ready: true.
   */
  _checkAllReady(snapshot) {
    const playerIds = Object.keys(snapshot.players || {});
    if (playerIds.length < 2) return null;

    const allReady = playerIds.every(id => snapshot.players[id].ready);
    if (!allReady) return null;

    // Все готовы → переход в countdown
    return {
      game: {
        phase: 'countdown',
        countdown: 5,
        phaseStartTime: Date.now()
      }
    };
  }

  /**
   * Обратный отсчёт: 5 → 4 → 3 → 2 → 1 → playing
   */
  _tickCountdown(snapshot) {
    const game = snapshot.game;
    if (!game.phaseStartTime) return null;

    const elapsed = Math.floor((Date.now() - game.phaseStartTime) / 1000);

    if (elapsed < 5) {
      const newCountdown = 5 - elapsed;
      // Обновляем только если значение изменилось
      if (newCountdown !== game.countdown) {
        return { game: { countdown: newCountdown } };
      }
      return null;
    }

    // 5 секунд прошло → переход в playing
    return {
      game: {
        phase: 'playing',
        countdown: 0,
        gameTime: 30,
        phaseStartTime: Date.now()
      }
    };
  }

  /**
   * Игровой процесс: таймер 30 → 0
   */
  _tickPlaying(snapshot) {
    const game = snapshot.game;
    if (!game.phaseStartTime) return null;

    const elapsed = Math.floor((Date.now() - game.phaseStartTime) / 1000);
    const newGameTime = Math.max(0, 30 - elapsed);

    if (newGameTime <= 0) {
      // Время вышло → переход в finished
      return {
        game: {
          phase: 'finished',
          gameTime: 0
        }
      };
    }

    // Обновляем только если значение изменилось
    if (newGameTime !== game.gameTime) {
      return { game: { gameTime: newGameTime } };
    }

    return null;
  }
}

module.exports = { GameLogicLayer };
