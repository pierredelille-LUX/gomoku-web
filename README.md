# 五子棋双人对战

一个可直接部署到 GitHub Pages 的静态五子棋 Web 应用。

## 功能

- 15x15 棋盘，黑方先手，连续五子胜出
- 双人同屏轮流对弈
- 人机对战模式，可选择玩家执黑或执白，电脑使用中等强度本地 AI
- 胜负判定、最后一手和获胜连线高亮
- 双方计时、悔棋、新开一局
- 棋谱记录、复制 JSON、导入 JSON、生成分享链接
- Google 账号登录与云存档，可保存当前棋局并在登录后继续上次棋局
- 可选 WebRTC 点对点联机，通过交换创建码和加入码同步远程对局

## Google 登录和云存档配置

云存档使用 Firebase Authentication + Cloud Firestore。GitHub Pages 只能托管静态文件，因此需要先创建 Firebase 项目并填写公开 Web 配置。

1. 在 Firebase Console 创建项目。
2. Authentication 中启用 Google 登录提供方。
3. Authentication 的 Authorized domains 中加入 `pierredelille-lux.github.io`。
4. 创建 Firestore 数据库。
5. 将 `firestore.rules` 发布到 Firestore Rules，确保每个用户只能读写自己的数据。
6. 在 Firebase 项目设置中添加 Web App，把配置填入 `firebase-config.js`。

`firebase-config.js` 示例：

```js
window.GOMOKU_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  appId: "YOUR_APP_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
};
```

配置完成后重新推送到 GitHub Pages。用户登录 Google 后，落子会自动保存，也可以手动点击“保存到云端”；下次登录后点击“继续上次棋局”恢复。

## 本地预览

```bash
python3 -m http.server 4173
```

然后访问 `http://127.0.0.1:4173/`。

## GitHub Pages 部署

仓库推送到 GitHub 后，在仓库设置中启用 Pages：

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/root`

启用后访问地址通常是：

```text
https://<github-username>.github.io/<repo-name>/
```
