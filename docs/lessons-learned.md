# 开发经验教训

本文档记录了在开发过程中遇到的非预期问题、根本原因分析以及最终的解决方案，以供团队参考。

## 问题一：`shadcn` CLI 错误地创建了物理 `@` 目录

### 现象

在通过 `npx shadcn@latest add <component>` 添加组件后，项目根目录下出现了一个名为 `@` 的物理文件夹，所有 `shadcn` 生成的组件（如 `ui`、`hooks`、`lib`）都被错误地放置在了 `@/components` 等路径下。

这导致了 TypeScript 编译时出现 "Cannot find module" 错误，因为 TypeScript 期望 `@` 是一个在 `tsconfig.json` 和 `vite.config.ts` 中定义的路径别名，指向 `src/frontend`，而不是一个真实的目录。

### 根本原因分析

`shadcn` 的命令行工具在执行时，未能正确解析 `components.json` 文件中定义的 `alias`。它将路径别名 `@/components` 误解为一个相对路径，从而在项目根目录创建了 `@` 文件夹。

这可能是一个特定版本的 CLI bug，或是由于在运行 `add` 命令之前没有先通过 `init` 命令来让 CLI 正确地学习和验证项目结构。

### 解决方案与规避措施

1.  **手动修复**:
    - 将 `@` 目录下所有内容（如 `components`, `hooks`, `lib`）手动移动到它们本应在的位置，即 `src/frontend/` 目录下。
    - 删除项目根目录下空的 `@` 文件夹。

2.  **重新初始化 `shadcn`**:
    - 删除项目根目录下的 `components.json` 配置文件。
    - 运行 `npx shadcn@latest init`，并根据交互式提示，**仔细确认**所有路径配置（特别是 `components` 和 `utils` 的别名）是否正确。这会生成一个干净且被当前版本 CLI 正确理解的 `components.json` 文件。
    - 重新运行 `npx shadcn@latest add <component>` 命令来安装组件。CLI 会识别到文件已存在并跳过，但这个过程可以验证配置是否已生效。

### 核心教训

- **优先使用 `init`**: 在使用任何会修改项目结构的第三方 CLI 工具时，应始终先运行其 `init` 或 `setup` 命令，以确保工具对项目环境有正确的认知。
- **验证路径别名**: 当项目中使用了路径别名（如 `@/`）时，需要确保构建工具 (Vite)、语言服务 (TypeScript) 和任何相关 Codegen 工具 (shadcn CLI) 的配置是完全一致的。
- **相信但要验证**: 即便是成熟的工具也可能存在 bug 或非预期的行为。当遇到难以理解的错误时（特别是与文件路径相关的），直接检查文件系统的实际结构（如使用 `ls -F`）往往能发现问题的根源。
