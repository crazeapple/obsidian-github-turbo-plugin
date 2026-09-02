---
id: P-001
type: design
status: finalized
updated: 2026-09-03
---
# P-001 GitHub 访问加速核心（镜像地址改写）设计

## 方案概述（引 A-ID）

Obsidian 桌面端内置市场的全部 GitHub 请求经 `ipcRenderer.send('request-url', <id>, { url, ... })` 过桥且 URL 明文（spike V1-V4 实证）。本插件在 renderer 侧挂载补丁，对该频道参数中命中 `https://github.com/` 与 `https://raw.githubusercontent.com/` 前缀的 `url` 做镜像前缀改写，令主进程实际访问镜像地址；总开关与镜像源均可配置。产品形态为加速内置流程、不自带界面（A-001），坚持地址改写路线（A-002）。

## 接口

- 插件设置 `TurboSettings`：
    - `enabled`：总开关，默认 `true`
    - `mirrorBase`：镜像前缀，默认 `https://gh-proxy.com/`
- 补丁生命周期：`install()`（探测频道结构 → 校验通过才挂载）/ `restore()`（还原原 `send`）

## 数据

- 设置经 Obsidian `loadData()` / `saveData()` 持久化（`data.json`，已被 `.gitignore` 排除）

## 关键流程

`ipcRenderer.send('request-url', id, opts)` → 总开关关闭则直通 → 遍历参数对象，`url` 为字符串且前缀匹配两个 GitHub 域 → 未带镜像前缀则改写为 `mirrorBase + url` → 调用原 `send`。挂载于插件 onload，卸载于 unload，防重复挂载。

URL 改写对照（示例仓库 `cli/cli`；「镜像前缀」即默认源 `https://gh-proxy.com/`，拼接写法不保证适用其他镜像服务）：

### 浏览列表（打开市场面板）

| 资源 | 原 URL | 改写后 |
| --- | --- | --- |
| 插件列表 JSON | `https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugins.json` | 镜像前缀 + 原 URL |
| 主题列表 JSON | `https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-css-themes.json` | 镜像前缀 + 原 URL |
| 插件下载量统计 | `https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugin-stats.json` | 镜像前缀 + 原 URL |
| 主题下载量统计 | `https://releases.obsidian.md/stats/theme` | 不改写（非 GitHub 域，直连） |

### 详情与更新检查

| 资源 | 原 URL | 改写后 |
| --- | --- | --- |
| 插件 manifest | `https://raw.githubusercontent.com/cli/cli/HEAD/manifest.json` | 镜像前缀 + 原 URL |
| 插件 README | `https://raw.githubusercontent.com/cli/cli/HEAD/README.md` | 镜像前缀 + 原 URL |
| 更新检查 | 同 manifest URL（取回版本与本地安装版本比对） | 镜像前缀 + 原 URL |

### 安装与升级

| 资源 | 原 URL | 改写后 |
| --- | --- | --- |
| release manifest | `https://github.com/cli/cli/releases/download/<版本>/manifest.json` | 镜像前缀 + 原 URL |
| 主代码 | `https://github.com/cli/cli/releases/download/<版本>/main.js` | 镜像前缀 + 原 URL |
| 样式 | `https://github.com/cli/cli/releases/download/<版本>/styles.css` | 镜像前缀 + 原 URL |
| 主题安装包 | `https://github.com/cli/cli/archive/refs/heads/master.zip`（推断路径，T-003 实测确认） | 镜像前缀 + 原 URL |

说明：

- 改写后 URL = `https://gh-proxy.com/` + 原 URL；拼接式前缀写法仅在已验证的镜像服务上适用，更换镜像前须先验证其拼接兼容性
- 统一改写条件：原 URL 以 `https://github.com/` 或 `https://raw.githubusercontent.com/` 开头，其余一律不改写
- spike 实测覆盖列表、详情、更新检查、插件安装（Templater 全链路成功）；主题安装 zip 为推断路径，T-003 验收实测确认

