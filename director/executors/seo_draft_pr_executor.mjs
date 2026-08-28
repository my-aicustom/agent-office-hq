import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export class SeoDraftPrExecutor {
  constructor({
    repositoryUrl = process.env.SEO_TARGET_REPOSITORY,
    repositorySlug = process.env.SEO_TARGET_REPOSITORY_SLUG,
    baseBranch = process.env.SEO_TARGET_BASE_BRANCH || 'main',
    contentDir = process.env.SEO_TARGET_CONTENT_DIR || 'src/content/blog',
    workRoot = process.env.SEO_TARGET_WORK_ROOT || path.resolve('data/executor-workspaces'),
    sshKeyPath = process.env.SEO_TARGET_SSH_KEY_PATH,
    knownHostsPath = process.env.SEO_TARGET_KNOWN_HOSTS_PATH,
    sshHost = process.env.SEO_TARGET_SSH_HOST || 'github.com',
    sshPort = Number(process.env.SEO_TARGET_SSH_PORT || 22),
    fetchFn = globalThis.fetch,
    execFn = null,
    pollIntervalMs = 10_000,
    pollTimeoutMs = 600_000
  } = {}) {
    this.repositoryUrl = repositoryUrl;
    this.repositorySlug = repositorySlug;
    this.baseBranch = baseBranch;
    this.contentDir = contentDir.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    this.workRoot = path.resolve(workRoot);
    this.sshKeyPath = sshKeyPath;
    this.knownHostsPath = knownHostsPath;
    this.sshHost = sshHost;
    this.sshPort = sshPort;
    this.fetchFn = fetchFn;
    this.execFn = execFn || this._exec.bind(this);
    this.pollIntervalMs = pollIntervalMs;
    this.pollTimeoutMs = pollTimeoutMs;
  }

  _assertConfigured() {
    const missing = [];
    for (const [name, value] of Object.entries({
      SEO_TARGET_REPOSITORY: this.repositoryUrl,
      SEO_TARGET_REPOSITORY_SLUG: this.repositorySlug,
      SEO_TARGET_SSH_KEY_PATH: this.sshKeyPath,
      SEO_TARGET_KNOWN_HOSTS_PATH: this.knownHostsPath
    })) {
      if (!value) missing.push(name);
    }
    if (missing.length) throw new Error(`SEO Draft PR executor is not configured: ${missing.join(', ')}`);
    if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(this.repositorySlug)) throw new Error('Invalid SEO target repository slug.');
    if (!/^[a-z0-9._/-]+$/i.test(this.baseBranch) || this.baseBranch.includes('..')) throw new Error('Invalid SEO target base branch.');
    if (this.contentDir !== 'src/content/blog') throw new Error('SEO executor content boundary must be src/content/blog.');
    if (!['github.com', 'ssh.github.com'].includes(this.sshHost) || ![22, 443].includes(this.sshPort)) throw new Error('Invalid SEO target SSH endpoint.');
    if (!fs.existsSync(this.sshKeyPath) || !fs.existsSync(this.knownHostsPath)) throw new Error('SEO target SSH material is unavailable.');
  }

  _gitEnvironment() {
    const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
    const hostAlias = this.sshHost === 'ssh.github.com' ? 'ssh.github.com' : 'github.com';
    return {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_SSH_COMMAND: `ssh -p ${this.sshPort} -o HostName=${this.sshHost} -o HostKeyAlias=${hostAlias} -i ${quote(this.sshKeyPath)} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${quote(this.knownHostsPath)}`
    };
  }

  _exec(command, args, options = {}) {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    }).trim();
  }

  static slugify(value) {
    return String(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
  }

  static safeKeyword(value) {
    const keyword = String(value || '').normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim();
    if (keyword.length < 8 || keyword.length > 120) throw new Error('SEO keyword must contain 8-120 safe characters.');
    return keyword;
  }

  static renderArticle({ keyword, intent, cluster, publishDate }) {
    const titleKeyword = keyword.replace(/\b\p{L}/gu, letter => letter.toUpperCase());
    return `---
title: "${titleKeyword}: Checklist Praktis Sebelum Produksi"
description: "Panduan memeriksa file, material, ukuran, toleransi, dan hasil akhir untuk kebutuhan ${keyword} sebelum pekerjaan masuk produksi."
excerpt: "Checklist netral untuk menyamakan spesifikasi ${keyword} antara pemesan, desainer, dan tim produksi."
category: "Panduan Produksi"
readTime: "6 menit"
publishDate: "${publishDate}"
image: "/gambar/pagar-laser-cutting-landing/fasad-gedung-laser-cutting.webp"
imageAlt: "Contoh panel hasil proses laser cutting untuk pemeriksaan kualitas"
keywords: "${keyword}, checklist laser cutting, inspeksi hasil cutting, persiapan file produksi"
primaryKeyword: "${keyword}"
author: "Tim Tepat Laser"
keyTakeaways:
  - "Kunci ukuran, material, ketebalan, dan toleransi sebelum produksi dimulai."
  - "Periksa file desain dan satuan ukur agar interpretasi tidak berbeda."
  - "Gunakan sampel atau kriteria penerimaan yang disepakati untuk pemeriksaan akhir."
relatedLinks:
  - title: "Panduan menyiapkan file desain"
    url: "/blog/panduan-file-desain-laser-cutting-akurat/"
  - title: "Hal yang disiapkan sebelum order"
    url: "/blog/hal-disiapkan-sebelum-order-laser-cutting/"
faq:
  - question: "Apa yang paling dulu dikunci sebelum produksi?"
    answer: "Pastikan material, ketebalan, dimensi, jumlah, satuan ukur, dan versi file sudah tertulis dalam satu spesifikasi yang disepakati."
  - question: "Mengapa toleransi harus ditulis?"
    answer: "Karena istilah presisi dapat ditafsirkan berbeda. Nilai toleransi harus mengikuti fungsi komponen dan kemampuan proses yang sudah dikonfirmasi."
---

## ${titleKeyword}: Checklist Praktis

Permintaan **${keyword}** sebaiknya tidak langsung diterjemahkan menjadi pekerjaan mesin. Tahap terpenting justru menyamakan definisi hasil yang diterima: bentuk, ukuran, material, jumlah, kondisi tepi, dan proses lanjutan. Panduan ini bersifat prosedural; kemampuan aktual tetap harus dikonfirmasi berdasarkan material, file, dan mesin yang dipakai untuk pesanan.

## 1. Kunci kebutuhan dan fungsi komponen

Tuliskan fungsi setiap bagian, lokasi pemasangan, jumlah, serta bagian yang berpasangan dengan komponen lain. Informasi fungsi membantu tim menentukan titik ukur dan area yang paling kritis. Hindari istilah umum seperti “harus presisi” tanpa angka atau metode pemeriksaan yang disepakati.

## 2. Periksa material dan ketebalan

Nama material saja belum cukup. Catat jenis material, ketebalan nominal, kondisi permukaan, arah serat bila relevan, dan apakah material disediakan pemesan atau penyedia jasa. Jangan menganggap kemampuan potong sama untuk seluruh bahan; konfirmasi dilakukan sebelum penjadwalan produksi.

## 3. Validasi file desain

Gunakan satu file sumber yang sudah disetujui. Periksa satuan ukur, skala, garis ganda, kontur terbuka, teks yang belum dikonversi, serta versi revisi. Beri nama revisi yang jelas agar file lama tidak masuk antrean produksi secara tidak sengaja.

## 4. Sepakati toleransi dan titik ukur

Toleransi harus mengikuti fungsi komponen, bukan angka pemasaran. Tentukan dimensi mana yang kritis, alat ukur yang digunakan, dan bagaimana hasil dicatat. Untuk pekerjaan rakitan, periksa juga celah, posisi lubang, serta hubungan antarbagian.

## 5. Tentukan kriteria hasil akhir

Sepakati apakah hasil diterima apa adanya dari proses cutting atau membutuhkan deburring, pembersihan, bending, finishing, maupun perlindungan permukaan. Foto referensi boleh dipakai sebagai bahasa visual, tetapi tidak menggantikan spesifikasi tertulis.

## Checklist serah terima

- Cocokkan jumlah dan label komponen dengan daftar produksi.
- Periksa dimensi kritis menggunakan metode ukur yang disepakati.
- Periksa kontur, lubang, tepi, dan permukaan pada pencahayaan yang memadai.
- Pisahkan temuan kosmetik dari ketidaksesuaian fungsi.
- Catat hasil pemeriksaan dan keputusan penerimaan per revisi.

## Kesimpulan

Proses ${keyword} yang terkendali dimulai dari spesifikasi yang dapat diperiksa. Checklist membuat keputusan lebih objektif, mengurangi salah versi, dan memberi jejak yang jelas ketika ada revisi. Untuk keputusan teknis, kirimkan file dan kebutuhan fungsi agar kemampuan proses dapat dikonfirmasi sebelum produksi.

<!-- executor-metadata intent:${intent} cluster:${cluster} -->
`;
  }

  async _waitForDraftPr({ branchName, commitSha, targetPath }) {
    const [owner] = this.repositorySlug.split('/');
    const deadline = Date.now() + this.pollTimeoutMs;
    while (Date.now() < deadline) {
      const listUrl = `https://api.github.com/repos/${this.repositorySlug}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branchName}`)}`;
      const response = await this.fetchFn(listUrl, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'agent-office-hq-seo-executor' } });
      if (!response.ok) throw new Error(`GitHub PR lookup failed with HTTP ${response.status}.`);
      const pulls = await response.json();
      const pr = pulls[0];
      if (pr) {
        if (pr.draft !== true) throw new Error('SEO executor refuses a non-draft pull request.');
        if (pr.head?.sha !== commitSha || pr.base?.ref !== this.baseBranch) throw new Error('Draft PR SHA or base branch does not match executor evidence.');
        const filesResponse = await this.fetchFn(pr.url + '/files', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'agent-office-hq-seo-executor' } });
        if (!filesResponse.ok) throw new Error(`GitHub PR file lookup failed with HTTP ${filesResponse.status}.`);
        const files = await filesResponse.json();
        if (files.length !== 1 || files[0]?.filename !== targetPath) throw new Error('Draft PR changed files outside the SEO content boundary.');
        return { number: pr.number, url: pr.html_url, draft: true };
      }
      await sleep(this.pollIntervalMs);
    }
    throw new Error(`Timed out waiting for Draft PR for ${branchName}.`);
  }

  async execute({ taskId, keyword, intent = 'informational', cluster = 'laser-cutting' } = {}) {
    this._assertConfigured();
    if (!taskId) throw new Error('SEO Draft PR executor requires taskId.');
    const safeKeyword = SeoDraftPrExecutor.safeKeyword(keyword);
    const slug = SeoDraftPrExecutor.slugify(safeKeyword);
    if (!slug) throw new Error('SEO keyword did not produce a valid slug.');
    const taskSlug = SeoDraftPrExecutor.slugify(taskId).slice(-36);
    const branchName = `seo/agent/${taskSlug}-${slug}`.slice(0, 120);
    const workspace = path.resolve(this.workRoot, `${taskSlug}-${crypto.randomUUID()}`);
    if (!workspace.startsWith(this.workRoot + path.sep)) throw new Error('Unsafe SEO executor workspace path.');
    fs.mkdirSync(this.workRoot, { recursive: true });

    try {
      this.execFn('git', ['clone', '--single-branch', '--branch', this.baseBranch, this.repositoryUrl, workspace], {
        cwd: this.workRoot,
        env: this._gitEnvironment()
      });
      this.execFn('git', ['checkout', '-b', branchName], { cwd: workspace, env: this._gitEnvironment() });

      const targetPath = `${this.contentDir}/${slug}.md`;
      const absoluteTarget = path.resolve(workspace, ...targetPath.split('/'));
      const allowedRoot = path.resolve(workspace, ...this.contentDir.split('/'));
      if (!absoluteTarget.startsWith(allowedRoot + path.sep)) throw new Error('SEO artifact escaped the content boundary.');
      if (fs.existsSync(absoluteTarget)) throw new Error(`SEO target already exists: ${targetPath}`);

      const existing = fs.readdirSync(allowedRoot).filter(name => /\.mdx?$/i.test(name));
      for (const name of existing) {
        const body = fs.readFileSync(path.join(allowedRoot, name), 'utf8');
        if (new RegExp(`^primaryKeyword:\\s*["']?${safeKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\s*$`, 'im').test(body)) {
          throw new Error(`Primary keyword already exists in ${name}.`);
        }
      }

      const article = SeoDraftPrExecutor.renderArticle({
        keyword: safeKeyword,
        intent: SeoDraftPrExecutor.slugify(intent) || 'informational',
        cluster: SeoDraftPrExecutor.slugify(cluster) || 'laser-cutting',
        publishDate: new Date().toISOString().slice(0, 10)
      });
      fs.writeFileSync(absoluteTarget, article, 'utf8');
      const artifactHash = crypto.createHash('sha256').update(article).digest('hex');

      this.execFn('git', ['add', '--', targetPath], { cwd: workspace, env: this._gitEnvironment() });
      const staged = this.execFn('git', ['diff', '--cached', '--name-only'], { cwd: workspace, env: this._gitEnvironment() }).split(/\r?\n/).filter(Boolean);
      if (staged.length !== 1 || staged[0].replaceAll('\\', '/') !== targetPath) throw new Error('SEO executor staged a file outside the allowlist.');
      this.execFn('git', ['-c', 'user.name=Ddos-spec', '-c', 'user.email=setgraph69@gmail.com', 'commit', '-m', `seo: draft ${safeKeyword}`], { cwd: workspace, env: this._gitEnvironment() });
      const commitSha = this.execFn('git', ['rev-parse', 'HEAD'], { cwd: workspace, env: this._gitEnvironment() });
      this.execFn('git', ['push', '--set-upstream', 'origin', branchName], { cwd: workspace, env: this._gitEnvironment() });

      const pr = await this._waitForDraftPr({ branchName, commitSha, targetPath });
      return {
        action: 'SEO_DRAFT_PR_CREATED',
        keyword: safeKeyword,
        targetPath,
        artifactHash,
        branchName,
        commitSha,
        pullRequest: pr
      };
    } finally {
      if (fs.existsSync(workspace) && workspace.startsWith(this.workRoot + path.sep)) fs.rmSync(workspace, { recursive: true, force: true });
    }
  }
}
