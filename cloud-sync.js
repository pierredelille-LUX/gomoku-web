const FIREBASE_SDK_VERSION = "12.14.0";
const SAVE_DOC_ID = "current";

const cloudEls = {
  state: document.querySelector("#cloudState"),
  avatar: document.querySelector("#cloudAvatar"),
  name: document.querySelector("#cloudName"),
  email: document.querySelector("#cloudEmail"),
  signIn: document.querySelector("#googleSignInBtn"),
  signOut: document.querySelector("#googleSignOutBtn"),
  save: document.querySelector("#cloudSaveBtn"),
  load: document.querySelector("#cloudLoadBtn"),
  list: document.querySelector("#cloudSaveList"),
  note: document.querySelector("#cloudNote"),
};

let firebase = null;
let currentUser = null;
let saveOptions = [];
let autoSaveTimer = 0;
let suppressAutoSave = false;
let lastSavedKey = "";

function setCloudState(text) {
  cloudEls.state.textContent = text;
}

function setCloudNote(text) {
  cloudEls.note.textContent = text;
}

function hasFirebaseConfig(config) {
  return Boolean(config?.apiKey && config?.authDomain && config?.projectId && config?.appId);
}

function setSignedOutUI(note = "登录后可把当前棋局保存到云端。") {
  currentUser = null;
  setCloudState("未登录");
  cloudEls.name.textContent = "游客";
  cloudEls.email.textContent = "本机对局";
  cloudEls.avatar.hidden = true;
  cloudEls.avatar.removeAttribute("src");
  cloudEls.signIn.disabled = false;
  cloudEls.signOut.disabled = true;
  cloudEls.save.disabled = true;
  cloudEls.load.disabled = true;
  cloudEls.list.disabled = true;
  renderSaveList([]);
  setCloudNote(note);
}

function setSignedInUI(user) {
  currentUser = user;
  setCloudState("已登录");
  cloudEls.name.textContent = user.displayName || "Google 用户";
  cloudEls.email.textContent = user.email || "已连接 Google";
  if (user.photoURL) {
    cloudEls.avatar.src = user.photoURL;
    cloudEls.avatar.hidden = false;
  } else {
    cloudEls.avatar.hidden = true;
    cloudEls.avatar.removeAttribute("src");
  }
  cloudEls.signIn.disabled = true;
  cloudEls.signOut.disabled = false;
  cloudEls.save.disabled = false;
  cloudEls.list.disabled = false;
  setCloudNote("云存档已启用，落子后会自动保存。");
}

function renderSaveList(saves) {
  saveOptions = saves;
  cloudEls.list.innerHTML = "";
  if (!saves.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无云存档";
    cloudEls.list.append(option);
    cloudEls.load.disabled = true;
    return;
  }
  for (const save of saves) {
    const option = document.createElement("option");
    option.value = save.id;
    option.textContent = save.title;
    cloudEls.list.append(option);
  }
  cloudEls.load.disabled = !currentUser;
}

function makeSaveTitle(snapshot, date = new Date()) {
  const moveText = `${snapshot.moves?.length || 0} 手`;
  const modeText = snapshot.mode === "ai" ? "人机" : "双人";
  const timeText = date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (snapshot.winner === "draw") return `${modeText} 平局 ${moveText} ${timeText}`;
  if (snapshot.winner) {
    const winner = snapshot.winner === "black" ? snapshot.names?.black : snapshot.names?.white;
    return `${modeText} ${winner || "胜方"}获胜 ${moveText} ${timeText}`;
  }
  const current = snapshot.current === "black" ? snapshot.names?.black : snapshot.names?.white;
  return `${modeText} ${moveText} ${current || "当前方"}待落子 ${timeText}`;
}

function snapshotKey(snapshot) {
  return JSON.stringify({
    moves: snapshot.moves,
    names: snapshot.names,
    mode: snapshot.mode,
    current: snapshot.current,
    winner: snapshot.winner,
  });
}

