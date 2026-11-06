# Work Tracker Mobile

AI Work Tracker 移动端项目骨架（基于 TypeScript 核心层与 React Native 架构）。

## 架构原则

本项目采用**领域核心与展示层解耦**的架构：

1. **核心协议层 (`src/core/`)**：
   - `types.ts`：实体类型与 OpenAPI 规范定义。
   - `api-client.ts`：无平台依赖的 HTTP 客户端。
   - `storage.ts`：抽象存储适配器（可对接 React Native SQLite、MMKV、AsyncStorage 或原生 Android Room/SQLite）。
   - `sync-engine.ts`：增量同步引擎与三向合并状态机（协议 §3/§4）。
   - `gitee-client.ts`：Gitee 移动端直连客户端（凭据仅存本机安全硬件）。

2. **多端兼容性**：
   - 核心层代码全部使用标准 ES2022 / TypeScript，不绑定特定 UI 框架。
   - 后续如需迁移到 Android 原生 (Kotlin) 或 iOS 原生 (Swift)，业务状态机、差量计算和合并规则可 1:1 无损映射。

## 运行与测试

```bash
# 类型检查
npx tsc --noEmit

# 单元测试 (Node.js 内置 test runner)
node --test
```
