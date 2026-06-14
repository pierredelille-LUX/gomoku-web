const BOARD_SIZE = 15;
const STAR_POINTS = new Set(["3,3", "3,7", "3,11", "7,3", "7,7", "7,11", "11,3", "11,7", "11,11"]);
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

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
let toastTimer = 0;
let peer = {
  pc: null,
  channel: null,
  role: null,
  connected: false,
};

function freshState(names = getNames()) {
  return {
    board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null)),
    current: "black",
    moves: [],
    winner: null,
    winningLine: [],
    names,
    timeUsed: { black: 0, white: 0 },
    turnStartedAt: Date.now(),
    finishedAt: null,
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
  } else {
    els.gameStatus.textContent = `${colorName(state.current)}落子`;
  }

  renderMoveList();
  renderTimers();
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
  state = freshState(getNames());
  render();
  if (!options.silent) sendPeerMessage({ type: "reset", names: state.names });
}

function undoMove(options = {}) {
  if (!state.moves.length) return;
  const last = state.moves.pop();
  state.board[last.row][last.col] = null;
  state.winner = null;
  state.winningLine = [];
  state.finishedAt = null;
  state.current = last.color;
  state.turnStartedAt = Date.now();
  render();
  if (!options.silent) sendPeerMessage({ type: "undo" });
}

function makeRecord() {
  return {
    app: "gomoku-web",
    version: 1,
    size: BOARD_SIZE,
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
  els.blackName.value = names.black;
  els.whiteName.value = names.white;
  state = freshState(names);

  for (const move of record.moves) {
    if (!isInside(move.row, move.col)) throw new Error("棋谱包含越界落子");
    if (move.color !== state.current) throw new Error("棋谱手顺不正确");
    if (!placeStone(move.row, move.col, { broadcast: false })) throw new Error("棋谱包含无效落子");
    if (state.winner && move !== record.moves[record.moves.length - 1]) break;
  }
  render();
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

function setupEvents() {
  els.newGameBtn.addEventListener("click", () => newGame());
  els.undoBtn.addEventListener("click", () => undoMove());
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
    current: state.current,
    moves: state.moves.map(({ row, col, color, at }) => ({ row, col, color, at })),
    names: state.names,
    timeUsed: state.timeUsed,
    winner: state.winner,
    winningLine: state.winningLine,
  };
}

function importState(snapshot) {
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
render();
loadHashRecord();
setInterval(renderTimers, 500);
