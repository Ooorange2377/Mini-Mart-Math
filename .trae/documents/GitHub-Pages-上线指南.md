# GitHub Pages 上线操作指南

> 面向纯小白：从「本地能跑」到「手机扫码就能玩」。
> 目标地址：`https://<你的用户名>.github.io/paygame/`（子路径部署）。
> 本文所有命令都在项目根目录执行：`cd ~/Documents/trae_projects/paygame`。

---

## 一、先给结论：路径已审计，子路径下不会 404

### 1.1 实测方式（不是"看代码猜"）

把整个仓库以 `/paygame/` 为前缀挂到本地静态服务器，模拟 `https://用户名.github.io/paygame/` 的访问形态，然后用 headless Chrome 逐屏访问并监听所有网络请求：

```bash
# 模拟：/tmp/pages-test/paygame 是指向项目目录的软链
python3 -m http.server 8141 --directory /tmp/pages-test
```

逐屏（start → map → game → result → shop → skins → start）统计结果：

| 页面 | 图片 | 样式表 | ZQ | 4xx/5xx |
|---|---|---|---|---|
| start | 5 | 6 | object | 0 |
| map（CSS 背景图） | 0 | 6 | object | 0 |
| game | 5（4 件商品 + 1 购物篮皮肤） | 6 | object | 0 |
| result | 5 | 6 | object | 0 |
| shop（CSS 背景图） | 0 | 6 | object | 0 |
| skins（CSS 背景图） | 0 | 6 | object | 0 |

- **无 4xx / 5xx、无 `Network.loadingFailed`、无破损图片**（`complete && naturalWidth === 0` 计数为 0）。
- **负向对照**：往页面里注入一张不存在的图（`商品素材/__不存在的图__.png`），检测器立刻报 `404 .../%E5%95%86...png` —— 证明"没报错"不是因为没检测。
- 服务器访问日志同样只出现 `200`，唯一一条 `404` 就是上面那张故意注入的假图。

### 1.2 静态审计结论

- 扫描 286 个入库文件中 **100+ 条资源引用**（html/css/js）：**全部存在，且大小写与文件名完全一致**（GitHub Pages 跑在 Linux 上，区分大小写，这是本地 macOS 最容易踩的坑）。
- **没有任何 `/` 开头的绝对路径**；`index.html` 的 6 个 CSS、25 个 JS 全是 `css/...`、`js/...` 相对路径。
- favicon 是**内联 data URI**，不会请求 `/favicon.ico`，天然不 404。
- 从子目录里回指根目录的写法也是对的：`css/screens.css` 里 `url('../便利店内环境参考图.webp')`，从 `css/` 往上一级即仓库根。
- 从**文档根**解析的中文路径同样成立（浏览器自动做百分号编码，实测日志里就是 `%E5%95%86%E5%93%81%E7%B4%A0%E6%9D%90/...`）：`商品素材/...`、`图标素材/...`、`购物篮/优化/...`、`audio/lets_go_shopping.mp3`。

### 1.3 两个必须记住的"别动"项

1. **根目录的 `便利店购物大作战标题.webp` 和 `便利店内环境参考图.webp` 是被代码直接按根路径引用的**（不是 `图标素材/` 里的同名文件）。以后整理素材时**不要删、不要挪目录**，否则标题和背景图会 404。
2. 中文目录名（`商品素材/`、`购物篮/`）在 GitHub Pages 上**正常工作**，但分享链接时不要把未编码的中文直接贴进聊天工具/二维码生成器，交给浏览器自己转码即可。

---

## 二、上传前在终端跑什么（照抄即可）

### 步骤 0：确认工作区干净

```bash
cd ~/Documents/trae_projects/paygame
git status --short
```

**期望：没有任何输出。** 有输出说明还有没提交的改动，先提交或确认。

### 步骤 1：全量回归必须全绿

```bash
# 终端 A：起静态服务（回归脚本依赖它）
python3 -m http.server 8137

# 终端 B：跑回归
node js/dev/regress.js
```

**期望：全部 PASS，退出码 0。**（606 档唯一的 `t-rule-line 5px` 是已授权失败，自动放行。）
跑完回终端 A 按 `Ctrl + C` 停掉服务。

### 步骤 2：确认没有脏东西混进版本库

```bash
git ls-files | grep -Ei 'DS_Store|trae-html-share-packages' || echo "干净：无系统垃圾、无 IDE 预览产物"
```

**期望：输出「干净」。**（`.trae-html-share-packages/` 已加入 `.gitignore` 并从索引移除，见第五节。）