## 关键决策表

| 决策 | 选项 | 选择 | 理由 | 关联 |
| --- | --- | --- | --- | --- |
| 改写挂载点 | renderer 全局 fetch/XHR · IPC `request-url` 过桥 | IPC `request-url` 过桥 | spike V1-V4 实证唯一有效改写点 | A-001 |
| 产品形态 | 自带界面 · 内置流程加速 · 结合 | 内置流程加速 | 机制成立，无重复建设 | A-001 |
| 加速路线 | 地址改写 · 镜像元数据源 | 地址改写 | 与上游解耦，镜像可自选 | A-002 |
| 默认镜像 | ghproxy.net · gh-proxy.com | gh-proxy.com | 实测安装链路成功，ghproxy.net 实装 404 | spec v1.0 |
| 镜像失败策略 | 自动回退 · 原样报错 | 原样报错 | 自动回退属 M2，控制首版规模 | spec v1.0 |

## 任务清单

| 任务 ID | 标题 | 状态 | 分组 | 备注 |
| --- | --- | --- | --- | --- |
| `T-001` | 改写引擎：频道探测、挂载/还原、前缀改写 | done | 引擎 | 含幂等与防重复挂载（AC6、AC7） |
| `T-002` | 设置页：总开关与镜像源配置 | done | 配置 | 默认值、持久化、重载生效（AC4、AC5） |
| `T-003` | 端到端验收实测 | doing | 验收 | 无代理环境逐条核对 AC1-AC7 |

## 任务详情

### T-001 改写引擎：频道探测、挂载/还原、前缀改写

- 说明：封装 `install()` / `restore()`；onload 探测 `request-url` 频道与参数结构，不匹配则静默不挂载；仅改写两个 GitHub 域前缀的 `url`，幂等
- 验收：引擎级验证通过——构建零错误 + 改写纯函数 12 用例全过；AC4/AC6/AC7 运行时行为留 T-003 端到端核对
- 实现记录：新增 `src/accelerator.ts`——`rewriteUrl` 纯函数（两 GitHub 前缀匹配、`startsWith` 幂等、镜像前缀尾斜杠规范化、空前缀直连）与 `RequestUrlAccelerator`（install 时探测 `window.require('electron').ipcRenderer` 可达性，包装 `send` 仅对 `request-url` 频道且开关开启时就地改写对象参数的字符串 `url` 字段；`restore()` 还原原函数；`mounted` 防重复挂载）。`main.ts` onload 挂载、onunload 还原；`settings.ts` 增嵌套配置 `accelerator` 并防御性合并默认值（设置页编辑界面归 T-002）。证据：`npm run build` 通过（tsc 零错误 + esbuild 产物 `main.js`）；node 12 用例（列表 / release 三件套 / 主题 zip / raw manifest 命中，obsidian.md / api.github.com / http / 仿冒镜像域 / 他镜像前缀不改写，幂等 / 规范化 / 空镜像直连）全过。两用例初版期望写错（仿冒域与他镜像 URL 误期望改写），复核后确认函数「非 GitHub 前缀一律不改写」才是规格行为，修正期望后全过

### T-002 设置页：总开关与镜像源配置

