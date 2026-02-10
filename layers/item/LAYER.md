# Layer: ItemLayer

## Description
Manages game items (apples and bombs) on the 10x10 grid.
Handles item generation, collection, scoring, and **round-based progression**.

**This layer demonstrates the core LAYERS advantage:**
When two players click the same item in the same tick, actions are processed
sequentially inside `tick()`. The first player gets the item, the second gets
"MISSED!". This is guaranteed by the atomic tick architecture — no race conditions.

## Round Mechanics
A **round** ends when all apples on the field are collected.
- Apple count per round = `ceil(round / 2)`: **1, 1, 2, 2, 3, 3, 4, 4, ...**
- Bombs: always **3**, they reposition to random cells each new round.
- All items spawn on unique cells (no overlaps).
- Round progression creates increasing dynamics throughout the 30-second game.

## State Owned
```
state.items = {
  item_0: { id: 'item_0', type: 'apple', x: 3, y: 7, collected: false, collectedBy: null },
  item_1: { id: 'item_1', type: 'bomb',  x: 1, y: 2, collected: true,  collectedBy: 'player1' }
}
```

## State Modified (cross-layer)
```
state.players.*.score  — updated when a player collects an item (+1 apple, -2 bomb)
```

## State Read
```
state.game.phase       — determines when to generate items / reset rounds
state.players.*.score  — reads current score before updating
```

## Actions
| Action | Fields | Description |
|--------|--------|-------------|
| `collect` | `playerId`, `itemId` | Player attempts to collect an item. First clicker wins. |

## Delta Format
```javascript
// Collection (item + score change):
{
  items: { item_3: { collected: true, collectedBy: 'player1' } },
  players: { player1: { score: 5 } }
}

// New round — cleanup old + generate new:
{
  items: {
    item_5: null,  // remove old bomb (deepMerge null = delete)
    item_6: null,  // remove old bomb
    item_7: null,  // remove old bomb
    item_8: { id: 'item_8', type: 'apple', x: 4, y: 2, collected: false, collectedBy: null },
    item_9: { id: 'item_9', type: 'apple', x: 7, y: 9, collected: false, collectedBy: null },
    item_10: { id: 'item_10', type: 'bomb', x: 1, y: 3, collected: false, collectedBy: null },
    item_11: { id: 'item_11', type: 'bomb', x: 8, y: 5, collected: false, collectedBy: null },
    item_12: { id: 'item_12', type: 'bomb', x: 0, y: 6, collected: false, collectedBy: null }
  }
}
```

## Race Condition Resolution
```
Tick N:
  Action queue: [player1:collect:item_3, player2:collect:item_3]
  
  Processing player1 → item_3 not in delta.items → COLLECT → delta.items.item_3.collected = true
  Processing player2 → item_3 IS in delta.items → SKIP (MISSED!)
  
  Result delta: only player1 gets the item. Deterministic.
```

## Round Transition Flow
```
Tick N:
  1. Process collect actions → last apple collected in delta
  2. _allApplesCollected() checks snapshot + delta → all apples collected
  3. _cleanupOldItems() → null out uncollected bombs
  4. _startNewRound() → generate ceil(round/2) apples + 3 bombs at unique cells
  
  All in ONE atomic delta.
```

## Notes for AI Agent
- Item generation happens in THIS layer (not GameLogicLayer) because items are this layer's entity.
- Score modification crosses into PlayerLayer's domain — this is an intentional cross-layer write.
- `_gameActive` flag tracks game transitions to avoid duplicate generation.
- `_round` counter resets to 0 when game phase leaves 'playing'.
- `_randomFreePosition()` ensures all items in a round occupy unique cells.