async function saveUserProfile(user) {
  const { doc, setDoc, serverTimestamp } = firebase.firestore;
  await setDoc(
    doc(firebase.db, "users", user.uid),
    {
      uid: user.uid,
      displayName: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      lastLoginAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function saveCurrentGame({ manual = false } = {}) {
  if (!currentUser || !window.GomokuApp?.exportCloudSnapshot) return;
  const snapshot = window.GomokuApp.exportCloudSnapshot();
  const key = snapshotKey(snapshot);
  if (!manual && (!snapshot.moves?.length || key === lastSavedKey)) return;

  const { doc, setDoc, serverTimestamp } = firebase.firestore;
  const now = new Date();
  setCloudState("保存中");
  await setDoc(
    doc(firebase.db, "users", currentUser.uid, "games", SAVE_DOC_ID),
    {
      ownerUid: currentUser.uid,
      title: makeSaveTitle(snapshot, now),
      snapshot,
      gameInfo: {
        mode: snapshot.mode,
        current: snapshot.current,
        winner: snapshot.winner || null,
        movesCount: snapshot.moves.length,
        names: snapshot.names,
      },
      clientUpdatedAt: now.toISOString(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  lastSavedKey = key;
  setCloudState("已保存");
  setCloudNote(manual ? "当前棋局已保存到云端。" : "云端已自动保存当前棋局。");
  await loadSaveList();
}

async function loadSaveList() {
  if (!currentUser) return;
  const { collection, getDocs, limit, orderBy, query } = firebase.firestore;
  const savesQuery = query(
    collection(firebase.db, "users", currentUser.uid, "games"),
    orderBy("updatedAt", "desc"),
    limit(10),
  );
  const snapshot = await getDocs(savesQuery);
  const saves = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const updated = data.updatedAt?.toDate?.() || new Date(data.clientUpdatedAt || Date.now());
    return {
      id: docSnap.id,
      title: data.title || makeSaveTitle(data.snapshot || {}, updated),
    };
  });
  renderSaveList(saves);
  setCloudState("已登录");
}

async function loadSelectedGame() {
  if (!currentUser) return;
  const saveId = cloudEls.list.value || SAVE_DOC_ID;
  const { doc, getDoc } = firebase.firestore;
  setCloudState("读取中");
  const saveRef = doc(firebase.db, "users", currentUser.uid, "games", saveId);
  const saveSnap = await getDoc(saveRef);
  if (!saveSnap.exists()) {
    setCloudState("已登录");
    setCloudNote("没有找到云端棋局。");
    return;
  }
  const data = saveSnap.data();
  suppressAutoSave = true;
  try {
    window.GomokuApp.importCloudSnapshot(data.snapshot);
    lastSavedKey = snapshotKey(data.snapshot);
    setCloudState("已读取");
    setCloudNote("已恢复云端棋局。");
  } finally {
    setTimeout(() => {
      suppressAutoSave = false;
    }, 1200);
  }
}

function queueAutoSave(event) {
  if (suppressAutoSave || !currentUser || !event.detail?.snapshot) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveCurrentGame().catch((error) => {
      setCloudState("保存失败");
      setCloudNote(error.message || "云端保存失败。");
    });
  }, 1200);
}

async function initializeCloudSync() {
  const config = window.GOMOKU_FIREBASE_CONFIG;
  if (!hasFirebaseConfig(config)) {
    setSignedOutUI("Firebase 未配置：填写 firebase-config.js 后启用 Google 登录和云存档。");
    cloudEls.signIn.disabled = true;
    setCloudState("未配置");
    return;
  }

  try {
    const [appMod, authMod, firestoreMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(config);
    const auth = authMod.getAuth(app);
    const db = firestoreMod.getFirestore(app);
    const provider = new authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    firebase = {
      auth,
      db,
      authApi: authMod,
      firestore: firestoreMod,
      provider,
    };

    await authMod.getRedirectResult(auth).catch(() => null);

    authMod.onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSignedOutUI();
        return;
      }
      setSignedInUI(user);
      try {
        await saveUserProfile(user);
        await loadSaveList();
      } catch (error) {
        setCloudState("同步失败");
        setCloudNote(error.message || "云存档初始化失败。");
      }
    });
  } catch (error) {
    cloudEls.signIn.disabled = true;
    setCloudState("不可用");
    setCloudNote(error.message || "Firebase SDK 加载失败。");
  }
}

cloudEls.signIn.addEventListener("click", async () => {
  if (!firebase) return;
  try {
    setCloudState("登录中");
    await firebase.authApi.signInWithPopup(firebase.auth, firebase.provider);
  } catch (error) {
    if (error.code === "auth/popup-blocked" || error.code === "auth/operation-not-supported-in-this-environment") {
      await firebase.authApi.signInWithRedirect(firebase.auth, firebase.provider);
      return;
    }
    setCloudState("登录失败");
    setCloudNote(error.message || "Google 登录失败。");
  }
});

cloudEls.signOut.addEventListener("click", async () => {
  if (!firebase) return;
  await firebase.authApi.signOut(firebase.auth);
});

cloudEls.save.addEventListener("click", () => {
  saveCurrentGame({ manual: true }).catch((error) => {
    setCloudState("保存失败");
    setCloudNote(error.message || "云端保存失败。");
  });
});

cloudEls.load.addEventListener("click", () => {
  loadSelectedGame().catch((error) => {
    setCloudState("读取失败");
    setCloudNote(error.message || "云端读取失败。");
  });
});

cloudEls.list.addEventListener("change", () => {
  const selected = saveOptions.find((save) => save.id === cloudEls.list.value);
  if (selected) setCloudNote(`已选择：${selected.title}`);
});

window.addEventListener("gomoku:statechange", queueAutoSave);
initializeCloudSync();
