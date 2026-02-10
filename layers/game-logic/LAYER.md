# Layer: GameLogicLayer

## Description
Controls the game phase state machine and timers.
This is a **reactive layer** — it has no external actions.
It reads the shared state snapshot and decides when to transition between phases.

## State Machine
```
  ┌─────────┐   all players   ┌───────────┐   5 seconds   ┌─────────┐   30 seconds   ┌──────────┐
  │ waiting │───── ready ────→│ countdown │──────────────→│ playing │───────────────→│ finished │
  └─────────┘                 └───────────┘               └─────────┘                └──────────┘
```

## State Owned
```
state.game = {
  phase: 'waiting',       // 'waiting' | 'countdown' | 'playing' | 'finished'
  countdown: 5,           // seconds remaining in countdown
  gameTime: 30,           // seconds remaining in game
  phaseStartTime: null    // timestamp when current phase started (for timing)
}
```

## State Read
```
state.players.*.ready    — checks if all players are ready (for waiting → countdown transition)
```

## Actions
None — this layer is fully reactive. It only reads state and produces deltas.

## Delta Format
```javascript
// Transition to countdown:
{ game: { phase: 'countdown', countdown: 5, phaseStartTime: 1707500000000 } }

// Countdown tick:
{ game: { countdown: 3 } }

// Transition to playing:
{ game: { phase: 'playing', countdown: 0, gameTime: 30, phaseStartTime: 1707500005000 } }

// Game time tick:
{ game: { gameTime: 22 } }

// Game over:
{ game: { phase: 'finished', gameTime: 0 } }
```

## Notes for AI Agent
- This layer reads `state.players` but does NOT modify it — clean separation.
- Timing uses `Date.now()` stored in `phaseStartTime` for accurate wall-clock timing.
- ItemLayer watches `game.phase` to know when to generate items.
- Phase transitions happen with one-tick delay: if PlayerLayer sets ready on tick N,
  GameLogicLayer sees it on tick N+1 (because it reads the snapshot from before tick N's deltas).
  This is by design — discrete time guarantees consistency.