### 步骤 3：体积与单文件大小体检

```bash
# 总量
du -sh .
# 最大文件前 10 个（GitHub 硬限制：单文件 100MB；超过 50MB 会警告）
find . -path ./.git -prune -o -type f -print0 | xargs -0 ls -lS | head -11 | awk '{printf "%7.2f MB  %s\n", $5/1048576, $9}'
```

当前实测：

| 项目 | 数值 | GitHub 限制 | 判定 |
|---|---|---|---|
| 仓库总大小（含 .git） | **207 MB** | 建议 < 1 GB | 通过 |
| 工作区文件 | **88 MB** | — | 通过 |
| `.git` 历史 | **119 MB** | — | 通过 |
| 最大单文件 | `原始/图标素材/便利店购物大作战标题-英文版.PNG` **4.61 MB** | 100 MB 硬限 | 通过 |
| 入库文件数 | **286** | — | 通过 |
| Pages 站点体积 | ≈ **88 MB** | 1 GB | 通过 |

> `原始/`（21MB 原图）会跟着部署上线。它不影响运行，只是多占一点带宽与构建时间，按你的决定保留。
> `js/dev/` 也会被部署，但只在 URL 带 `?debug=1` 时才加载，正常访问不会执行。

### 步骤 4（可选但推荐）：关掉 Jekyll

GitHub Pages 默认会用 Jekyll 处理站点。本项目是纯静态，跳过 Jekyll 能少一层风险、构建更快：

```bash
touch .nojekyll
git add .nojekyll
git commit -m "chore: 添加 .nojekyll 跳过 Jekyll 构建"
```

> 不建也能跑（`.js`/`.css` 无 front matter 会被原样拷贝），但建议加上，一劳永逸。

---

## 三、推上 GitHub（网页端建库版，最可控）

### 3.1 注册 / 登录

浏览器打开 <https://github.com>，没有账号就注册（免费），**记住你的用户名**——它决定最终网址。

### 3.2 新建仓库

1. 右上角 `+` → **New repository**
2. **Repository name** 填 `paygame`（建议就用这个，网址会变成 `.../paygame/`）
3. 选 **Public**（Pages 对免费账号只开放公开仓库）
4. **三不要勾**：不要勾 `Add a README file`、不要勾 `.gitignore`、不要选 License —— 勾了会产生一个 GitHub 端的提交，你本地推送时就得先合并，新手容易卡住。
5. 点 **Create repository**

### 3.3 推送（一次性三条命令）

建完仓库后页面会显示"…or push an existing repository"，命令就是：

```bash
cd ~/Documents/trae_projects/paygame
git remote add origin https://github.com/<你的用户名>/paygame.git
git push -u origin main
```

把 `<你的用户名>` 换成你的实际用户名。第一次推送会弹窗要账号密码：

- **用户名**：GitHub 用户名
- **密码**：**不是登录密码**，必须是 Personal Access Token：
  1. GitHub 右上头像 → **Settings** → 左侧最下 **Developer settings**
  2. **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
  3. Note 随便填（如 `paygame-push`），Expiration 选 90 天，勾选 **`repo`** 这一整项
  4. 生成后**立刻复制**（只显示一次），粘贴到终端密码提示里
- macOS 会把 token 记进钥匙串，之后不用再输。

如果 119MB 的 `.git` 推送中途断开（`RPC failed` / `HTTP 413`）：

```bash
git config http.postBuffer 524288000
git push -u origin main
```

### 3.4 开启 Pages

1. 仓库页 → **Settings**（顶部导航）→ 左侧 **Pages**
2. **Source** 选 **Deploy from a branch**
3. **Branch** 选 `main`，目录选 **`/ (root)`**，点 **Save**
4. 等 1~2 分钟，页面顶部会出现绿底提示 **"Your site is live at https://\<用户名\>.github.io/paygame/"**
5. 想确认构建过程：仓库顶部 **Actions** 标签，看到 `pages build and deployment` 绿色对勾即成功

**访问地址：`https://<你的用户名>.github.io/paygame/`**（注意结尾的斜杠）。

---

## 四、在 Trae 里一键推送（不想敲命令就用这个）

