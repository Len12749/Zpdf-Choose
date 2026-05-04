# Zpdf-Choose

Zpdf-Choose 是一个本地运行的选择题题库系统。它支持上传 PDF、图片和文本材料，调用 SiliconFlow 多模态模型抽取选择题，整理为题库后再进行刷题、背题、收藏和错题复习。

## 功能概览

- 题库管理：创建、编辑、删除题库，支持题库合并
- 智能导题：上传 PDF / TXT / Markdown / 图片后，自动提取选择题
- AI 补全：对缺失答案或解析的题目做二次修复
- 刷题模式：支持顺序、逆序、乱序练习
- 背题模式：适合快速浏览题干、答案和解析
- 收藏与错题本：沉淀重点题和薄弱题
- 本地存储：默认使用 SQLite，数据文件位于 `data/sqlite.db`

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- better-sqlite3
- pdfjs-dist
- SiliconFlow API

## 运行要求

- Node.js 20 及以上
- npm 10 及以上
- 可访问 SiliconFlow API

如果是首次在新机器启动，建议先确认本机已经具备 `better-sqlite3` 和 `canvas` 所需的原生编译环境。

## 环境变量配置

项目不会提交本地环境变量。请在根目录创建 `.env.local`，推荐直接从示例文件复制：

```bash
cp .env.example .env.local
```

然后按需填写：

```env
SILICONFLOW_API_KEY=你的_SiliconFlow_API_Key
SILICONFLOW_API_URL=https://api.siliconflow.cn/v1/chat/completions
SILICONFLOW_MODEL=Qwen/Qwen3-VL-30B-A3B-Instruct
```

说明：

- `SILICONFLOW_API_KEY`：必填，用于题目抽取和修复
- `SILICONFLOW_API_URL`：通常保持默认即可
- `SILICONFLOW_MODEL`：可替换成你实际使用的视觉模型

未配置这些变量时，依赖 AI 的导题能力无法正常工作。

## 安装依赖

```bash
npm install
```

## 启动开发环境

项目默认运行在 `3002` 端口：

```bash
npm run dev
```

启动后访问：

```text
http://localhost:3002
```

## 生产启动

```bash
npm run build
npm run start
```

## 数据与目录说明

- `src/app`：页面和 API 路由
- `src/components`：界面组件
- `src/lib`：数据库、题目处理、AI 调用等核心逻辑
- `data/`：SQLite 数据文件目录，运行后自动生成
- `uploads/temp/`：上传文件临时目录

`data/`、`uploads/temp/`、`.env.local` 都属于本地运行时数据，已经加入忽略规则，不应提交到 Git。

## 常用开发命令

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## 提交与推送前建议

- 确认 `.env.local` 没有被加入暂存区
- 确认 `data/` 和 `uploads/temp/` 中的本地数据没有被提交
- 如需分享项目，保留 `.env.example` 作为配置模板即可