- 说明：设置 tab 两行——「启用 GitHub 加速」Toggle（默认开）与「镜像源地址」Text（默认 `https://gh-proxy.com/`，保存时 trim + 补全末尾 `/`，仅支持前缀型镜像）；两项均即时生效（改写函数读活配置），重载后保持；不做连接测试按钮与镜像预设列表（属 M2）；`data.json` 不入库
- 验收：构建零错误、lint 0 error、设置项规范化与改写用例复跑全过；AC4/AC5 运行时行为留 T-003 端到端核对
- 实现记录：重写 `src/settings.ts`——`TurboSettingTab` 两行（「启用 GitHub 加速」Toggle 默认开；「镜像源地址」Text 默认 `https://gh-proxy.com/`，`onChange` 时 `trim + normalizeMirrorBase` 补尾斜杠），标题行用 `setHeading()`、说明为静态段落；两项即时生效（引擎 getter 读活配置，无需重载）。`main.ts` 清理模板演示代码（ribbon/modal/命令/状态栏/定时器）并接入 `addSettingTab`；`normalizeMirrorBase` 改为导出供设置层复用。维护性收尾（直接做并回报）：插件身份落地（manifest `id: obsidian-github-turbo-plugin`、名称与描述、`package.json` 改名；id 即安装目录名，验收前经用户定向调整），`isDesktopOnly: true` 对应「不考虑移动端」约束。证据：`npm run build` 零错误；`npm run lint` 0 error 2 warning——两 warning 按 R8 确认忽略：① `prefer-setting-definitions`（声明式设置 API 为 1.13+ 特性，超出 P-001 范围，命令式 API 全版本兼容，留 M2+ 演进）；② `sentence-case`（placeholder 为镜像 URL，须原样展示，改写大小写反而错误）。改写与规范化用例复跑全过

### T-003 端到端验收实测

- 说明：无系统代理环境下，按 spec AC1-AC7 逐条以实际证据核对，回填验证结果
- 验收：AC1-AC7 全部通过——行为证据：列表明显加快、omnisearch 与 advanced-tables 完整安装（release 三件套）、真实更新完成、关开关恢复直连、换镜像生效、无二次改写、非 GitHub 流量不受影响；URL 证据：v2 探针 `MIRRORED` / `DIRECT-GITHUB` / `NON-GITHUB` 标记逐项核对
- 实现记录：部署 `main.js` + `manifest.json` 至库内 `.obsidian/plugins/obsidian-github-turbo-plugin/` 实测。过程修订两处：① 主题列表 URL 实测为 `community-css-themes.json`（已修正对照表）；主题下载量统计走 `https://releases.obsidian.md/stats/theme`（非 GitHub 域，不改写，已补入对照表）；② 验收探针两版——v1 在放行前记录，看到的是改写前地址（探针叠于插件补丁外侧所致，属探针设计错误而非引擎缺陷），v2 改为先放行后记录得改写后实况；另确认市场列表存在会话内缓存，重载后未必重发请求，管道自测可替代 UI 验证。验收工具（v2 探针 + 管道自测）经用户评审后归档于本节（方案 A）
- 验收工具（与 `request-url` 通道强耦合，通道结构变化即失效）：
    - v2 探针——叠加在插件补丁之上，先放行后记录，所见即改写后实况（`Cmd+R` 后失效须重贴）：

    ```js
    (() => {
      const BASE = 'https://gh-proxy.com/'; // 换镜像后同步修改
      const { ipcRenderer } = require('electron');
      const orig = ipcRenderer.send.bind(ipcRenderer);
      ipcRenderer.send = (ch, ...a) => {
        orig(ch, ...a);
        if (ch === 'request-url') {
          for (const x of a) {
            if (x && typeof x === 'object' && typeof x.url === 'string') {
              const u = x.url;
              const tag = u.startsWith(BASE + 'https://gh-proxy.com/') ? 'DOUBLE!'
                : u.startsWith(BASE) ? 'MIRRORED'
                : /githubusercontent\.com|\/\/github\.com/.test(u) ? 'DIRECT-GITHUB'
                : 'NON-GITHUB';
              console.log(`[req:${tag}]`, u.slice(0, 110));
            }
          }
        }
      };
      console.log('[probe v2] 已挂载，BASE =', BASE);
    })();
    ```

    - 管道自测——不经 UI 验证完整链路（探针 → 插件补丁 → 主进程），返回 `MIRRORED` / `DIRECT-GITHUB` 由开关状态决定：

    ```js
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('request-url', 'probe-selftest', { url: 'https://github.com/cli/cli' });
    ```

    - 两个已踩坑：探针在放行前记录只能看到改写前地址；市场列表有会话内缓存，重载后未必重发请求，用详情页请求或管道自测替代验证
