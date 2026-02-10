# Layer: PlayerLayer

## Description
Manages player entities: registration, readiness, and player data.
Each player has an ID, name, score, and ready status.
This layer is the single authority for creating and removing players from the game state.

## State Owned
```
state.players = {
  player1: { id: 'player1', name: 'Alice', score: 0, ready: false },
  player2: { id: 'player2', name: 'Bob',   score: 0, ready: true  }
}
```
**Properties managed:**
- `players.*.id` — unique player identifier
- `players.*.name` — display name
- `players.*.score` — initialized to 0 (modified by ItemLayer on collection)
- `players.*.ready` — readiness flag

## State Read
None — PlayerLayer does not depend on other layers' state.

## Actions
| Action | Fields | Description |
|--------|--------|-------------|
| `add_player` | `playerId`, `name` | Register a new player in state |
| `remove_player` | `playerId` | Remove player from state (sets to null) |
| `ready` | `playerId` | Mark player as ready |

## Delta Format
```javascript
// Adding a player:
{ players: { player1: { id: 'player1', name: 'Alice', score: 0, ready: false } } }

// Ready:
{ players: { player1: { ready: true } } }

// Removing a player:
{ players: { player1: null } }
```

## Notes for AI Agent
- Score is initialized here but MODIFIED by ItemLayer (cross-layer write via delta).
- Ready flag triggers game start logic in GameLogicLayer.
- This layer has NO dependencies — it can be tested in complete isolation.
