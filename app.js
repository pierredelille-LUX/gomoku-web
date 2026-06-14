const BOARD_SIZE = 15;
const STAR_POINTS = new Set(["3,3", "3,7", "3,11", "7,3", "7,7", "7,11", "11,3", "11,7", "11,11"]);
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];
const AI_THINK_DELAY = 480;
const GENERIC_NAMES = new Set(["黑方", "白方", "玩家", "电脑 AI"]);

const $ = (selector) => document.querySelector(selector);
const boardEl = $("#board");
const moveListEl = $("#moveList");
const toastEl = $("#toast");

const els = {
  gameStatus: $("#gameStatus"),
  blackCard: $("#blackCard"),
  whiteCard: $("#whiteCard"),
  blackLabel: $("#blackLabel"),
  whiteLabel: $("#whiteLabel"),
  blackTimer: $("#blackTimer"),
  whiteTimer: $("#whiteTimer"),
  turnChip: $("#turnChip"),
  gameMode: $("#gameMode"),
  humanColor: $("#humanColor"),
  humanColorLabel: $("#humanColorLabel"),
  blackName: $("#blackName"),
  whiteName: $("#whiteName"),
  moveCount: $("#moveCount"),
  networkBadge: $("#networkBadge"),
  connectionState: $("#connectionState"),
  recordInput: $("#recordInput"),
  signalInput: $("#signalInput"),
  signalOutput: $("#signalOutput"),
  newGameBtn: $("#newGameBtn"),
  undoBtn: $("#undoBtn"),
  copyRecordBtn: $("#copyRecordBtn"),
  shareRecordBtn: $("#shareRecordBtn"),
  importRecordBtn: $("#importRecordBtn"),
  createOfferBtn: $("#createOfferBtn"),
  acceptOfferBtn: $("#acceptOfferBtn"),
  acceptAnswerBtn: $("#acceptAnswerBtn"),
  disconnectBtn: $("#disconnectBtn"),
  copySignalBtn: $("#copySignalBtn"),
};

let state = freshState();
let aiThinkingTimer = 0;
let aiThinking = false;
let toastTimer = 0;
let peer = {
  pc: null,
  channel: null,
  role: null,
  connected: false,
};

function freshState(names = getNames()) {
  const settings = getModeSettings();
  return {
    board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null)),
    current: "black",
    moves: [],
    winner: null,
    winningLine: [],
    names,
    mode: settings.mode,
    humanColor: settings.humanColor,
    aiColor: settings.aiColor,
    timeUsed: { black: 0, white: 0 },
    turnStartedAt: Date.now(),
    finishedAt: null,
  };
}

function getModeSettings() {
  const mode = els.gameMode?.value || "human";
  const humanColor = els.humanColor?.value || "black";
  return {
    mode,
    humanColor,
    aiColor: mode === "ai" ? oppositeColor(humanColor) : null,
  };
}

function getNames() {
  return {
    black: (els.blackName?.value || "黑方").trim() || "黑方",
    white: (els.whiteName?.value || "白方").trim() || "白方",
  };
}

function colorName(color) {
  return color === "black" ? state.names.black : state.names.white;
}

function colorText(color) {
  return color === "black" ? "黑方" : "白方";
}

function oppositeColor(color) {
  return color === "black" ? "white" : "black";
}

function isAIMode() {
  return state.mode === "ai";
}

function isAITurn(color = state.current) {
  return isAIMode() && state.aiColor === color && !state.winner;
}

function coordinate(row, col) {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

function createBoard() {
  boardEl.innerHTML = "";
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `${coordinate(row, col)} 空位`);
      if (row === 0) cell.classList.add("edge-top");
      if (row === BOARD_SIZE - 1) cell.classList.add("edge-bottom");
      if (col === 0) cell.classList.add("edge-left");
      if (col === BOARD_SIZE - 1) cell.classList.add("edge-right");
      if (STAR_POINTS.has(`${row},${col}`)) {
        cell.classList.add("star");
        const star = document.createElement("span");
        star.className = "star-point";
        cell.append(star);
      }
      cell.addEventListener("click", () => handleCellClick(row, col));
      boardEl.append(cell);
    }
  }
}

