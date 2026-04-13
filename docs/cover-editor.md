# Editor — Design Document

## Overview

独立的图片编辑器面板，提供裁剪和文字叠加功能，定位为可扩展的编辑工具集。裁剪和文字是两个独立 feature，分开实现。

## Entry Point

- Gallery 右键菜单新增 **Edit** 选项
- Lightbox 工具栏新增 **Edit** 按钮（Pencil 图标）
- 点击后进入 Editor 全屏模式
- 按 Escape 或点击 Done 退出
- 编辑完成后点 Export 导出新图片文件

---

## Feature 1: Crop & Transform（裁剪与变换）

裁剪、旋转、翻转是一组紧密关联的变换操作，合并到同一个工具面板。

### 裁剪交互

- 进入裁剪工具后，图片自动 fit 到视口（无缩放控制）
- 图片上显示裁剪框 + 暗色遮罩（区域外 `rgba(0,0,0,0.6)`）
- 裁剪框内显示三等分参考线（Rule of Thirds）
- 裁剪框四角 L 型手柄 + 四边中点手柄可拖拽调整
- 裁剪框内部可拖拽移动位置

### 预设比例

右侧面板提供比例预设，分组排列：

| 分类 | 比例 | 说明 |
|------|------|------|
| 基础 | Free | 自由裁剪 |
| 基础 | Original | 保持原图比例 |
| 正方形 | 1:1 | 社交媒体头像 |
| 摄影 | 3:2 / 2:3 | 35mm 胶片 |
| 摄影 | 4:3 / 3:4 | 数码相机标准 |
| 摄影 | 5:4 / 4:5 | 大画幅 / Instagram |
| 视频 | 16:9 / 9:16 | 视频/YouTube/竖屏 |
| 视频 | 21:9 / 9:21 | 超宽屏/电影 |
| 社交 | 1.91:1 | Facebook/Twitter 链接预览 |
| 打印 | 5:7 / 7:5 | 5×7 照片 |
| 打印 | 8.5:11 | US Letter |
| 打印 | A4 (1:√2) | ISO A4 |

- 点击比例锁定裁剪框
- 横竖翻转按钮一键切换方向

### 旋转

- **90° 旋转**：顺时针/逆时针 90° 按钮
- **自由旋转**：角度滑块 -45° ~ +45°，拖拽微调
- **自动校正**：Auto 按钮，根据图片内容自动校正水平线（V2）

### 翻转

- **水平翻转**（Flip X）：左右镜像
- **垂直翻转**（Flip Y）：上下镜像

### 重置

- Reset 按钮：还原所有裁剪/旋转/翻转到初始状态

### 确认操作

- Apply（✓）：应用当前裁剪变换
- Cancel（✕）：取消，恢复原状
- 支持 Undo 还原已 Apply 的裁剪

---

## Feature 2: Text Overlay（文字叠加）

_独立实现，Phase 2。_

### 添加文字
- 左侧工具栏点击 Text 工具，点击画布插入文字
- 默认 "Text"，立即进入编辑
- 支持多个文字图层

### 文字属性面板（右侧，选中文字时显示）
- 字体：系统字体列表，搜索过滤，字体名用自身字体预览
- 字号：12–400px，默认 48
- 颜色：预设色板 + 自定义取色器
- 对齐：左 / 中 / 右
- 样式：粗体 / 斜体
- 透明度：0–100%

### 文字交互
- 拖拽移动
- 双击编辑（contentEditable）
- Delete 键删除
- 选中框（虚线 + 四角手柄）

---

## 技术方案

### 组件结构

```
Editor.jsx                — 全屏主容器
├── EditorCanvas.jsx      — 图片显示（img + CSS transform）
├── CropOverlay.jsx       — 裁剪框 + 遮罩 + 参考线 + 手柄
├── TextLayer.jsx         — 文字图层（拖拽/编辑）
├── EditorToolbar.jsx     — 左侧工具栏
├── CropPanel.jsx         — 右侧裁剪面板（比例 + 旋转 + 翻转）
├── TextPanel.jsx         — 右侧文字属性面板
└── ExportDialog.jsx      — 导出弹窗
```

### 状态模型

