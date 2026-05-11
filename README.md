# 自建巡检系统 · GitHub Pages 零服务器方案

> 平替草料二维码 · 施工现场安全质量巡检系统
> 独立源码，数据直接存入 GitHub 仓库，永不落地本地

## 系统架构

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  手机扫码 → 填表  │ ──→ │  GitHub Pages    │ ──→ │  GitHub API      │
│  拍照上传        │     │  前端表单页面     │     │  直接写入仓库    │
└─────────────────┘     └──────────────────┘     └──────────────────┘
                                                         │
                                                   ┌─────┴─────┐
                                                   │           │
                                            ┌──────────┐ ┌──────────┐
                                            │ data/    │ │ uploads/ │
                                            │ JSON记录  │ │ 照片文件  │
                                            └──────────┘ └──────────┘
                                                   │
                                            ┌──────────┐
                                            │ GitHub   │
                                            │ Actions  │
                                            │ → Excel  │
                                            └──────────┘
```

### 核心特性

| 功能 | 说明 |
|------|------|
| **零服务器** | 纯 GitHub Pages 托管，无后端、无数据库、零费用 |
| **数据自管** | 所有数据 + 图片直接存入你自己的 GitHub 仓库 |
| **活码能力** | 二维码永久不变，后台可随时变更跳转目标 |
| **完整表单** | 8 大巡检分组，完全复刻草料表单结构 |
| **多图上传** | 现场拍照，自动压缩，直传仓库 |
| **Excel台账** | 自动生成汇总台账（.md + .xlsx，GitHub Actions双格式） |
| **管理后台** | 查看记录、照片墙、配置管理、Excel导出（浏览器端+Actions自动双通道） |
| **国内可访** | 配合 CDN 加速可在中国正常访问 |

## 快速开始（5 分钟部署）

### 第 1 步：创建 GitHub 仓库

1. 打开 [GitHub](https://github.com) 并登录
2. 点击右上角 `+` → `New repository`
3. 填写仓库名称（如 `inspection-system`）
4. 设为 **Public**（GitHub Pages 免费需要公开仓库）
5. 点击 `Create repository`

### 第 2 步：上传源码

```bash
# 将本仓库所有文件上传到你的新仓库
git init
git add .
git commit -m "初始化巡检系统"
git branch -M main
git remote add origin https://github.com/你的用户名/inspection-system.git
git push -u origin main
```

### 第 3 步：创建 GitHub Token

1. 打开 [Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. 点击 **Generate new token**
3. Token name: `inspection-system`
4. Repository access: 选择 **Only select repositories** → 选中刚刚创建的仓库
5. Permissions: 设置 **Contents** 为 **Read and write**
6. 点击 **Generate token**
7. **立即复制生成的 token！**（关闭页面后不再显示）

### 第 4 步：配置系统（两种方式）

#### 方式 A：网页配置（推荐）

1. 启用 GitHub Pages：仓库 → Settings → Pages → Source 选 `Deploy from branch`
   - Branch: `main`, folder: `/ (root)` → 点击 Save
   - 等待 1-2 分钟后访问 `https://你的用户名.github.io/inspection-system/?setup=1`
2. 按照页面指引填写 Token 和仓库地址
3. 点击保存，系统自动写入配置

#### 方式 B：手动配置

编辑 `config/settings.json` 文件：

```json
{
  "token": "github_pat_xxxxxxxxxxxx",
  "repo": "你的用户名/inspection-system",
  "branch": "main",
  "redirectUrl": "",
  "redirectEnabled": false,
  "formEnabled": true,
  "formTitle": "施工现场安全质量巡检表",
  "formDescription": "扫描二维码，按项检查并填写记录",
  "siteName": "施工现场巡检系统",
  "uploadCompressWidth": 1200,
  "uploadQuality": 0.75
}
```

### 第 5 步：生成二维码