function handleCellClick(row, col) {
  if (state.winner) {
    showToast("本局已结束，请新开一局");
    return;
  }
  if (state.board[row][col]) return;
  if (peer.connected && peer.role && state.current !== peer.role) {
    showToast(`等待${colorName(state.current)}落子`);
    return;
  }
  if (isAITurn()) {
    showToast("电脑 AI 正在思考");
    return;
  }
  placeStone(row, col, { broadcast: true });
}

function commitTurnTime() {
  if (state.winner) return;
  const now = Date.now();
  state.timeUsed[state.current] += now - state.turnStartedAt;
  state.turnStartedAt = now;
}

function placeStone(row, col, options = {}) {
  if (!isInside(row, col) || state.board[row][col] || state.winner) return false;

  commitTurnTime();
  const color = state.current;
  state.board[row][col] = color;
  state.moves.push({ row, col, color, at: Date.now() });

  const line = findWinningLine(row, col, color);
  if (line.length >= 5) {
    state.winner = color;
    state.winningLine = line;
    state.finishedAt = Date.now();
  } else if (state.moves.length === BOARD_SIZE * BOARD_SIZE) {
    state.winner = "draw";
    state.finishedAt = Date.now();
  } else {
    state.current = color === "black" ? "white" : "black";
    state.turnStartedAt = Date.now();
  }

  render();
  if (options.broadcast) sendPeerMessage({ type: "move", row, col });
  if (!options.skipAI) scheduleAIMoveIfNeeded();
  return true;
}

function isInside(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function findWinningLine(row, col, color) {
  for (const [dr, dc] of DIRECTIONS) {
    const line = [[row, col]];
    let r = row + dr;
    let c = col + dc;
    while (isInside(r, c) && state.board[r][c] === color) {
      line.push([r, c]);
      r += dr;
      c += dc;
    }
    r = row - dr;
    c = col - dc;
    while (isInside(r, c) && state.board[r][c] === color) {
      line.unshift([r, c]);
      r -= dr;
      c -= dc;
    }
    if (line.length >= 5) return line;
  }
  return [];
}

function render() {
  const last = state.moves[state.moves.length - 1];
  const winningSet = new Set(state.winningLine.map(([row, col]) => `${row},${col}`));

  for (const cell of boardEl.children) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const color = state.board[row][col];
    const star = cell.querySelector(".star-point");
    cell.textContent = "";
    if (star) cell.append(star);

    if (color) {
      const stone = document.createElement("span");
      stone.className = `stone ${color}`;
      if (last && last.row === row && last.col === col) stone.classList.add("last");
      if (winningSet.has(`${row},${col}`)) stone.classList.add("win");
      cell.append(stone);
      cell.setAttribute("aria-label", `${coordinate(row, col)} ${colorText(color)}`);
    } else {
      cell.setAttribute("aria-label", `${coordinate(row, col)} 空位`);
    }
    cell.disabled = Boolean(state.winner || color || isAITurn());
  }

  els.blackLabel.textContent = state.names.black;
  els.whiteLabel.textContent = state.names.white;
  els.blackCard.classList.toggle("active", state.current === "black" && !state.winner);
  els.whiteCard.classList.toggle("active", state.current === "white" && !state.winner);
  els.moveCount.textContent = `${state.moves.length} 手`;
  els.turnChip.textContent = state.winner ? "已结束" : `第 ${state.moves.length + 1} 手`;

  if (state.winner === "draw") {
    els.gameStatus.textContent = "平局";
  } else if (state.winner) {
    els.gameStatus.textContent = `${colorName(state.winner)}获胜`;
  } else if (isAITurn()) {
    els.gameStatus.textContent = aiThinking ? "电脑 AI 思考中" : `${colorName(state.current)}落子`;
  } else {
    els.gameStatus.textContent = `${colorName(state.current)}落子`;
  }

  renderMoveList();
  renderTimers();
  notifyStateChanged();
}

function notifyStateChanged() {
  window.dispatchEvent(
    new CustomEvent("gomoku:statechange", {
      detail: { snapshot: exportCloudSnapshot() },
    }),
  );
}