1. 左侧活动栏点 **源代码管理**（分叉图标，快捷键 `Ctrl + Shift + G` / mac 上 `Cmd + Shift + G`）
2. 在输入框写提交信息（如 `chore: 上线`），点 **提交**（`Cmd + Enter`）
3. 点面板右上 **…** 菜单 → **推送**；若还没配远程仓库，会看到 **发布分支 / Publish Branch**
4. 选 **GitHub** → 浏览器弹出授权页 → 允许 → 选择 **Public** 仓库
5. Trae 会**自动创建仓库**并推送。**注意**：自动创建的仓库名通常取自**文件夹名**（本机文件夹叫 `paygame`，正好合适）；如果它取了别的名字，最终网址会跟着变（`https://用户名.github.io/<那个名字>/`）。
6. 推送成功后，仍要回网页端做 **Settings → Pages**（第 3.4 节），Trae 不会替你开 Pages。

> 想完全固定仓库名与网址：用第三节的网页端建库方式，再用 Trae 只做「提交 + 推送」，两边可以混用。

---

## 五、本次已完成的清理（.trae-html-share-packages/）

已按你的要求处理完，**不在仓库里了**：

```text
.gitignore        追加：.trae-html-share-packages/   （含注释：IDE 预览生成的分享包，属于构建产物，不入库）
git rm -r --cached .trae-html-share-packages         （从索引移除，本地文件保留）
commit b2fb00b    chore: 忽略 IDE 预览产物           （2 files changed）
```

复核：`git ls-files | grep -c trae-html-share-packages` → **0**。

`原始/`（21MB 原图）保持原样，未做任何删除或忽略。

---

## 六、上线后的 5 分钟自检

打开 `https://<用户名>.github.io/paygame/`：

1. **按一下 `Cmd + Shift + R` 强制刷新**（首次访问可能拿到旧缓存）
2. `F12` → **Console**：不该有红色报错；**Network** 面板不该有红色 404
3. 逐屏点一遍：开始页 → 地图 → 第 1 关（**新手引导应正常弹出 5 步聚光**）→ 结算 → 商店 → 皮肤
4. 手机横屏访问**同一个网址**（不需要另外部署），检查横滑翻页、购物篮单击取消
5. 首屏背景图/标题图应正常显示（这两个是根路径引用，最容易看出路径问题）

---

## 七、常见问题排查表

| 现象 | 最可能原因 | 处理 |
|---|---|---|
| 页面全白，Console 报 `ZQ is not defined` | 某个 `js/...` 404（多半是大小写不符或文件没入库） | `git ls-files js/ \| grep -i 文件名` 核对；确认该文件没被 `.gitignore` 误伤 |
| 背景图/标题不显示，Network 里 404 | 引用了根目录的 `便利店内环境参考图.webp` / `便利店购物大作战标题.webp`，但文件被挪走/改名 | 别移动这两个文件；或在 `css/screens.css`、`js/screens/start.js` 里改引用 |
| 访问网址 404 | 仓库 Settings 里 Pages 没开 / 分支选错 | Settings → Pages 选 `main` + `/ (root)`，等 1~2 分钟 |
| 改了代码，手机打开还是旧的 | Pages 是异步构建 + CDN 缓存 | 等 1~2 分钟；`Cmd + Shift + R`；把 `index.html` 里所有 `?v=20261029-52` 统一改成新版本号再提交 |
| 中文文件名相关 404 | 分享链接里手打了未编码的中文 | 用浏览器地址栏复制出的链接（已编码） |
| `git push` 报 `RPC failed` / `413` | 单次推送体积过大（本仓库 `.git` 119MB） | `git config http.postBuffer 524288000` 后重推；仍失败可分两次推（先推小文件，再推素材） |
| Pages 构建失败（Actions 红叉） | Jekyll 处理出错 | `touch .nojekyll` 提交后重推（见步骤 4） |

---

## 八、以后每次更新的标准动作

```bash
# 1) 改完代码，先跑回归（服务要开着）
node js/dev/regress.js

# 2) 提升缓存版本号（改过 css/js 才需要）
#    把 index.html 里所有 ?v=20261029-52 改成新戳，例如 ?v=20261030-01

# 3) 提交并推送
git add -A
git commit -m "feat: ..."
git push

# 4) 等 1~2 分钟，强刷页面
```

---

## 九、容量与限制速查（够用很久）

| 项目 | GitHub Pages 限制 | 本项目现状 |
|---|---|---|
| 站点大小 | 1 GB | ≈ 88 MB |
| 单文件 | 100 MB（50 MB 起告警） | 4.61 MB |
| 月流量 | 100 GB（软限制） | 首屏约 1.5 MB/次（WebP 已压缩） |
| 构建频率 | 每小时 10 次 | 手动推送才触发 |
| 服务器端能力 | **只有静态文件**（无 PHP/数据库） | 纯前端，正好匹配 |
