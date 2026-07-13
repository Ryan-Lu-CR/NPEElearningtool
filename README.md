# 本地题库 · 增强版

一个本地优先的考研题库 Web 应用。题库、错题和掌握状态默认保存在当前浏览器的 `localStorage`，无需登录或后端服务。

## 启动

### 一键启动

- macOS：双击 `一键启动.command`（自动配置 Homebrew、Node.js、pnpm 和项目依赖）
- Windows：双击 `一键启动.bat`（通过 winget 自动配置 Node.js、pnpm 和项目依赖）

首次启动需要联网，macOS 安装 Homebrew 时可能要求输入系统密码。配置完成后会自动打开浏览器；以后双击通常可以直接启动。也可以使用命令行：

```bash
pnpm install
pnpm dev
```

生产构建：

```bash
pnpm build
pnpm preview
```

## 已实现

- 多题库、章节、小节无缝切换
- 可在页面中直接新建空题库，再批量导入图片自动生成章节、小节和题目
- 选择题、填空题、解答题展示
- 熟练、模糊、错题标记及自动持久化
- 跨题库汇总的全局错题本，可一键重练并自动移出已掌握题目
- 当前小节全文搜索与状态筛选
- 题号导航、上一题/下一题、答案解析折叠
- JSON 题库导入与完整数据备份
- 整目录批量导入题目图片和多张答案图片
- 当前小节打印或另存为 PDF（含题目、答案和解析）
- 桌面端与移动端响应式布局

## 导入格式

可以导入单纯的题库数组，或含 `banks` 字段的备份文件。最小格式：

```json
{
  "banks": [{
    "id": "my-bank",
    "name": "我的强化题库",
    "source": "local",
    "chapters": [{
      "id": "chapter-1",
      "name": "第一章",
      "sections": [{
        "id": "section-1",
        "name": "选择题",
        "questions": [{
          "id": "question-1",
          "number": 1,
          "type": "选择题",
          "text": "题目正文",
          "options": ["A. 选项一", "B. 选项二"],
          "answer": "A",
          "analysis": "解析正文"
        }]
      }]
    }]
  }]
}
```

题目还支持 `imageUrl`、`answerImageUrl`、`imageKeys`、`answerImageKeys` 和 `videoUrl`。导入同 ID 题库时，新数据会替换旧数据；学习状态会继续保留。

## 批量导入图片

点击顶部“图片”，选择一个包含图片的目录。系统根据文件名中的题目 ID 自动匹配，可一次导入大量文件。推荐命名：

```text
q__question-1__1.jpg       第 1 张题目图
q__question-1__2.jpg       第 2 张题目图
a__question-1__1.jpg       第 1 张答案图
a__question-1__2.jpg       第 2 张答案图
a__question-1__3.jpg       第 3 张答案图
```

其中 `question-1` 必须与 JSON 中题目的 `id` 完全相同。也兼容以下更直观的命名：

```text
question-1.jpg
question-1_题目_2.jpg
question-1_答案_1.jpg
question-1_answer_2.png
```

无法匹配题目 ID 的图片会被安全跳过，并在页面底部显示统计。再次导入同名文件会覆盖其 Blob，不会无限复制。

### 三段数字自动建题规则

兼容 `01-1-01.png` 这类现有文件名：依次表示章号、小节号和题号，且默认作为题目图。无需先在 JSON 中建立题目。

```text
01-1-01.png             第 01 章 / 第 1 节 / 第 01 题的题目图
01-1-01-Q-2.png         同一题第 2 张题目图
01-1-01-A-1.png         同一题第 1 张答案图
01-1-01-A-2.png         同一题第 2 张答案图
```

如果图片放在 `01 行列式 1-基础.assets` 文件夹中，还会自动把章节命名为“行列式”，小节命名为“基础”。Q 表示题目，A 表示答案；末尾序号没有固定上限。

## 数据说明

- 题库键：`npee:banks:v1`
- 状态键：`npee:status:v1`
- 图片素材：浏览器 IndexedDB 数据库 `npee-question-assets`
- 点击顶部“备份”可导出题库和学习状态。
- 图片不存进 `localStorage`，支持远高于普通 JSON 缓存的容量；实际配额由浏览器和磁盘空间决定。
- JSON 备份目前只包含题库结构和学习状态，不包含 IndexedDB 中的图片 Blob。
- 清除浏览器站点数据会删除本地内容和图片，请保留原始图片目录并定期备份 JSON。