function renderMoveList() {
  moveListEl.innerHTML = "";
  state.moves.forEach((move, index) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${index + 1}.</strong> ${colorText(move.color)} ${coordinate(move.row, move.col)}`;
    moveListEl.append(item);
  });
  moveListEl.scrollTop = moveListEl.scrollHeight;
}

function currentTime(color) {
  if (state.winner || state.current !== color) return state.timeUsed[color];
  return state.timeUsed[color] + Date.now() - state.turnStartedAt;
}

function renderTimers() {
  els.blackTimer.textContent = formatTime(currentTime("black"));
  els.whiteTimer.textContent = formatTime(currentTime("white"));
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function newGame(options = {}) {
  clearAIThinking();
  state = freshState(getNames());
  render();
  if (!options.silent) sendPeerMessage({ type: "reset", names: state.names });
  scheduleAIMoveIfNeeded();
}

function undoMove(options = {}) {
  clearAIThinking();
  if (!state.moves.length) return;
  undoSingleMove();
  if (isAIMode() && state.moves.length && state.current === state.aiColor) {
    undoSingleMove();
  }
  render();
  if (!options.silent) sendPeerMessage({ type: "undo" });
  scheduleAIMoveIfNeeded();
}

function undoSingleMove() {
  const last = state.moves.pop();
  if (!last) return;
  state.board[last.row][last.col] = null;
  state.winner = null;
  state.winningLine = [];
  state.finishedAt = null;
  state.current = last.color;
  state.turnStartedAt = Date.now();
}

function makeRecord() {
  return {
    app: "gomoku-web",
    version: 2,
    size: BOARD_SIZE,
    mode: state.mode,
    humanColor: state.humanColor,
    aiColor: state.aiColor,
    names: state.names,
    moves: state.moves.map(({ row, col, color }) => ({ row, col, color })),
    winner: state.winner,
    createdAt: new Date().toISOString(),
  };
}

function loadRecord(record) {
  if (!record || record.size !== BOARD_SIZE || !Array.isArray(record.moves)) {
    throw new Error("棋谱格式不正确");
  }
  const names = {
    black: record.names?.black || "黑方",
    white: record.names?.white || "白方",
  };
  if (record.mode === "ai" || record.mode === "human") {
    els.gameMode.value = record.mode;
  }
  if (record.humanColor === "black" || record.humanColor === "white") {
    els.humanColor.value = record.humanColor;
  }
  applyModeControls({ resetNames: false });
  els.blackName.value = names.black;
  els.whiteName.value = names.white;
  state = freshState(names);

  for (const move of record.moves) {
    if (!isInside(move.row, move.col)) throw new Error("棋谱包含越界落子");
    if (move.color !== state.current) throw new Error("棋谱手顺不正确");
    if (!placeStone(move.row, move.col, { broadcast: false, skipAI: true })) throw new Error("棋谱包含无效落子");
    if (state.winner && move !== record.moves[record.moves.length - 1]) break;
  }
  render();
  scheduleAIMoveIfNeeded();
}

async function copyText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(okMessage);
  } catch {
    showToast("浏览器阻止了复制，请手动选中文本复制");
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add("show");
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

function encodePayload(value) {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePayload(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function updateNames() {
  state.names = getNames();
  render();
  sendPeerMessage({ type: "names", names: state.names });
}

function applyModeControls(options = {}) {
  const settings = getModeSettings();
  if (settings.mode === "ai" && peer.pc) {
    disconnectPeer({ silent: true });
  }
  if (options.resetNames) {
    applyModeDefaultNames(settings);
  }
  if (els.humanColorLabel) {
    els.humanColorLabel.hidden = settings.mode !== "ai";
  }
  for (const button of [els.createOfferBtn, els.acceptOfferBtn, els.acceptAnswerBtn, els.copySignalBtn]) {
    button.disabled = settings.mode === "ai";
  }
  els.signalInput.disabled = settings.mode === "ai";
  els.signalOutput.disabled = settings.mode === "ai";
  if (state) {
    state.mode = settings.mode;
    state.humanColor = settings.humanColor;
    state.aiColor = settings.aiColor;
    state.names = getNames();
  }
  updateConnectionState(peer.connected ? `${colorText(peer.role)}已连接` : "未连接");
}

function applyModeDefaultNames(settings) {
  if (settings.mode === "ai") {
    const humanInput = settings.humanColor === "black" ? els.blackName : els.whiteName;
    const aiInput = settings.aiColor === "black" ? els.blackName : els.whiteName;
    if (GENERIC_NAMES.has(humanInput.value.trim())) humanInput.value = "玩家";
    aiInput.value = "电脑 AI";
    return;
  }
  if (els.blackName.value.trim() === "电脑 AI") els.blackName.value = "黑方";
  if (els.whiteName.value.trim() === "电脑 AI") els.whiteName.value = "白方";
}

function clearAIThinking() {
  clearTimeout(aiThinkingTimer);
  aiThinkingTimer = 0;
  aiThinking = false;
}

function scheduleAIMoveIfNeeded() {
  if (!isAITurn() || aiThinkingTimer) return;
  aiThinking = true;
  render();
  aiThinkingTimer = setTimeout(() => {
    aiThinkingTimer = 0;
    aiThinking = false;
    const move = chooseAIMove();
    if (move) {
      placeStone(move.row, move.col, { skipAI: true });
    } else {
      render();
    }
  }, AI_THINK_DELAY);
}

function chooseAIMove() {
  if (!isAIMode()) return null;
  const aiColor = state.aiColor;
  const humanColor = oppositeColor(aiColor);
  const candidates = getCandidateMoves();
  const winningMove = findImmediateWinningMove(aiColor, candidates);
  if (winningMove) return winningMove;
  const blockingMove = findImmediateWinningMove(humanColor, candidates);
  if (blockingMove) return blockingMove;

  let bestMove = candidates[0] || { row: 7, col: 7 };
  let bestScore = -Infinity;
  for (const move of candidates) {
    const attackScore = scoreMove(move.row, move.col, aiColor);
    const defenseScore = scoreMove(move.row, move.col, humanColor) * 0.94;
    const centerScore = 24 - Math.abs(move.row - 7) - Math.abs(move.col - 7);
    const nearScore = nearbyStoneCount(move.row, move.col) * 18;
    const score = attackScore + defenseScore + centerScore + nearScore;
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

function getCandidateMoves() {
  if (!state.moves.length) return [{ row: 7, col: 7 }];
  const candidates = new Map();
  for (const move of state.moves) {
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const row = move.row + dr;
        const col = move.col + dc;
        if (!isInside(row, col) || state.board[row][col]) continue;
        candidates.set(`${row},${col}`, { row, col });
      }
    }
  }
  return Array.from(candidates.values());
}

function findImmediateWinningMove(color, candidates) {
  for (const move of candidates) {
    state.board[move.row][move.col] = color;
    const wins = findWinningLine(move.row, move.col, color).length >= 5;
    state.board[move.row][move.col] = null;
    if (wins) return move;
  }
  return null;
}

function scoreMove(row, col, color) {
  if (state.board[row][col]) return -Infinity;
  let total = 0;
  let openFour = 0;
  let closedFour = 0;
  let openThree = 0;

  for (const [dr, dc] of DIRECTIONS) {
    const forward = scanLine(row, col, dr, dc, color);
    const backward = scanLine(row, col, -dr, -dc, color);
    const length = forward.count + backward.count + 1;
    const openEnds = Number(forward.open) + Number(backward.open);
    const score = patternScore(length, openEnds);
    total += score;

    if (length >= 4 && openEnds === 2) openFour += 1;
    if (length >= 4 && openEnds === 1) closedFour += 1;
    if (length === 3 && openEnds === 2) openThree += 1;
  }

  if (openFour) total += 70000 * openFour;
  if (closedFour >= 2) total += 52000;
  if (openFour && openThree) total += 68000;
  if (openThree >= 2) total += 46000;
  return total;
}

function scanLine(row, col, dr, dc, color) {
  let count = 0;
  let r = row + dr;
  let c = col + dc;
  while (isInside(r, c) && state.board[r][c] === color) {
    count += 1;
    r += dr;
    c += dc;
  }
  return {
    count,
    open: isInside(r, c) && state.board[r][c] === null,
  };
}

function patternScore(length, openEnds) {
  if (length >= 5) return 1000000;
  if (length === 4 && openEnds === 2) return 180000;
  if (length === 4 && openEnds === 1) return 72000;
  if (length === 3 && openEnds === 2) return 14500;
  if (length === 3 && openEnds === 1) return 2800;
  if (length === 2 && openEnds === 2) return 1400;
  if (length === 2 && openEnds === 1) return 320;
  if (length === 1 && openEnds === 2) return 90;
  return 8;
}

function nearbyStoneCount(row, col) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (isInside(r, c) && state.board[r][c]) count += 1;
    }
  }
  return count;
}

function setupEvents() {
  els.newGameBtn.addEventListener("click", () => newGame());
  els.undoBtn.addEventListener("click", () => undoMove());
  els.gameMode.addEventListener("change", () => {
    applyModeControls({ resetNames: true });
    newGame();
  });
  els.humanColor.addEventListener("change", () => {
    applyModeControls({ resetNames: true });
    newGame();
  });
  els.blackName.addEventListener("input", updateNames);
  els.whiteName.addEventListener("input", updateNames);

  els.copyRecordBtn.addEventListener("click", () => {
    const text = JSON.stringify(makeRecord(), null, 2);
    copyText(text, "棋谱已复制");
  });

  els.shareRecordBtn.addEventListener("click", () => {
    const url = `${location.origin}${location.pathname}#record=${encodePayload(makeRecord())}`;
    copyText(url, "棋谱链接已复制");
    history.replaceState(null, "", url);
  });

  els.importRecordBtn.addEventListener("click", () => {
    try {
      loadRecord(JSON.parse(els.recordInput.value));
      showToast("棋谱已导入");
    } catch (error) {
      showToast(error.message || "导入失败");
    }
  });

  els.createOfferBtn.addEventListener("click", createOffer);
  els.acceptOfferBtn.addEventListener("click", acceptOffer);
  els.acceptAnswerBtn.addEventListener("click", acceptAnswer);
  els.disconnectBtn.addEventListener("click", disconnectPeer);
  els.copySignalBtn.addEventListener("click", () => copyText(els.signalOutput.value, "连接码已复制"));
}

