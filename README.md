# LAYERS Pattern

**Tick-based architectural pattern for deterministic real-time applications.**

LAYERS eliminates race conditions by design. Every tick: snapshot the state, collect deltas from layers, apply them atomically. Two users click the same item at the same moment — only one gets it. Deterministic, reproducible, no locks.

**Live Demo:** [http://91.201.40.187:3000/](http://91.201.40.187:3000/) — Apple Rush, a 2-player real-time game

---

## How It Works

```
┌──────────────────────────────────────────────────────────┐
│                     LAYERS Architecture                   │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  StateLayer (single source of truth)                │  │
│  │  • players: { p1: { score, ready }, ... }           │  │
│  │  • items: { item1: { type, x, y, collected }, ... } │  │
│  │  • game: { phase, countdown, gameTime }             │  │
│  └─────────────────────────────────────────────────────┘  │
│                        ↕ read / delta                     │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Entity Layers (each layer = one entity)            │  │
│  │  ├── PlayerLayer    → players, readiness, scores    │  │
│  │  ├── ItemLayer      → items, collection, rounds     │  │
│  │  └── GameLogicLayer → phases, timers (reactive)     │  │
│  └─────────────────────────────────────────────────────┘  │
│                        ↓ deltas                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  TickEngine (60 FPS)                                │  │
│  │  1. Snapshot   — immutable copy of state            │  │
│  │  2. Collect    — each layer returns a delta          │  │
│  │  3. Commit     — all deltas applied atomically       │  │
│  │  4. Broadcast  — clients receive the new state       │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

## Key Guarantees

- **No race conditions** — all layers see the same immutable snapshot per tick
- **Deterministic** — same inputs produce the same output, always
- **Atomic commits** — deltas from all layers are applied together, no partial state
- **Debuggable** — snapshot history enables time-travel debugging
- **Modular** — each layer is self-contained and independently testable

## Quick Start

```bash
# Clone the repository
git clone https://github.com/geniden/layers-pattern.git
cd layers-pattern

# Install dependencies
npm install

# Start the server
npm start

# Open two browser tabs at http://localhost:3000 and play!
```

## Run Tests

```bash
npm test
```

## Project Structure

```
layers-pattern/
├── core/                           # LAYERS Core (reusable engine)
│   ├── state-layer.js              #   Single state object + delta mechanics
│   └── tick-engine.js              #   Tick loop: snapshot → deltas → commit
│
├── layers/                         # Entity layers (game-specific)
│   ├── player/
│   │   ├── player-layer.js         #   Player management (add, remove, ready)
│   │   └── LAYER.md                #   Layer documentation
│   ├── item/
│   │   ├── item-layer.js           #   Items, collection, race resolution
│   │   └── LAYER.md                #   Layer documentation
│   └── game-logic/
│       ├── game-logic-layer.js     #   Phase state machine (reactive)
│       └── LAYER.md                #   Layer documentation
│
├── server/
│   └── game-server.js              # HTTP + WebSocket server, session management
│
├── client/
│   ├── index.html                  # Game UI (single-file, no build step)
│   └── debug.html                  # Debug panel (snapshot history viewer)
│
├── tests/                          # Unit tests for each layer
│   ├── run-all.js
│   ├── test-player-layer.js
│   ├── test-item-layer.js
│   └── test-game-logic-layer.js
│
├── LAYER-TEMPLATE.md               # Template for creating new layers
├── package.json
├── LICENSE                         # MIT
└── README.md
```

## The Pattern in 30 Seconds

Every **entity** lives on its own **layer**. Each layer:
- **Owns** a slice of state (e.g., `state.players`, `state.items`)
- **Reads** the shared snapshot (immutable, same for all layers per tick)
- **Returns a delta** (a plain object describing what changed)
- **Never mutates** the snapshot or state directly

The **TickEngine** runs at 60 FPS:
1. Takes an immutable **snapshot** of the entire state
2. Calls `tick(snapshot)` on each layer, collecting deltas
3. **Applies all deltas atomically** in one commit
4. Broadcasts the new state to all clients

This is why race conditions are impossible:

```
Tick N:
  Action queue: [player1:collect:item_3, player2:collect:item_3]

  Processing player1 → item_3 not collected → COLLECT → delta marks item_3 as collected
  Processing player2 → item_3 IS in delta   → SKIP (MISSED!)

  Result: only player1 gets the item. Deterministic. Always.
```

## Demo Game: Apple Rush

A 2-player real-time game demonstrating the LAYERS pattern:

- **Two players** connect via WebSocket
- **Apples** appear on a 10x10 grid — click to collect (+1 point)
- **Bombs** are scattered — avoid them (-1 point)
- **30 seconds** to score the most
- **Simultaneous clicks** on the same item — only one player gets it (guaranteed by LAYERS)

### Phases

```
waiting → countdown (5s) → playing (30s) → finished
```

### Round Progression

Apples per round increase: 1, 1, 2, 2, 3, 3, 4, 4...
A round ends when all apples are collected, increasing the game tempo.

## Creating Your Own Layer

See [LAYER-TEMPLATE.md](LAYER-TEMPLATE.md) for a step-by-step guide.

Every layer must implement:

```javascript
class MyLayer {
  constructor() {
    this.name = 'my-layer';         // Unique layer name
    this._pendingActions = [];       // Action queue
  }

  queueAction(action) {
    this._pendingActions.push(action);
  }

  tick(snapshot, tickCount) {
    // 1. Read from snapshot (NEVER mutate it)
    // 2. Process pending actions
    // 3. Return a delta object (or null if no changes)
    return { myState: { key: 'value' } };
  }
}
```

## LAYERS vs Traditional Approach

| Scenario | Traditional | LAYERS |
|----------|------------|--------|
| Two clicks on same item | Both get points (race condition) | Only first player (atomic commit) |
| State synchronization | Delays, desync possible | Perfect sync (60 FPS ticks) |
| Adding a new entity | Rewrite shared logic | Add a new layer file |
| Debugging a bug | Trace through socket events | Replay snapshot history |
| Testing | Mock everything | Test layer in isolation with snapshot |

## Debug Panel

Open `/debug` in the browser to access the snapshot history viewer:
- View state at any tick
- Inspect deltas from each layer
- Time-travel through the game

API endpoints:
- `GET /api/debug/sessions` — list active sessions
- `GET /api/debug/session/:id/history?last=50` — recent snapshots
- `GET /api/debug/session/:id/tick/:tick` — specific tick data
- `GET /api/debug/session/:id/snapshot` — current full state

## Philosophy

LAYERS is inspired by how printed circuit boards are designed — multiple independent layers, each with its own responsibility, stacked together into a coherent system. The state layer is the shared bus connecting all entity layers.

The pattern is particularly suited for:
- **Real-time multiplayer games** — deterministic state, no cheating
- **Collaborative applications** — conflict-free edits
- **Simulations** — reproducible tick-by-tick execution
- **AI agent architectures** — each agent as a layer with shared state

## Author

Created by **Anton Emelyanov** — concept, architecture, and implementation of the LAYERS pattern.

- GitHub: [@geniden](https://github.com/geniden)
- Email: geniden@gmail.com

## License

[MIT](LICENSE) — Copyright (c) 2026 Anton Emelyanov
