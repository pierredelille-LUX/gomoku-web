# 五子棋双人对战

一个可直接部署到 GitHub Pages 的静态五子棋 Web 应用。

## 功能

- 15x15 棋盘，黑方先手，连续五子胜出
- 双人同屏轮流对弈
- 胜负判定、最后一手和获胜连线高亮
- 双方计时、悔棋、新开一局
- 棋谱记录、复制 JSON、导入 JSON、生成分享链接
- 可选 WebRTC 点对点联机，通过交换创建码和加入码同步远程对局

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