async function createOffer() {
  try {
    if (isAIMode()) throw new Error("人机模式下不能开启远程联机");
    preparePeer("black");
    peer.channel = peer.pc.createDataChannel("gomoku");
    setupChannel(peer.channel);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await waitForIce(peer.pc);
    els.signalOutput.value = encodePayload(peer.pc.localDescription);
    updateConnectionState("把创建码发给白方");
  } catch (error) {
    showToast(error.message || "创建连接失败");
  }
}

async function acceptOffer() {
  try {
    if (isAIMode()) throw new Error("人机模式下不能开启远程联机");
    const offer = decodePayload(els.signalInput.value.trim());
    preparePeer("white");
    await peer.pc.setRemoteDescription(offer);
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    await waitForIce(peer.pc);
    els.signalOutput.value = encodePayload(peer.pc.localDescription);
    updateConnectionState("把加入码发给黑方");
  } catch (error) {
    showToast(error.message || "生成加入码失败");
  }
}

async function acceptAnswer() {
  try {
    if (isAIMode()) throw new Error("人机模式下不能开启远程联机");
    if (!peer.pc) throw new Error("请先生成创建码");
    const answer = decodePayload(els.signalInput.value.trim());
    await peer.pc.setRemoteDescription(answer);
    updateConnectionState("正在连接");
  } catch (error) {
    showToast(error.message || "完成连接失败");
  }
}

