// server/game-server.js — Сервер Apple Rush (LAYERS pattern)
//
// Точка входа: HTTP-сервер + WebSocket-сервер + управление сессиями.
// Каждая игровая сессия содержит полный LAYERS-стек:
//   StateLayer (единое состояние) + TickEngine (тактовый цикл)
//   + PlayerLayer + ItemLayer + GameLogicLayer
//
// Сервер НЕ содержит игровую логику — он только маршрутизирует
// действия игроков к соответствующим слоям.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// ── LAYERS Core ──────────────────────────────────────────────
const { StateLayer } = require('../core/state-layer');
const { TickEngine } = require('../core/tick-engine');

// ── LAYERS Сущности (каждый слой — самодостаточный) ──────────
const { PlayerLayer } = require('../layers/player/player-layer');
const { ItemLayer } = require('../layers/item/item-layer');
const { GameLogicLayer } = require('../layers/game-logic/game-logic-layer');

const PORT = process.env.PORT || 3000;

// ============================================================
//  GameSession — одна игровая сессия (полный LAYERS-стек)
// ============================================================
class GameSession {
  constructor(id, creatorName) {
    this.id = id;
    this.createdAt = Date.now();
    this.creatorName = creatorName;
    this.status = 'waiting'; // waiting | playing | finished
    this.players = new Map(); // playerId → { ws, name }

    // ════════════════════════════════════════════════
    //  LAYERS Architecture — сборка стека
    // ════════════════════════════════════════════════

    // 1. Единый слой состояния
    this.stateLayer = new StateLayer();
    this.stateLayer.init({
      players: {},
      items: {},
      game: {
        phase: 'waiting',
        countdown: 5,
        gameTime: 30,
        phaseStartTime: null
      },
      stats: {
        totalApples: 0,     // Всего яблок появилось на поле
        totalRounds: 0       // Всего раундов сыграно
      },
      tickCount: 0
    });

    // 2. Слои-сущности (порядок регистрации = порядок обработки)
    this.playerLayer = new PlayerLayer();
    this.itemLayer = new ItemLayer();
    this.gameLogicLayer = new GameLogicLayer();

    // 3. Тактовый движок
    this.tickEngine = new TickEngine(16); // ~60 FPS
    this.tickEngine.setStateLayer(this.stateLayer);
    this.tickEngine.registerLayer(this.playerLayer);     // Сначала игроки
    this.tickEngine.registerLayer(this.gameLogicLayer);  // Затем логика игры
    this.tickEngine.registerLayer(this.itemLayer);       // Затем предметы

    // 4. На каждый такт — рассылка состояния клиентам
    this._lastBroadcast = 0;
    this.tickEngine.on('tick', ({ deltaCount }) => {
      // Оптимизация: рассылаем ~30 раз/сек ИЛИ когда есть изменения
      const now = Date.now();
      if (deltaCount > 0 || now - this._lastBroadcast >= 33) {
        this._lastBroadcast = now;
        this._broadcast();
      }

      // Отслеживание статуса сессии
      const phase = this.stateLayer.state.game?.phase;
      if (phase === 'playing') this.status = 'playing';
      if (phase === 'finished' && this.status !== 'finished') {
        this.status = 'finished';
        this._broadcast(); // Финальное обновление
        setTimeout(() => this.tickEngine.stop(), 2000);
      }
    });

    this.tickEngine.start();
  }

  // ── Добавление игрока (через delta!) ───────────────────────
  addPlayer(ws, playerName) {
    const playerNum = this.players.size + 1;
    const playerId = `player${playerNum}`;
    this.players.set(playerId, { ws, name: playerName });

    // Добавление через PlayerLayer (всё через дельты!)
    this.playerLayer.queueAction({
      type: 'add_player',
      playerId,
      name: playerName
    });

    return playerId;
  }

  // ── Маршрутизация действий к слоям ─────────────────────────
  handleAction(playerId, action) {
    switch (action.type) {
      case 'ready':
        // Действие «Готов» → PlayerLayer
        this.playerLayer.queueAction({ type: 'ready', playerId });
        break;

      case 'collect':
        // Клик на предмет → ItemLayer
        this.itemLayer.queueAction({ type: 'collect', playerId, itemId: action.itemId });
        break;
    }
  }

