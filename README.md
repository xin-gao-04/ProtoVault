# ProtoVault

ProtoVault is a Windows-first desktop workbench for managing C++ data protocol assets.

## Prerequisites

- Node.js 22 or newer
- pnpm 11
- CMake 3.25 or newer
- Visual Studio Build Tools with the C++ workload
- LLVM/Clang with libclang (required from parser phase P3 onward)

## Development

```powershell
pnpm install
pnpm dev
```

Run the TypeScript and C++ checks independently:

```powershell
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm core:configure
pnpm core:build
pnpm core:test
```

In the desktop app, choose **加载示例项目** to scan
`examples` with Clang AST. The navigator can switch between
Header source previews, structs, enums, field tables, and diagnostics.
Each scan writes an atomic directory snapshot to `.protocol/workspace.json`
inside the opened workspace.

The top navigator actions currently support the first structured editing loop:
create a Header, create a `struct`, and append a field to the selected `struct`.
These actions open in-app structured editing forms. After each write, ProtoVault
rescans the workspace and refreshes the tree.
The main workspace uses tabs for opened Headers and protocol types, and struct
fields can be edited or deleted from the field table. Headers and structs can
also be renamed or deleted from their editor views.
Press F2 to edit the current Header, Struct, or Field, or use the tree/context
right-click menu for the same structured actions.
Open edit panels follow the current tree selection, so clicking another Header,
Struct, or Field remaps the form target immediately.
ProtoVault also remembers the last opened workspace and restores it on the next
launch when available.

## Theme compatibility

The renderer consumes common Obsidian CSS variables such as
`--background-primary`, `--background-secondary`, `--text-normal`,
`--text-muted`, and `--interactive-accent`. Paste a local Obsidian theme into
`apps/desktop/src/renderer/src/themes/user-obsidian-theme.css` to reuse its
color tokens where compatible.

The product definition and phased delivery gates are documented in `doc/初版设计思路.md` and `doc/Agent开发计划.md`.
