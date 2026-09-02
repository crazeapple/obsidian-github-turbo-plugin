# 探索日志

2026-09-02 P-001 加速作用面定选项一（内置流程加速）为主线候选，机制可行性待 spike 验证；选项二降为回退方案
2026-09-02 P-001 V2 未命中：renderer 层 `window.fetch` 与 XHR 探针无内置市场请求经过，转 V3 深层探测（Node http/https、electron net、IPC）
2026-09-02 P-001 V3a 判定：Network 面板无请求 + Node/electron net/invoke 探针均无输出 → 内置请求走主进程，转 V3b IPC 全层探针（send/sendSync/invoke）
2026-09-02 P-001 V3b 命中：内置市场请求经 IPC 过桥且 URL 明文可见（renderer 探针打出 GitHub URL），改写点确认在 renderer 侧 IPC 边界；下一步 V4 端到端改写实测
2026-09-02 P-001 V4 部分通过：无代理环境下列表经镜像加载且明显变快；安装预检 `releases/download/` 路径经 ghproxy.net 返回 404 → 镜像对 release 资产的覆盖是关键变量，按资源类型路由（方向 A）由演进目标转为硬需求候选；待换镜像复测安装链路
2026-09-02 P-001 V4 通过：安装链路完整走通（main.js/styles.css 经改写下载，Templater 安装成功），V1-V4 全过——选项一机制成立；浏览器实测四个公共镜像仅两个覆盖 release 资产；V5/V6 转规格设计约束；待确认路线图收编后进入定稿
2026-09-02 P-001 探索收敛：路线图收编与首版边界获用户确认（改写引擎 + 单一可配镜像 + 总开关），默认镜像实测定向 gh-proxy.com；探索期完成，待 /sdd-finalize 定稿
2026-09-02 P-001 定稿 specified：规格 v1.0 见 `specs/P-001/spec.md`；被否备选留痕 A-001/A-002；探索文件删除