function preparePeer(role) {
  disconnectPeer({ silent: true });
  peer = {
    pc: new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    }),
    channel: null,
    role,
    connected: false,
  };
  peer.pc.ondatachannel = (event) => {
    peer.channel = event.channel;
    setupChannel(peer.channel);
  };
  peer.pc.onconnectionstatechange = () => {
    if (peer.pc.connectionState === "connected") {
      peer.connected = true;
      updateConnectionState(`${colorText(peer.role)}已连接`);
    } else if (["failed", "closed", "disconnected"].includes(peer.pc.connectionState)) {
      peer.connected = false;
      updateConnectionState("未连接");
    } else {
      updateConnectionState(peer.pc.connectionState);
    }
  };
}

function setupChannel(channel) {
  channel.onopen = () => {
    peer.connected = true;
    updateConnectionState(`${colorText(peer.role)}已连接`);
    sendPeerMessage({ type: "sync", state: exportState() });
  };
  channel.onclose = () => {
    peer.connected = false;
    updateConnectionState("未连接");
  };
  channel.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handlePeerMessage(message);
  };
}

function handlePeerMessage(message) {
  if (message.type === "move") {
    placeStone(message.row, message.col, { broadcast: false });
  }
  if (message.type === "reset") {
    if (message.names) {
      els.blackName.value = message.names.black || "黑方";
      els.whiteName.value = message.names.white || "白方";
    }
    newGame({ silent: true });
  }
  if (message.type === "undo") {
    undoMove({ silent: true });
  }
  if (message.type === "names") {
    state.names = {
      black: message.names?.black || state.names.black,
      white: message.names?.white || state.names.white,
    };
    els.blackName.value = state.names.black;
    els.whiteName.value = state.names.white;
    render();
  }
  if (message.type === "sync" && message.state) {
    importState(message.state);
  }
}

