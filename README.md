# LAYERS Pattern

**Architectural pattern for deterministic state management in real-time and request-driven applications.**

LAYERS eliminates race conditions by design: snapshot the state, collect deltas from isolated layers, apply them atomically. Two users click the same item at the same moment — only one gets it. Deterministic, reproducible, no locks.

Works in two modes: **Tick Mode** (real-time, continuous) and **Request Mode** (on-demand, event-driven).

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

## Two Modes

LAYERS works in two modes sharing the same core principles:

### Tick Mode (real-time)

```
TickEngine runs continuously (e.g. 60 FPS):

  tick 1: snapshot → collect deltas → atomic commit → broadcast
  tick 2: snapshot → collect deltas → atomic commit → broadcast
  tick 3: snapshot → collect deltas → atomic commit → broadcast
  ...every 16ms
```

The engine runs **continuously**. User actions queue up and are processed together on the next tick. Conflicts between simultaneous actions are resolved deterministically within a single tick.

**Use for:** multiplayer games, collaborative editing (Google Docs-style), IoT monitoring, trading systems, simulations, chat with presence indicators.

### Request Mode (on-demand)

```
Incoming request (HTTP, event, message):

  request → snapshot → layer.process(action) → delta → atomic commit → response
  (wait for next request)
```

**No tick loop.** The snapshot → delta → commit cycle runs once per incoming event. Same guarantees (immutable snapshots, atomic commits, layer isolation), but without the overhead of a continuous loop.

**Use for:** REST APIs, CRUD applications, e-commerce (order = check inventory + charge payment + create shipment — three layers, one atomic commit), CMS, admin panels, batch processing.

### What Both Modes Share

| Principle | Description |
|-----------|-------------|
| Immutable snapshots | Layers always read a frozen copy of state |
| Delta-based writes | Layers never mutate state directly — only return deltas |
| Atomic commit | All deltas applied together, no partial state |
| Layer isolation | Each layer is independent with its own `LAYER.md` contract |
| Time-travel debugging | Snapshot history for replay and analysis |

> **Tip:** Tick rate is configurable. 60 FPS is for games. Business logic may use 1-10 ticks/sec. Request Mode uses 0 ticks/sec — only on demand.

---

## Why LAYERS for AI Agents

LAYERS is uniquely suited for AI/LLM agent development:

**1. Self-documenting layers**
Each layer has a `LAYER.md` contract — a structured description of what the layer owns, reads, and does. An AI agent can read this file and understand the layer's purpose without reading the code.

```
layers/player/LAYER.md:
  State Owned:  state.players.*
  State Read:   none
  Actions:      add_player, remove_player, ready
  Delta Format: { players: { player1: { ... } } }
```

**2. Complete isolation**
An AI agent can rewrite an entire layer without breaking other layers. The contract (`LAYER.md`) defines inputs and outputs — as long as the contract is honored, the implementation can change freely.

**3. Deterministic testing**
Given the same snapshot + actions → always the same delta. AI agents can write tests with confidence: no flaky tests, no timing issues, no mocks needed.

**4. Snapshot history for debugging**
When something goes wrong, the AI agent can inspect the snapshot history — see exactly what happened at every tick, which layer produced which delta, and replay the sequence to find the bug.

**5. Composable architecture**
Need a new feature? Create a new layer. The AI agent generates a `LAYER.md` contract, implements the layer, writes tests — all without touching existing layers.

---

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

## FAQ

### How is this different from the Actor model?

Actors isolate **processes** — each actor has its own state and communicates via messages. LAYERS isolates **state in time** — all layers see the same immutable snapshot at the same moment, and changes are committed atomically. Actors can have race conditions between messages; LAYERS cannot.

### Why not use database transactions?

Database transactions use **locks** — they block concurrent access and create contention under load. LAYERS uses a **lock-free** approach: immutable snapshots for reading, deltas for writing, atomic commit once per tick. No locks, no contention, no deadlocks.

### Does it scale to 1000+ players?

Yes, through **tick domains**. Each domain runs its own TickEngine with its own state. For example, 1000 players across 10 domains of 100 players each. Domains can communicate through cross-domain deltas when needed.

### Is this only for games?

No. The Apple Rush demo is a game because it's the clearest way to demonstrate race condition resolution. LAYERS applies to any system where multiple sources modify shared state: collaborative editing, IoT data aggregation, order processing, financial operations, AI agent orchestration.

### Why 60 FPS on the server?

The tick rate is configurable. 60 FPS (16ms ticks) is optimal for games. For business logic, you might use 1-10 ticks/sec. In Request Mode, there's no tick loop at all — processing happens on demand.

### Can AI agents work with this pattern?

This is one of the strongest use cases. Each layer has a `LAYER.md` contract that an AI agent can read and understand. Layers are fully isolated, so an agent can rewrite one without breaking others. Deterministic behavior means tests are reliable. See [Why LAYERS for AI Agents](#why-layers-for-ai-agents).

## Philosophy

LAYERS is inspired by how printed circuit boards are designed — multiple independent layers, each with its own responsibility, stacked together into a coherent system. The state layer is the shared bus connecting all entity layers.

The pattern is particularly suited for:
- **Real-time multiplayer games** — deterministic state, no cheating
- **Collaborative applications** — conflict-free edits
- **Simulations** — reproducible tick-by-tick execution
- **AI agent architectures** — each agent as a layer with shared state
- **REST APIs and CRUD apps** — via Request Mode (no tick loop)
- **IoT and monitoring** — many sources writing to shared state

## Video Demo

*Coming soon* — a 90-second walkthrough showing race condition resolution in real-time.

## Author

Created by **Anton Emelyanov** — concept, architecture, and implementation of the LAYERS pattern.

- GitHub: [@geniden](https://github.com/geniden)
- Email: geniden@gmail.com

## License

[MIT](LICENSE) — Copyright (c) 2026 Anton Emelyanov