```javascript
{
  activeTool: "select" | "crop" | "text",

  // 图片
  imageSrc: string,
  imageNaturalSize: { width, height },

  // 裁剪变换
  crop: { x, y, width, height } | null,
  cropAspect: "free" | "original" | "1:1" | "3:2" | ...,
  rotation: number,        // 角度，-180 ~ 180
  flipX: boolean,
  flipY: boolean,

  // 文字图层
  textLayers: [
    {
      id: string,
      text: string,
      x: number,            // 百分比 0–1
      y: number,
      fontFamily: string,
      fontSize: number,
      color: string,
      opacity: number,
      align: "left" | "center" | "right",
      bold: boolean,
      italic: boolean,
    }
  ],
  selectedLayerId: string | null,

  // Undo
  history: StateSnapshot[],
  historyIndex: number,
}
```

### 图标

使用 `lucide-react`（项目已安装），**不自行绘制 SVG**。需要的图标：
- `Crop`, `Type`, `MousePointer2` — 工具栏
- `RotateCw`, `RotateCcw` — 旋转
- `FlipHorizontal2`, `FlipVertical2` — 翻转
- `RotateCcw`（复用为 Reset）
- `Check`, `X` — Apply / Cancel
- `Undo2`, `Redo2` — 撤销/重做
- `Download` — 导出
- `Pencil` — Edit 入口

### 新增 IPC

```javascript
// preload.js
listSystemFonts: () => ipcRenderer.invoke("workspace:list-fonts")
saveImage: (filePath, arrayBuffer) => ipcRenderer.invoke("workspace:save-image", filePath, arrayBuffer)
pickSavePath: (defaultName) => ipcRenderer.invoke("workspace:pick-save-path", defaultName)
```

### 渲染策略

**编辑态**：DOM 渲染
- 图片：`<img>` + CSS transform（rotation, flip 用 `transform: rotate() scaleX(-1)` 等）
- 裁剪框：绝对定位 div（四个遮罩区域 + 手柄）
- 文字：`<div>` 绝对定位，contentEditable

**导出态**：Canvas 2D
- 只在导出时用 Canvas 合成最终图片

### UI 设计原则

- **克制使用边框**：面板、按钮尽量无边框，用背景色差异和间距区分区域
- **比例按钮**：无边框，hover/active 用背景色变化表达状态，active 用 accent 色
- **图片自动 fit**：裁剪模式下无缩放控制，图片自动适配视口
- **面板与画布之间用细微分割线**，内部组件不加边框

---

## UI 布局

```
┌──────────────────────────────────────────────────────────────┐
│ [Done]            Editor            [Undo] [Redo] [Export]   │
├────┬───────────────────────────────────────────┬─────────────┤
│    │                                           │             │
│ ↖  │                                           │ ASPECT RATIO│
│    │                                           │ Free  Orig  │
│ ⬒  │          Image + Crop Overlay             │ 1:1   3:2   │
│    │          (auto fit, no zoom)              │ 4:3   5:4   │
│ T  │                                           │ 16:9  21:9  │
│    │                                           │ 4:5  1.91:1 │
│    │                                           │ 5:7  8.5:11 │
│    │                                           │ A4   [Flip] │
│    │                                           │             │
│    │                                           │ TRANSFORM   │
│    │                                           │ ↺90  ↻90    │
│    │                                           │ FlipX FlipY │
│    │                                           │             │
│    │                                           │ Angle ──●── │
│    │                                           │             │
│    │                                           │ [Reset]     │
│    │                                           │─────────────│
│    │                                           │ [✓ Apply][✕]│
└────┴───────────────────────────────────────────┴─────────────┘
```

- 全屏覆盖，z-index 与 Lightbox 同级
- 左侧窄工具栏：Select / Crop / Text
- 右侧面板：上半 Aspect Ratio 预设，下半 Transform 操作（旋转/翻转/角度/重置）
- 无底部缩放条，图片自动 fit
- 面板内按钮无边框，用背景色表达交互态

---

## 实现分期

### Phase 1 — 裁剪与变换
- Editor 组件 + 全屏进入/退出
- 图片自动 fit 显示
- 裁剪框交互（四角/四边/移动）
- 全部预设比例 + 横竖翻转
- 90° 旋转 + 自由角度旋转
- 水平/垂直翻转
- Reset 重置
- Canvas 导出裁剪+变换后的 JPEG
- 右键菜单 Edit 入口

### Phase 2 — 文字叠加
- Text 工具 + 拖拽 + 双击编辑
- 属性面板（字号、颜色、对齐、粗体/斜体）
- 系统字体列表 + 字体选择器
- 透明度
- Canvas 合成文字导出

### Phase 3 — 体验完善
- Undo/Redo（Cmd+Z / Cmd+Shift+Z）
- 导出格式/质量弹窗
- 键盘快捷键
- 导出完成 toast + Reveal in Finder