function exportState() {
  return {
    app: "gomoku-web",
    version: 3,
    size: BOARD_SIZE,
    current: state.current,
    moves: state.moves.map(({ row, col, color, at }) => ({ row, col, color, at })),
    names: state.names,
    mode: state.mode,
    humanColor: state.humanColor,
    aiColor: state.aiColor,
    timeUsed: state.timeUsed,
    winner: state.winner,
    winningLine: state.winningLine,
    finishedAt: state.finishedAt,
  };
}

function exportCloudSnapshot() {
  return {
    ...exportState(),
    exportedAt: new Date().toISOString(),
  };
}

function importCloudSnapshot(snapshot) {
  if (!snapshot || snapshot.size !== BOARD_SIZE || !Array.isArray(snapshot.moves)) {
    throw new Error("云端棋局格式不正确");
  }
  clearAIThinking();
  importState(snapshot);
  scheduleAIMoveIfNeeded();
}

function importState(snapshot) {
  if (snapshot.mode === "ai" || snapshot.mode === "human") {
    els.gameMode.value = snapshot.mode;
  }
  if (snapshot.humanColor === "black" || snapshot.humanColor === "white") {
    els.humanColor.value = snapshot.humanColor;
  }
  applyModeControls({ resetNames: false });
  els.blackName.value = snapshot.names?.black || "黑方";
  els.whiteName.value = snapshot.names?.white || "白方";
  state = freshState(getNames());
  state.timeUsed = snapshot.timeUsed || { black: 0, white: 0 };
  for (const move of snapshot.moves || []) {
    state.board[move.row][move.col] = move.color;
    state.moves.push(move);
  }
  state.current = snapshot.current || (state.moves.length % 2 === 0 ? "black" : "white");
  state.winner = snapshot.winner || null;
  state.winningLine = snapshot.winningLine || [];
  state.finishedAt = snapshot.finishedAt || null;
  state.turnStartedAt = Date.now();
  render();
}

function sendPeerMessage(message) {
  if (peer.channel?.readyState === "open") {
    peer.channel.send(JSON.stringify(message));
  }
}

function disconnectPeer(options = {}) {
  if (peer.channel) peer.channel.close();
  if (peer.pc) peer.pc.close();
  peer = { pc: null, channel: null, role: null, connected: false };
  if (!options.silent) showToast("联机已断开");
  updateConnectionState("未连接");
}

function updateConnectionState(text) {
  els.connectionState.textContent = text;
  if (isAIMode()) {
    els.connectionState.textContent = "电脑 AI";
    els.networkBadge.textContent = "人机";
    return;
  }
  els.networkBadge.textContent = peer.connected ? colorText(peer.role) : "同屏";
}

function waitForIce(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, 5000);
    function done() {
      clearTimeout(timeout);
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }
    function onChange() {
      if (pc.iceGatheringState === "complete") done();
    }
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

function loadHashRecord() {
  if (!location.hash.startsWith("#record=")) return;
  try {
    const record = decodePayload(location.hash.slice("#record=".length));
    loadRecord(record);
    showToast("已载入分享棋谱");
  } catch {
    showToast("分享棋谱无法读取");
  }
}

createBoard();
setupEvents();
applyModeControls({ resetNames: false });
window.GomokuApp = {
  exportCloudSnapshot,
  importCloudSnapshot,
  makeRecord,
};
document.documentElement.dataset.gomokuApi = "ready";
render();
loadHashRecord();
scheduleAIMoveIfNeeded();
setInterval(renderTimers, 500);