  // ── Рассылка ──────────────────────────────────────────────
  sendTo(playerId, data) {
    const player = this.players.get(playerId);
    if (player && player.ws.readyState === 1) {
      player.ws.send(JSON.stringify(data));
    }
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    // Удаление через PlayerLayer
    this.playerLayer.queueAction({ type: 'remove_player', playerId });
    if (this.players.size === 0) {
      this.tickEngine.stop();
    }
  }

  getInfo() {
    const playerNames = [];
    for (const [, p] of this.players) playerNames.push(p.name);
    return {
      id: this.id,
      creatorName: this.creatorName,
      playerCount: this.players.size,
      playerNames,
      status: this.status,
      createdAt: this.createdAt
    };
  }

  destroy() {
    this.tickEngine.stop();
    this.players.clear();
  }

  _broadcast() {
    const state = this.stateLayer.getState();
    const msg = JSON.stringify({ type: 'state_update', state });
    for (const [, { ws }] of this.players) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }
}

// ============================================================
//  Глобальное состояние сервера
// ============================================================
const sessions = new Map();
const clientInfo = new Map(); // ws → { sessionId, playerId }
let nextSessionId = 1;

// ============================================================
//  HTTP-сервер (раздача клиентских файлов)
// ============================================================
const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // ── Debug API endpoints (Snapshot History) ─────────────────
  if (url.pathname === '/api/debug/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    const list = [];
    for (const [id, session] of sessions) {
      list.push({
        id,
        creatorName: session.creatorName,
        status: session.status,
        playerCount: session.players.size,
        tickCount: session.tickEngine.tickCount,
        historyStats: session.tickEngine.getHistoryStats()
      });
    }
    res.end(JSON.stringify(list));
    return;
  }

  // /api/debug/session/:id/history?last=50
  const historyMatch = url.pathname.match(/^\/api\/debug\/session\/([^/]+)\/history$/);
  if (historyMatch) {
    const session = sessions.get(historyMatch[1]);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }
    const count = parseInt(url.searchParams.get('last') || '50');
    const history = session.tickEngine.getRecentHistory(count);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ sessionId: historyMatch[1], entries: history }));
    return;
  }

  // /api/debug/session/:id/tick/:tick
  const tickMatch = url.pathname.match(/^\/api\/debug\/session\/([^/]+)\/tick\/(\d+)$/);
  if (tickMatch) {
    const session = sessions.get(tickMatch[1]);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }
    const entry = session.tickEngine.getHistoryEntry(parseInt(tickMatch[2]));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(entry));
    return;
  }

  // /api/debug/session/:id/snapshot — текущий полный снимок
  const snapMatch = url.pathname.match(/^\/api\/debug\/session\/([^/]+)\/snapshot$/);
  if (snapMatch) {
    const session = sessions.get(snapMatch[1]);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(session.stateLayer.debugSnapshot()));
    return;
  }

  // ── Static file serving ────────────────────────────────────
  let filePath;
  if (url.pathname === '/' || url.pathname === '/index.html') {
    filePath = path.join(__dirname, '..', 'client', 'index.html');
  } else if (url.pathname === '/debug' || url.pathname === '/debug.html') {
    filePath = path.join(__dirname, '..', 'client', 'debug.html');
  } else {
    filePath = path.join(__dirname, '..', 'client', url.pathname);
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ============================================================
//  WebSocket-сервер
// ============================================================
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  console.log('[WS] Новое подключение');
  sendSessionList(ws);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleMessage(ws, msg);
    } catch (e) {
      console.error('[WS] Ошибка парсинга:', e.message);
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
    console.log('[WS] Отключение');
  });

  ws.on('error', (err) => {
    console.error('[WS] Ошибка:', err.message);
  });
});