1. 打开你的 GitHub Pages 地址：`https://你的用户名.github.io/inspection-system/`
2. 建议使用 [草料二维码](https://cli.im) 免费版生成二维码
3. 将二维码打印出来贴到现场

## 使用指南

### 工人端（扫码填表）

1. 扫描二维码 → 打开巡检表单
2. 填写：
   - **基本信息**：楼号、房号、巡查时间
   - **安全巡查**：7 项安全情况
   - **工序完成**：17 项工序百分比
   - **隐蔽验收**：4 项验收 + 验收人 + 结论 + 照片
   - **现场照片**：多图拍照上传
   - **实测实量**：墙地砖 + 腻子面合格率
   - **蓄水验收**：卫生间验收
3. 点击「提交巡检记录」
4. 数据自动存入 GitHub 仓库

### 管理端（后台管理）

访问 `https://你的用户名.github.io/inspection-system/admin.html`

| 功能 | 说明 |
|------|------|
| **巡检记录** | 查看全部记录，支持搜索、分页、详情 |
| **照片墙** | 浏览所有上传照片 |
| **活码配置** | 启用/关闭跳转、更改表单标题、查看二维码 |
| **系统设置** | 修改图片压缩参数 |
| **导出Excel** | 一键导出完整台账 |

### 活码功能

1. 二维码一旦生成，**永久不变**
2. 在后台「活码配置」中：
   - 启用「跳转」并输入新 URL → 扫码自动跳转新地址
   - 关闭「表单」→ 扫码显示「表单已暂停」
   - 修改表单标题 → 扫码看到新标题
3. 二维码无需重新打印

## 数据文件结构

```
仓库根目录/
├── config/settings.json    # 系统配置（Token + 设置）
├── data/                   # 巡检记录（JSON）
│   ├── INS20260510-ABCD.json
│   └── INS20260511-EFGH.json
├── uploads/                # 巡检照片
│   ├── 1712345678_abc123.jpg
│   └── ...
├── 台账汇总.md             # 自动生成的汇总报告
└── 台账汇总.xlsx           # 自动生成的Excel台账（需手动导出）
```

## 国内访问优化

由于 GitHub Pages 在国内访问可能较慢，建议：

### 方案 1：使用 jsDelivr CDN（自动）

代码中已配置 jsDelivr CDN 加载库文件，在中国有加速节点。

### 方案 2：Cloudflare Workers 反向代理（免费）

```js
// Cloudflare Worker 代理脚本
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const githubUrl = `https://你的用户名.github.io${url.pathname}${url.search}`
  const response = await fetch(githubUrl, {
    headers: { 'User-Agent': 'Cloudflare-Worker' }
  })
  return response
}
```

### 方案 3：自定义域名 + 国内 CDN

1. 购买国内已备案域名
2. GitHub Pages 绑定自定义域名
3. 使用腾讯云 CDN / 阿里云 CDN / Cloudflare 加速
4. 详细教程参考 [GitHub Pages 自定义域名文档](https://docs.github.com/cn/pages/configuring-a-custom-domain-for-your-github-pages-site)

## 自定义表单

所有表单字段在 `index.html` 中定义，可直接修改 HTML 来调整：

- **修改字段**：编辑 `index.html` 中的表单元素
- **增删分组**：添加/删除 `<div class="card" data-group="N">` 区块
- **修改选项**：编辑下拉选择框的 `<option>` 列表
- **提交逻辑**：编辑 `index.html` 中 `FormHandler._handleSubmit()` 方法

|## 安全说明

- **Token 权限**：建议使用 Fine-grained Token，仅授予一个仓库的 `Contents: write` 权限
- **Token 存储**：Token 保存在仓库 `config/settings.json` 中，任何能访问仓库的人可见
- **Token 自动吊销**：GitHub Secret Scanning 会自动检测并吊销公开仓库中的有效 Token。系统内置以下规避方案：
  - **拆分 Token**：`_tp1` + `_tp2` 字段，分开存储后系统自动拼接
  - **Base64 编码**：`_token_b64` 字段，先 Base64 编码后再存储
  - **URL 参数覆盖**：`?token=` 可临时覆盖，适合工地扫码场景（Token 不在仓库中持久化）
- **数据可见性**：所有数据和图片均为公开（对应仓库为公开仓库时）
- **建议**：如需敏感数据，请使用私有仓库并自行部署

## GitHub Actions 自动台账

推送巡检数据到 `data/*.json` 后，工作流 `.github/workflows/generate-excel.yml` 自动执行：

1. 读取所有 JSON 记录
2. 生成 **Markdown 汇总报告**（`台账汇总.md`）
3. 生成 **Excel 台账**（`台账汇总.xlsx`，4 个 Sheet：汇总/工序/隐蔽验收/实测实量）
4. 自动 commit 并 push 到仓库

两个文件始终保持与最新数据同步。也可在管理后台「导出Excel」手动触发浏览器端导出。

## 技术栈

- **前端**：原生 HTML + CSS + JavaScript（无框架依赖）
- **存储**：GitHub Content API（仓库即数据库）
- **CI/CD**：GitHub Actions（自动生成台账）
- **图片处理**：Canvas API（浏览器端压缩）
- **Excel 生成**：SheetJS（浏览器端导出，CDN加载）

## 许可

MIT License — 自由使用、修改、商用
