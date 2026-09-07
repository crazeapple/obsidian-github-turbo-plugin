# GitHub Turbo

加速 Obsidian **内置社区插件/主题市场** 的 GitHub 访问：在渲染进程侧把市场请求的 GitHub 地址改写为镜像地址，无需系统代理或 VPN。

- 插件 ID：`obsidian-github-turbo-plugin` · 名称：GitHub Turbo
- 平台：Obsidian 桌面端（≥ 1.11.0，设置页依赖原生 SettingGroup 组件）；不支持移动端
- 不发布到官方社区插件库，手动部署使用

## 定位

Obsidian 内置市场的插件发现、安装、更新全部走 GitHub（`github.com` 与 `raw.githubusercontent.com`）。本插件接管这些请求的底层通道（`request-url` IPC），把原始地址按用户配置的映射改写为镜像地址后再发出，并对响应做健康记账——市场界面与操作习惯完全不变，变快的只是网络层。

## 功能

- **改写加速**：总开关控制；关闭后全部请求直连
- **镜像池管理**：添加 / 删除 / 上移下移，池与顺序持久化；条目可展开查看映射详情
- **统一映射**：一条映射 = `from → to` 前缀对，同时承载前缀拼接与域名替换两种镜像形态
- **可达性测试**：双探针（github 域 raw 路径 + raw 域 README，均取自 `obsidianmd/obsidian-releases` 官方仓库），HTTP 语义 + 内容指纹双层判定，杜绝停车域误判
- **失败自动回退**：请求失败按池顺序推进到下一候选；连续 3 败本会话拉黑，30 分钟冷却后自动解除
- **手动切换**：设置页一键切换到下一候选
- **恢复初始状态**：池重建为种子镜像 + 清空运行态 + 自动全池首测
- **未覆盖告知**：GitHub 已知域未被任何映射覆盖时，设置页按域名提示（含经由镜像名），补全映射后消失
- **种子池**：内置 4 个实测可用镜像（双探针实测筛选，按耗时排序）

| 种子镜像 | github 映射到 | raw 映射到 |
| --- | --- | --- |
| gh-proxy.com | `https://gh-proxy.com/https://github.com/` | `https://gh-proxy.com/https://raw.githubusercontent.com/` |
| cors.isteed.cc | `https://cors.isteed.cc/https://github.com/` | `https://cors.isteed.cc/https://raw.githubusercontent.com/` |
| ghproxy.net | `https://ghproxy.net/https://github.com/` | `https://ghproxy.net/https://raw.githubusercontent.com/` |
| gh.ddlc.top | `https://gh.ddlc.top/https://github.com/` | `https://gh.ddlc.top/https://raw.githubusercontent.com/` |

> 公共镜像可用性波动剧烈，种子仅为起点——失效项会被被动观测自动拉黑回退，也可自行添加偏好的镜像。

## 用法

### 安装

把 `main.js`、`manifest.json`、`styles.css` 复制到：

```
<Vault>/.obsidian/plugins/obsidian-github-turbo-plugin/
```

重启 Obsidian（或重载插件），在 设置 → 第三方插件 中启用 GitHub Turbo。

### 设置页

- **启用 GitHub 加速**：总开关，关闭即全部直连
- **镜像池**：每行名称前有状态点（当前使用=绿 / 已拉黑=红 / 其他=灰），desc 显示逐映射测试结果（✓ 绿 / ✗ 红，一映射一段）；行尾箭头按钮展开映射详情（单行 `from → to`，去协议与尾斜杠）；`···` 菜单提供 测试健康（可达性）/ 上移 / 下移 / 删除；组说明行右侧「Switch」按钮一键切换到下一候选
- **添加镜像**：填镜像名 + 两条映射的 `to` 地址，点击添加时集中校验（名字唯一、`https://` 前缀），失败在提示行列明全部原因；入池自动首测
- **恢复初始状态**：一键回到种子池并重新全池测试

### 添加镜像的两种写法

| 类型 | github.com 映射到 | raw 域映射到 |
| --- | --- | --- |
| 前缀拼接型 | `https://gh-proxy.com/https://github.com/` | `https://gh-proxy.com/https://raw.githubusercontent.com/` |
| 域名替换型 | `https://mirror.example.com/github/` | `https://mirror.example.com/raw/` |

镜像名即身份：修改镜像 = 删除后重新添加；池最后一条不可删。

## 规则

- **改写**：URL 以某映射的 `from` 开头 → 改写为 `to` + 剩余路径；已是任一映射的产物则原样返回（幂等）；均未命中且属 GitHub 已知域 → 直连并计入未覆盖提示
- **顺序即优先级**：池顺序就是失败回退顺序；把某镜像移到首位 = 重新声明优先使用它
- **失败记账**：`/releases/download/` 路径 404、403/429、5xx、网络层错误与观测超时（120s）计失败；其余 404 视为上游真值（如插件下架）不记账
- **拉黑冷却**：同一镜像连续 3 次失败 → 本会话拉黑；30 分钟后自动解除并清零连败，重新参与轮转；手动切换与测试不受拉黑限制（测试属显式诊断）
- **测试语义**：测试结果只作诊断展示，失败不阻塞入池、不自动删除

## 开发

环境要求：Node.js ≥ 18。

```bash
npm i             # 安装依赖
npm run dev       # watch 模式编译 src/main.ts → main.js
npm run build     # 类型检查（tsc --noEmit）+ 生产构建（esbuild）
npm run lint      # ESLint（含 obsidianmd 官方规则集）
```

代码结构：

- `src/accelerator.ts` — 加速引擎：统一映射改写、镜像游标与失败记账、双探针测试、`request-url` IPC 挂载
- `src/main.ts` — 插件门面：设置装载/持久化、播种迁移、池管理操作
- `src/settings.ts` — 设置页：总开关、镜像池管理与添加表单、状态轮询

### 测试

单测无框架依赖，直接对引擎源码打包后以 Node 断言驱动：

```bash
# 1. 把 src/accelerator.ts 打包为 CJS（obsidian 模块以 stub 替换，可在纯 Node 运行）
npx esbuild src/accelerator.ts --bundle --format=cjs --platform=node \
  --alias:obsidian=<stub>/index.js --outfile=/tmp/accelerator.cjs
# 2. 运行断言脚本（改写/幂等/失败记账/拉黑冷却/游标语义/观测记账边界等 55 用例）
node /tmp/your-test.cjs
```

E2E 在真实 Vault 中进行：部署产物后核对 设置页形态、播种、双探针结果、手动切换、恢复初始状态 等场景。

### 发布

```bash
npm version minor   # 或 patch / major：同步 package.json / manifest.json / versions.json
git tag -a vX.Y.Z   # 附注 tag，注明相对上一版本的变化
```

### 需求治理（SDD）

本仓库采用 SDD 需求治理体系（Intent / Proposal / Task 三层，状态机 + 全留痕），治理文档位于 `sdd/`，工作流命令见 `.claude/commands/sdd-*.md`，入口说明见 `CLAUDE.md`。

## 许可

0-BSD