// ============================================================
//  Обработка сообщений
// ============================================================
function handleMessage(ws, msg) {
  switch (msg.type) {

    case 'list_sessions':
      sendSessionList(ws);
      break;

    case 'create_session': {
      const playerName = (msg.playerName || 'Player').substring(0, 20);
      const sessionId = `game_${nextSessionId++}`;
      const session = new GameSession(sessionId, playerName);
      sessions.set(sessionId, session);

      const playerId = session.addPlayer(ws, playerName);
      clientInfo.set(ws, { sessionId, playerId });

      ws.send(JSON.stringify({ type: 'session_created', sessionId, playerId }));
      console.log(`[Session] ${sessionId} создана: "${playerName}"`);
      broadcastSessionList();
      break;
    }

    case 'join_session': {
      const session = sessions.get(msg.sessionId);
      if (!session) {
        ws.send(JSON.stringify({ type: 'error', message: 'Сессия не найдена' }));
        return;
      }
      if (session.players.size >= 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Сессия заполнена' }));
        return;
      }

      const playerName = (msg.playerName || 'Player').substring(0, 20);
      const playerId = session.addPlayer(ws, playerName);
      clientInfo.set(ws, { sessionId: msg.sessionId, playerId });

      ws.send(JSON.stringify({ type: 'session_joined', sessionId: msg.sessionId, playerId }));

      // Уведомляем первого игрока
      for (const [pid] of session.players) {
        if (pid !== playerId) {
          session.sendTo(pid, { type: 'opponent_joined', playerName });
        }
      }

      console.log(`[Session] "${playerName}" → ${msg.sessionId}`);
      broadcastSessionList();
      break;
    }

    case 'ready': {
      const info = clientInfo.get(ws);
      if (!info) return;
      const session = sessions.get(info.sessionId);
      if (!session) return;
      session.handleAction(info.playerId, { type: 'ready' });
      break;
    }

    case 'click': {
      const info = clientInfo.get(ws);
      if (!info) return;
      const session = sessions.get(info.sessionId);
      if (!session) return;
      session.handleAction(info.playerId, { type: 'collect', itemId: msg.itemId });
      break;
    }

    case 'leave_session': {
      const info = clientInfo.get(ws);
      if (!info) return;
      leaveSession(ws, info);
      sendSessionList(ws);
      break;
    }
  }
}

// ============================================================
//  Вспомогательные функции
// ============================================================
function handleDisconnect(ws) {
  const info = clientInfo.get(ws);
  if (info) leaveSession(ws, info);
  broadcastSessionList();
}

function leaveSession(ws, info) {
  const session = sessions.get(info.sessionId);
  if (session) {
    for (const [pid] of session.players) {
      if (pid !== info.playerId) {
        session.sendTo(pid, { type: 'opponent_left' });
      }
    }
    session.removePlayer(info.playerId);
    if (session.players.size === 0) {
      session.destroy();
      sessions.delete(info.sessionId);
      console.log(`[Session] ${info.sessionId} удалена`);
    }
  }
  clientInfo.delete(ws);
  broadcastSessionList();
}

function sendSessionList(ws) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'session_list', sessions: getOpenSessions() }));
  }
}

function broadcastSessionList() {
  const msg = JSON.stringify({ type: 'session_list', sessions: getOpenSessions() });
  for (const client of wss.clients) {
    if (client.readyState === 1 && !clientInfo.has(client)) {
      client.send(msg);
    }
  }
}

function getOpenSessions() {
  const list = [];
  for (const [, session] of sessions) {
    if (session.players.size < 2 && session.status === 'waiting') {
      list.push(session.getInfo());
    }
  }
  return list;
}

// ============================================================
//  Запуск
// ============================================================
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║     🍎 Apple Rush — LAYERS Pattern Demo      ║');
  console.log(`  ║     http://0.0.0.0:${PORT}                       ║`);
  console.log('  ║                                              ║');
  console.log('  ║  Architecture:                               ║');
  console.log('  ║    StateLayer → единое состояние             ║');
  console.log('  ║    TickEngine → снимок→дельты→коммит         ║');
  console.log('  ║    PlayerLayer + ItemLayer + GameLogicLayer  ║');
  console.log('  ║                                              ║');
  console.log('  ║  Open two browser tabs and play!             ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});
