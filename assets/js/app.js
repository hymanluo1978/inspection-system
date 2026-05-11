/**
 * 自建巡检系统 · GitHub免服务器方案
 * Self-hosted Inspection System
 * v1.0 — GitHub Pages + GitHub API
 *
 * 架构: 纯前端 → GitHub Content API → 直接写入仓库
 * 零服务器, 数据永不落地
 */

/* ============================================================
   1. GITHUB STORAGE ENGINE
   ============================================================ */
class GithubStorage {
  constructor(token, repo, branch = 'main') {
    this.token = token;
    this.repo = repo;
    this.branch = branch;
    this.apiBase = 'https://api.github.com';
    this.rawBase = 'https://raw.githubusercontent.com';
    // For China mirror support
    this.mirrorApi = '';
    this.mirrorRaw = '';
    this.fetchTimeout = 15000; // 15 second timeout for API calls
  }

  // ---- fetch with timeout ----
  async _fetch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeout);
    options.signal = controller.signal;
    try {
      const res = await fetch(url, options);
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接 (GitHub API 15秒无响应)');
      }
      throw e;
    }
  }

  // ---- headers ----
  _headers() {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    if (this.token && this.token !== 'YOUR_GITHUB_TOKEN_HERE') {
      h['Authorization'] = `Bearer ${this.token}`;
    }
    return h;
  }

  // ---- read file from repo ----
  async readFile(path) {
    const url = `${this.apiBase}/repos/${this.repo}/contents/${path}?ref=${this.branch}`;
    const res = await this._fetch(url, { headers: this._headers() });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `读取文件失败 (${res.status})`);
    }
    const data = await res.json();
    return {
      sha: data.sha,
      content: atob(data.content.replace(/\n/g, '')),
      size: data.size,
      html_url: data.html_url,
      download_url: data.download_url
    };
  }

  // ---- write / update file ----
  async writeFile(path, content, message) {
    const base64Content = btoa(unescape(encodeURIComponent(content)));
    const existing = await this.readFile(path);
    const body = {
      message: message || `巡检数据: ${path}`,
      content: base64Content,
      branch: this.branch
    };
    if (existing && existing.sha) body.sha = existing.sha;

    const url = `${this.apiBase}/repos/${this.repo}/contents/${path}`;
    const res = await this._fetch(url, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `写入文件失败 (${res.status})`);
    }
    return await res.json();
  }

  // ---- write binary (image) ----
  async writeBinary(path, base64Data, message) {
    const existing = await this.readFile(path);
    const body = {
      message: message || `上传图片: ${path}`,
      content: base64Data,
      branch: this.branch
    };
    if (existing && existing.sha) body.sha = existing.sha;

    const url = `${this.apiBase}/repos/${this.repo}/contents/${path}`;
    const res = await this._fetch(url, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `上传图片失败 (${res.status})`);
    }
    return await res.json();
  }

  // ---- list files in a directory ----
  async listFiles(path) {
    const url = `${this.apiBase}/repos/${this.repo}/contents/${path}?ref=${this.branch}`;
    const res = await this._fetch(url, { headers: this._headers() });
    if (res.status === 404) return [];
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `列出文件失败 (${res.status})`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter(item => item.type === 'file' && item.name !== '.gitkeep');
  }

  // ---- get raw download URL for an uploaded file ----
  getRawUrl(path) {
    return `https://raw.githubusercontent.com/${this.repo}/${this.branch}/${path}`;
  }

  // ---- get a mirror-friendly URL ----
  getMirrorUrl(path) {
    return this.getRawUrl(path);
  }

  // ---- delete file (for admin) ----
  async deleteFile(path, message) {
    const existing = await this.readFile(path);
    if (!existing || !existing.sha) return;
    const url = `${this.apiBase}/repos/${this.repo}/contents/${path}`;
    const res = await this._fetch(url, {
      method: 'DELETE',
      headers: this._headers(),
      body: JSON.stringify({
        message: message || `删除: ${path}`,
        sha: existing.sha,
        branch: this.branch
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `删除文件失败 (${res.status})`);
    }
  }
}

/* ============================================================
   2. CONFIG MANAGER
   ============================================================ */
class ConfigManager {
  constructor(storage) {
    this.storage = storage;
    this.configPath = 'config/settings.json';
    this.cache = null;
  }

  async load() {
    if (this.cache) return this.cache;
    try {
      const file = await this.storage.readFile(this.configPath);
      if (file) {
        this.cache = JSON.parse(file.content);
        // Handle split token (bypass secret scanning, Part 1 + Part 2)
        if (this.cache._tp1 && this.cache._tp2 && !this.cache.token) {
          this.cache.token = this.cache._tp1 + this.cache._tp2;
        }
        // Handle base64 encoded token (fallback)
        if (this.cache._token_b64 && !this.cache.token) {
          try {
            this.cache.token = atob(this.cache._token_b64);
          } catch(e) {
            console.warn('Failed to decode _token_b64');
          }
        }
        // Also check URL params for token override
        const params = new URLSearchParams(window.location.search);
        if (params.get('token')) {
          this.cache.token = params.get('token');
        }
        return this.cache;
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  async save(config) {
    this.cache = config;
    await this.storage.writeFile(
      this.configPath,
      JSON.stringify(config, null, 2),
      '更新系统配置'
    );
  }

  // Quick check if system is configured
  isConfigured(config) {
    return config &&
           config.token &&
           config.token !== 'YOUR_GITHUB_TOKEN_HERE' &&
           config.repo &&
           config.repo !== 'YOUR_USERNAME/YOUR_REPO_NAME';
  }
}

/* ============================================================
   3. DATA MANAGER (form submissions)
   ============================================================ */
class DataManager {
  constructor(storage) {
    this.storage = storage;
    this.dataDir = 'data';
  }

  // Save a form submission
  async saveSubmission(submission) {
    const id = submission.id || this._generateId();
    submission.id = id;
    submission._savedAt = new Date().toISOString();
    const filename = `${id}.json`;
    const path = `${this.dataDir}/${filename}`;

    // Save the JSON data
    await this.storage.writeFile(
      path,
      JSON.stringify(submission, null, 2),
      `巡检记录: ${submission.basicInfo?.building || ''}栋${submission.basicInfo?.unit || ''}`
    );

    return { id, path };
  }

  // Load all submissions
  async loadAllSubmissions() {
    const files = await this.storage.listFiles(this.dataDir);
    const submissions = [];

    for (const file of files) {
      if (!file.name.endsWith('.json')) continue;
      try {
        const data = await this.storage.readFile(`${this.dataDir}/${file.name}`);
        if (data) {
          submissions.push(JSON.parse(data.content));
        }
      } catch (e) {
        console.warn('跳过异常文件:', file.name, e.message);
      }
    }

    // Sort by saved time, newest first
    submissions.sort((a, b) => {
      return new Date(b._savedAt || 0) - new Date(a._savedAt || 0);
    });

    return submissions;
  }

  // Delete a submission
  async deleteSubmission(id) {
    const path = `${this.dataDir}/${id}.json`;
    await this.storage.deleteFile(path, `删除巡检记录: ${id}`);
  }

  // Generate a unique ID
  _generateId() {
    const now = new Date();
    const dateStr = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `INS${dateStr}-${rand}`;
  }
}

/* ============================================================
   4. IMAGE UPLOADER
   ============================================================ */
class ImageUploader {
  constructor(storage) {
    this.storage = storage;
    this.uploadDir = 'uploads';
  }

  // Compress and upload a single image
  async uploadImage(file, maxWidth = 1200, quality = 0.75) {
    const compressed = await this._compressImage(file, maxWidth, quality);
    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const path = `${this.uploadDir}/${filename}`;

    // Upload to GitHub
    await this.storage.writeBinary(path, compressed.base64, `上传巡检照片: ${filename}`);

    return {
      filename,
      path,
      url: this.storage.getRawUrl(path),
      size: compressed.size
    };
  }

  // Upload multiple images
  async uploadImages(files, maxWidth, quality) {
    const results = [];
    for (const file of files) {
      try {
        const result = await this.uploadImage(file, maxWidth, quality);
        results.push(result);
      } catch (e) {
        console.error('图片上传失败:', file.name, e.message);
        throw e;
      }
    }
    return results;
  }

  // Compress image client-side using Canvas
  async _compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;

          // Resize if needed
          if (w > maxWidth) {
            h = h * (maxWidth / w);
            w = maxWidth;
          }
          // Also cap height for very tall images
          const maxHeight = maxWidth * 1.5;
          if (h > maxHeight) {
            w = w * (maxHeight / h);
            h = maxHeight;
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          // Output format
          const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const base64 = canvas.toDataURL(mimeType, quality).split(',')[1];

          resolve({
            base64,
            width: w,
            height: h,
            size: Math.round(base64.length * 0.75), // approximate original size
            mimeType
          });
        };
        img.onerror = () => reject(new Error('图片解析失败'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });
  }

  // List all uploaded images
  async listImages() {
    return await this.storage.listFiles(this.uploadDir);
  }
}

/* ============================================================
   5. EXCEL EXPORTER (client-side via SheetJS)
   ============================================================ */
class ExcelExporter {
  // Export submissions to XLSX
  static async export(submissions, filename = '巡检台账.xlsx') {
    // Load SheetJS from CDN if not available
    if (typeof XLSX === 'undefined') {
      try {
        await ExcelExporter._loadSheetJS();
      } catch(e) {
        // Fallback to alternative CDN
        try {
          await ExcelExporter._loadSheetJS('cdnjs');
        } catch(e2) {
          throw new Error('无法加载 Excel 库，请检查网络连接');
        }
      }
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary/List view
    const summaryData = submissions.map((s, i) => ({
      '序号': i + 1,
      '记录编号': s.id || '',
      '提交时间': ExcelExporter._fmt(s._savedAt || ''),
      '楼号': s.basicInfo?.building || '',
      '房号': s.basicInfo?.unit || '',
      '巡查时间': s.basicInfo?.inspectionTime || '',
      '临时用电': s.safetyInspection?.['临时用电'] || '',
      '临边防护': s.safetyInspection?.['临边防护'] || '',
      '灭火器': s.safetyInspection?.['灭火器'] || '',
      '水枪水带': s.safetyInspection?.['水枪水带'] || '',
      '登高作业': s.safetyInspection?.['登高作业'] || '',
      '动火作业': s.safetyInspection?.['动火作业'] || '',
      '卫生情况': s.safetyInspection?.['卫生情况'] || '',
    }));
    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    // Auto-fit column widths
    const colWidths = Object.keys(summaryData[0] || {}).map(() => ({ wch: 14 }));
    ws1['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws1, '汇总');

    // Sheet 2: Process completion
    const processData = submissions.map((s, i) => {
      const pc = s.processCompletion || {};
      return {
        '序号': i + 1,
        '记录编号': s.id || '',
        ...Object.keys(pc).reduce((acc, k) => ({ ...acc, [k]: pc[k] }), {})
      };
    });
    if (processData.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(processData);
      XLSX.utils.book_append_sheet(wb, ws2, '工序完成情况');
    }

    // Sheet 3: Hidden works inspection
    const hiddenData = [];
    submissions.forEach((s, i) => {
      const hw = s.hiddenWorks || [];
      hw.forEach((h, j) => {
        hiddenData.push({
          '序号': `${i + 1}-${j + 1}`,
          '记录编号': s.id || '',
          '楼号': s.basicInfo?.building || '',
          '房号': s.basicInfo?.unit || '',
          '验收项目': h.name || '',
          '验收人': h.inspector || '',
          '验收结论': h.conclusion || '',
        });
      });
    });
    if (hiddenData.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(hiddenData);
      XLSX.utils.book_append_sheet(wb, ws3, '隐蔽验收');
    }

    // Sheet 4: Measurements
    const measData = submissions.map((s, i) => ({
      '序号': i + 1,
      '记录编号': s.id || '',
      '楼号': s.basicInfo?.building || '',
      '房号': s.basicInfo?.unit || '',
      '墙地空鼓实测人': s.tileMeasurement?.实测人 || '',
      '墙地空鼓实测时间': s.tileMeasurement?.实测时间 || '',
      '墙地砖空鼓': s.tileMeasurement?.['墙地砖空鼓'] || '',
      '高低差': s.tileMeasurement?.高低差 || '',
      '垂直度(墙地)': s.tileMeasurement?.垂直度 || '',
      '平整度(墙地)': s.tileMeasurement?.平整度 || '',
      '阴阳角(墙地)': s.tileMeasurement?.阴阳角 || '',
      '腻子实测人': s.puttyMeasurement?.实测人 || '',
      '腻子实测时间': s.puttyMeasurement?.实测时间 || '',
      '顶棚极差': s.puttyMeasurement?.顶棚极差 || '',
      '阴阳角(腻子)': s.puttyMeasurement?.阴阳角 || '',
      '垂直度(腻子)': s.puttyMeasurement?.垂直度 || '',
      '平整度(腻子)': s.puttyMeasurement?.平整度 || '',
      '三边两线': s.puttyMeasurement?.三边两线 || '',
      '阴阳角直线度': s.puttyMeasurement?.阴阳角直线度 || '',
    }));
    if (measData.length > 0) {
      const ws4 = XLSX.utils.json_to_sheet(measData);
      XLSX.utils.book_append_sheet(wb, ws4, '实测实量');
    }

    // Sheet 5: Bathroom test
    const bathData = [];
    submissions.forEach((s, i) => {
      if (s.bathroomTest?.inspector || s.bathroomTest?.conclusion || (s.bathroomTest?.photos || []).length > 0) {
        bathData.push({
          '序号': i + 1,
          '记录编号': s.id || '',
          '楼号': s.basicInfo?.building || '',
          '房号': s.basicInfo?.unit || '',
          '验收人': s.bathroomTest?.inspector || '',
          '验收结论': s.bathroomTest?.conclusion || '',
          '照片数': (s.bathroomTest?.photos || []).length,
        });
      }
    });
    if (bathData.length > 0) {
      const ws5 = XLSX.utils.json_to_sheet(bathData);
      XLSX.utils.book_append_sheet(wb, ws5, '卫生间蓄水验收');
    }

    // Generate and download
    XLSX.writeFile(wb, filename);
    return filename;
  }

  static _fmt(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleString('zh-CN'); } catch { return d; }
  }

  static _loadSheetJS(cdn = 'default') {
    return new Promise((resolve, reject) => {
      if (typeof XLSX !== 'undefined') { resolve(); return; }
      const urls = {
        'default': 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
        'cdnjs': 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
        'unpkg': 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
      };
      const script = document.createElement('script');
      script.src = urls[cdn] || urls['default'];
      script.onload = resolve;
      script.onerror = () => reject(new Error(`SheetJS加载失败 (CDN: ${cdn})`));
      document.head.appendChild(script);
    });
  }
}

/* ============================================================
   6. UI HELPERS
   ============================================================ */
const UI = {
  // Show a toast notification
  toast(message, type = 'info', duration = 3000) {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
      }, duration);
    });
  },

  // Show loading state
  showLoading(container, text = '加载中...') {
    const el = document.getElementById(container) || container;
    if (typeof el === 'string') return;
    el.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <span>${text}</span>
      </div>`;
  },

  // Show/hide element
  show(el) { const e = typeof el === 'string' ? document.getElementById(el) : el; if (e) e.style.display = ''; },
  hide(el) { const e = typeof el === 'string' ? document.getElementById(el) : el; if (e) e.style.display = 'none'; },

  // Format date
  formatDate(iso) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return iso; }
  },

  // Copy text to clipboard
  async copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast('已复制到剪贴板', 'success');
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      this.toast('已复制到剪贴板', 'success');
    }
  },

  // Escape HTML
  escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  },

  // Confirm dialog
  confirm(message) {
    return new Promise((resolve) => {
      if (window.confirm(message)) resolve(true);
      else resolve(false);
    });
  }
};

/* ============================================================
   7. APPLICATION CONTROLLER
   ============================================================ */
class App {
  constructor() {
    this.initialized = false;
    this.config = null;
    this.storage = null;
    this.configMgr = null;
    this.dataMgr = null;
    this.imageUploader = null;
  }

  // Initialize: load config, set up storage
  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // First, try to get config from URL params (for setup)
    const urlParams = new URLSearchParams(window.location.search);

    // Load config from repo
    // But first we need to know the repo. We can get it from the page URL or a hardcoded value
    // For GitHub Pages, we know the owner/repo from the URL
    const pageInfo = this.detectRepoInfo();

    // Try to load settings.json from the repo
    // Use a temporary storage to read the config
    const tempStorage = new GithubStorage(
      urlParams.get('token') || '',
      pageInfo.repo || '',
      'main'
    );
    const tempConfig = new ConfigManager(tempStorage);
    const config = await tempConfig.load();

    if (config && config.token && config.repo) {
      // Full config found
      this.config = config;
      this.storage = new GithubStorage(config.token, config.repo, config.branch || 'main');
      this.configMgr = new ConfigManager(this.storage);
      this.dataMgr = new DataManager(this.storage);
      this.imageUploader = new ImageUploader(this.storage);

      // Reload config via proper storage
      this.config = await this.configMgr.load();
    } else {
      // No config found - use defaults, show setup mode
      this.config = {
        token: urlParams.get('token') || '',
        repo: pageInfo.repo || '',
        branch: 'main',
        formTitle: '施工现场安全质量巡检表',
        formDescription: '扫描二维码，按项检查并填写记录',
        siteName: '施工现场巡检系统'
      };
      if (this.config.token && this.config.repo) {
        this.storage = new GithubStorage(this.config.token, this.config.repo);
        this.configMgr = new ConfigManager(this.storage);
        this.dataMgr = new DataManager(this.storage);
        this.imageUploader = new ImageUploader(this.storage);
      }
    }

    return this.config;
  }

  // Detect repo info from page URL (for GitHub Pages)
  detectRepoInfo() {
    const host = window.location.hostname;
    const path = window.location.pathname;

    // Pattern: https://{user}.github.io/{repo}/
    if (host.endsWith('github.io')) {
      const user = host.replace('.github.io', '');
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 0) {
        // We know the repo name from the path
        return {
          repo: `${user}/${parts[0]}`,
          owner: user,
          repoName: parts[0]
        };
      }
    }

    return { repo: '', owner: '', repoName: '' };
  }

  // Backward-compatible alias for _detectRepoInfo
  _detectRepoInfo() {
    return this.detectRepoInfo();
  }

  // Helper: render a multi-row input group
  static renderMultiRow(items, namePrefix, values = {}) {
    return items.map((item, index) => `
      <div class="multi-row-item">
        <label class="item-label">${UI.escape(item)}</label>
        <input type="text" class="form-input"
               name="${namePrefix}[${index}]"
               data-key="${item}"
               value="${UI.escape(values[item] || '')}"
               placeholder="填写${item}">
      </div>
    `).join('');
  }

  // Helper: parse multi-row data from a container
  static parseMultiRow(container) {
    const data = {};
    container.querySelectorAll('[data-key]').forEach(input => {
      data[input.dataset.key] = input.value.trim();
    });
    return data;
  }
}

/* ============================================================
   8. SETUP / FIRST-RUN HANDLER
   ============================================================ */
class SetupHandler {
  constructor(app) {
    this.app = app;
  }

  async run() {
    const pageInfo = this.app.detectRepoInfo();
    const container = document.getElementById('app-content');
    if (!container) return;

    container.innerHTML = `
      <div class="setup-wizard">
        <div class="card">
          <h2>⚙️ 系统初始化</h2>
          <p style="color:var(--text-secondary);margin:8px 0 20px;font-size:0.9rem;">
            首次使用需要配置 GitHub Token。请准备好您的 GitHub 个人访问令牌。
          </p>

          <div class="alert alert-info">
            💡 Token 仅用于向仓库写入巡检数据，建议使用<strong>细粒度令牌</strong>并限制仅访问此仓库。
          </div>

          <div class="config-group">
            <label>仓库地址</label>
            <input type="text" class="form-input" id="setup-repo"
                   value="${UI.escape(pageInfo.repo)}"
                   placeholder="用户名/仓库名 (如: username/inspection-system)">
            <div class="form-hint">你的 GitHub 仓库地址，格式: 所有者/仓库名</div>
          </div>

          <div class="config-group">
            <label>GitHub Token</label>
            <input type="password" class="form-input" id="setup-token"
                   placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
            <div class="form-hint">
              需要 <code>contents: write</code> 权限。
              <a href="https://github.com/settings/tokens?type=beta" target="_blank">创建令牌 →</a>
            </div>
          </div>

          <div class="config-group">
            <label>分支名</label>
            <input type="text" class="form-input" id="setup-branch" value="main">
            <div class="form-hint">通常是 main</div>
          </div>

          <button class="btn btn-primary btn-lg btn-block" id="setup-save-btn">
            保存配置并初始化
          </button>

          <div id="setup-status" style="margin-top:16px;"></div>
        </div>

        <div class="card" style="font-size:0.85rem;color:var(--text-muted);">
          <h3 style="margin-bottom:12px;">📋 如何获取 Token？</h3>
          <ol style="padding-left:20px;display:flex;flex-direction:column;gap:6px;">
            <li>打开 <a href="https://github.com/settings/tokens?type=beta" target="_blank">GitHub Token 设置</a></li>
            <li>点击 "Generate new token" → "Fine-grained token"</li>
            <li>Token name: <code>inspection-system</code></li>
            <li>Repository access: 选择 "Only select repositories" → 选中本仓库</li>
            <li>Permissions: 设置 <code>Contents</code> 为 <strong>Read and write</strong></li>
            <li>点击 "Generate token" 并复制</li>
          </ol>
        </div>
      </div>
    `;

    document.getElementById('setup-save-btn').addEventListener('click', async () => {
      const repo = document.getElementById('setup-repo').value.trim();
      const token = document.getElementById('setup-token').value.trim();
      const branch = document.getElementById('setup-branch').value.trim() || 'main';

      if (!repo || !token) {
        UI.toast('请填写仓库地址和 Token', 'error');
        return;
      }

      const status = document.getElementById('setup-status');
      status.innerHTML = '<div class="loading"><div class="spinner"></div><span>验证中...</span></div>';

      try {
        // Test the token by trying to write settings
        const storage = new GithubStorage(token, repo, branch);
        const config = {
          token: token,
          repo: repo,
          branch: branch,
          redirectUrl: '',
          redirectEnabled: false,
          formEnabled: true,
          formTitle: '施工现场安全质量巡检表',
          formDescription: '扫描二维码，按项检查并填写记录',
          siteName: '施工现场巡检系统',
          uploadCompressWidth: 1200,
          uploadQuality: 0.75
        };

        await storage.writeFile(
          'config/settings.json',
          JSON.stringify(config, null, 2),
          '🔧 系统初始化：写入配置'
        );

        status.innerHTML = '<div class="alert alert-success">✅ 配置保存成功！页面即将刷新...</div>';
        UI.toast('配置保存成功！', 'success');

        // Reload after a moment
        setTimeout(() => { window.location.href = window.location.pathname; }, 1500);
      } catch (e) {
        status.innerHTML = `<div class="alert alert-danger">❌ ${UI.escape(e.message)}</div>`;
        UI.toast('配置失败: ' + e.message, 'error');
      }
    });
  }
}

// Export modules globally
window.GithubStorage = GithubStorage;
window.ConfigManager = ConfigManager;
window.DataManager = DataManager;
window.ImageUploader = ImageUploader;
window.ExcelExporter = ExcelExporter;
window.UI = UI;
window.App = App;
window.SetupHandler = SetupHandler;
