# GitHub Turbo

加速 Obsidian 内置社区插件与主题市场的 GitHub 访问：把 GitHub 地址改写为镜像地址后发出，无需系统代理，市场界面与操作习惯不变。

作用范围与鉴权：本插件会改写 Obsidian 中所有指向 `github.com` 与 `raw.githubusercontent.com` 的请求——不止市场，也包括其他插件对这两个主机的访问；携带 `Authorization` 头的鉴权请求恒直连，不经镜像。

> 当前版本 0.1.0（pre-release）。设计文档见 [docs/design.md](docs/design.md)。

## 功能规划

- 改写引擎：统一映射改写（前缀拼接型与域名替换型镜像）、失败自动回退、被动健康记账
- 镜像池管理：用户自定义镜像池的增删与排序
- 可达性测试：双探针主动验证镜像可用性
- 调试日志：改写行为的开发者控制台输出

## 手动安装

把 `main.js`、`manifest.json` 复制到 vault 的插件目录后重载 Obsidian，在 **设置 → 第三方插件** 中启用 GitHub Turbo：

```text
<Vault>/.obsidian/plugins/obsidian-github-turbo-plugin/
```

## 开发

环境要求：Node.js 24+、pnpm 12.20+（`package.json` 的 `devEngines` 声明版本范围，mise 经 `mise.toml` 自动识别）。

```bash
pnpm install    # 安装依赖
pnpm dev        # watch 模式编译 src/main.ts → main.js
pnpm check      # 质量门禁：格式检查 + ESLint + markdownlint + 单测 + 构建
pnpm build      # 生产构建
```

- 设计文档：[docs/design.md](docs/design.md)
- API 文档：<https://docs.obsidian.md>

## 许可

[0-BSD](LICENSE)
