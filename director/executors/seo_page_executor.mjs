// Iron Director — Real SEO Page & Git/PR Executor (Rule 11 Integrity Guard)
// Generates production-grade Markdown/Astro content, validates schemas deterministically,
// produces verified artifact hashes, and executes real Git branching/commits when enabled.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'node:child_process';
import { VerifierGate } from '../verifier_gate.mjs';

export class SeoPageExecutor {
  constructor({
    contentOutputDir = null,
    repoPath = null,
    gitConfig = {
      userName: 'Ddos-spec',
      userEmail: 'setgraph69@gmail.com'
    },
    enableGit = false,
    verifier = new VerifierGate(),
    execFn = null
  } = {}) {
    this.outputDir = contentOutputDir || path.resolve('data/seo-drafts');
    this.repoPath = repoPath || path.resolve('.');
    this.gitConfig = gitConfig;
    this.enableGit = enableGit;
    this.verifier = verifier;
    this.execFn = execFn || this._defaultExec.bind(this);

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  _defaultExec(cmd, args, options = {}) {
    return execFileSync(cmd, args, {
      cwd: this.repoPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    }).trim();
  }

  /**
   * Generates slug from keyword.
   */
  static slugify(keyword) {
    return keyword
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Executes SEO Page generation, schema validation, artifact hash calculation,
   * and optional real Git branch, commit, and PR creation.
   */
  async execute({
    keyword,
    intent = 'commercial',
    cluster = 'stainless',
    targetUrl = null,
    gscEvidence = null,
    git = {}
  } = {}) {
    if (!keyword || typeof keyword !== 'string') {
      throw new Error("SeoPageExecutor: Field 'keyword' is required.");
    }

    const shouldCommit = git.commit ?? this.enableGit;
    const shouldPush = git.push ?? false;
    const shouldCreatePr = git.createPr ?? false;

    const slug = SeoPageExecutor.slugify(keyword);
    const canonicalUrl = targetUrl || `https://tepatlaser.com/blog/${slug}`;
    const dateStr = new Date().toISOString().split('T')[0];

    // 1. Generate Schema.org JSON-LD
    const jsonLdSchema = {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: `Jasa Laser Cutting ${keyword.toUpperCase()} - TepatLaser`,
      provider: {
        '@type': 'LocalBusiness',
        name: 'TepatLaser Jakarta',
        url: 'https://tepatlaser.com',
        telephone: '+628123456789',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Tangerang',
          addressRegion: 'Banten',
          addressCountry: 'ID'
        }
      },
      serviceType: 'Laser Cutting Metal & Non-Metal',
      areaServed: 'Jabodetabek & Seluruh Indonesia',
      offers: {
        '@type': 'Offer',
        priceCurrency: 'IDR',
        price: '50000',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          unitText: 'per meter'
        }
      }
    };

    // 2. Generate Production-Grade Markdown Body
    const markdownContent = `---
title: "Jasa Laser Cutting ${keyword.toUpperCase()} Presisi Tinggi & Cepat"
description: "Layanan jasa laser cutting ${keyword} profesional di Jabodetabek. Hasil potong presisi CNC Fiber Laser, pengerjaan cepat, harga kompetitif."
pubDate: "${dateStr}"
heroImage: "/images/blog/${slug}.webp"
canonicalUrl: "${canonicalUrl}"
category: "Laser Cutting"
tags: ["${cluster}", "laser cutting", "presisi", "bengkel laser"]
---

# Jasa Laser Cutting ${keyword.toUpperCase()} Presisi Tinggi

Apakah Anda sedang membutuhkan **jasa laser cutting ${keyword}** dengan hasil potongan yang rapi, akurat, dan waktu pengerjaan yang cepat? **TepatLaser** hadir dengan teknologi mesin Fiber Laser CNC modern berdaya tinggi yang siap memproses berbagai kebutuhan industri, arsitektur, hingga interior kustom Anda.

## Keunggulan Laser Cutting di TepatLaser

1. **Presisi Sub-Milimeter (±0.05mm)**: Sudut potong tajam dan minim *burr* / kerak.
2. **Kapasitas Produksi Skala Besar**: Didukung beberapa mesin Fiber Laser 12kW ready 24/7.
3. **Pilihan Material Lengkap**: Stainless Steel (SUS 201, 304, 316), Plat Besi (SPHC, SS400), Aluminium, hingga Akrilik dan MDF.
4. **Gratis Konsultasi File CAD/DXF**: Tim engineering kami siap memeriksa gambar kerja Anda agar efisien dan hemat bahan (*nesting optimization*).

## Tabel Spesifikasi & Kapasitas Material

| Jenis Material | Ketebalan Minimum | Ketebalan Maksimum | Toleransi Potong |
| :--- | :--- | :--- | :--- |
| **Stainless Steel** | 0.5 mm | 20.0 mm | ±0.05 mm |
| **Plat Besi (Mild Steel)** | 0.8 mm | 25.0 mm | ±0.08 mm |
| **Aluminium** | 0.8 mm | 16.0 mm | ±0.10 mm |
| **Kuningan / Tembaga** | 0.5 mm | 10.0 mm | ±0.05 mm |

## Pertanyaan yang Sering Diajukan (FAQ)

### Berapa biaya jasa laser cutting ${keyword}?
Biaya dihitung berdasarkan jenis material, ketebalan plat, dan panjang jalur potong (*cutting length*). Hubungi sales engineer kami via WhatsApp untuk penawaran instan dalam hitungan menit.

### Apakah bisa membawa material sendiri?
Bisa. Anda bisa membawa plat sendiri atau memesan material langsung dari stok gudang kami yang terjamin standarisasinya.

## Hubungi Tim Engineering TepatLaser Sekarang
Dapatkan potongan harga khusus untuk pemesanan proyek skala pabrikasi atau pesanan berulang. Konsultasikan gambar kerja Anda hari ini juga!
`;

    // 3. Deterministic Validation Gate (Markdown + Canonical + Schema)
    const mdValidation = VerifierGate.validateMarkdown(markdownContent, { minWords: 150, requiredHeadings: 2 });
    if (!mdValidation.passed) {
      throw new Error(`SeoPageExecutor: Generated markdown failed quality gate: ${mdValidation.errors.join(', ')}`);
    }

    const schemaValidation = VerifierGate.validateJson(jsonLdSchema, { requiredFields: ['@context', '@type', 'name'] });
    if (!schemaValidation.passed) {
      throw new Error(`SeoPageExecutor: Generated schema failed quality gate: ${schemaValidation.errors.join(', ')}`);
    }

    // 4. Calculate Artifact Hash (SHA-256)
    const artifactHash = crypto.createHash('sha256').update(markdownContent, 'utf8').digest('hex');

    // 5. Write to Drafts Folder
    const filename = `${slug}.md`;
    const filePath = path.join(this.outputDir, filename);
    fs.writeFileSync(filePath, markdownContent, 'utf8');

    const branchName = `seo/optimize-${slug}`;
    const commitMessage = `feat(seo): generate optimized landing draft for keyword '${keyword}' [hash:${artifactHash.slice(0, 8)}]`;

    // 6. Real Git Operations (Executed only when enabled)
    let gitResult = {
      committed: false,
      branchCreated: false,
      branchName,
      commitMessage,
      commitSha: null,
      pushed: false,
      prUrl: null,
      reason: shouldCommit ? 'Git execution failed' : 'Draft mode: Git commit not requested'
    };

    if (shouldCommit) {
      let originalBranch = null;
      try {
        originalBranch = this.execFn('git', ['rev-parse', '--abbrev-ref', 'HEAD']);

        // Isolate the change on its own branch instead of committing on whatever
        // branch the caller's working tree currently has checked out.
        this.execFn('git', ['checkout', '-B', branchName]);
        gitResult.branchCreated = true;

        const relativeFilePath = path.relative(this.repoPath, filePath);
        this.execFn('git', ['add', relativeFilePath]);
        this.execFn('git', [
          '-c', `user.name=${this.gitConfig.userName}`,
          '-c', `user.email=${this.gitConfig.userEmail}`,
          'commit',
          '-m', commitMessage
        ]);

        // Retrieve real commit SHA. Past this point a real commit exists on
        // branchName, so nothing below is allowed to report committed:false.
        const commitSha = this.execFn('git', ['rev-parse', 'HEAD']);
        gitResult = {
          ...gitResult,
          committed: true,
          commitSha,
          reason: 'Git commit executed successfully'
        };

        if (shouldPush) {
          try {
            this.execFn('git', ['push', '-u', 'origin', branchName]);
            gitResult.pushed = true;
          } catch (pushErr) {
            gitResult.error = pushErr.message;
            gitResult.reason = `Commit succeeded but push failed: ${pushErr.message}`;
          }
        }

        if (shouldCreatePr) {
          if (!gitResult.pushed) {
            gitResult.reason = gitResult.error
              ? gitResult.reason
              : 'Commit succeeded but PR was not created because push was not requested or did not complete';
          } else {
            try {
              gitResult.prUrl = this.execFn('gh', [
                'pr', 'create',
                '--title', `feat(seo): ${keyword} landing article`,
                '--body', `Automated SEO Landing draft for keyword \`${keyword}\`.\nArtifact SHA-256: \`${artifactHash}\`\nValidated by VerifierGate.`,
                '--head', branchName,
                '--base', originalBranch
              ]);
            } catch (prErr) {
              gitResult.error = prErr.message;
              gitResult.reason = `Commit and push succeeded but PR creation failed: ${prErr.message}`;
            }
          }
        }
      } catch (gitErr) {
        // Only reachable if branch creation, staging, or the commit itself
        // failed — i.e. committed is still accurately false here.
        gitResult = {
          committed: false,
          branchCreated: gitResult.branchCreated,
          branchName,
          commitMessage,
          commitSha: null,
          pushed: false,
          prUrl: null,
          error: gitErr.message,
          reason: `Git operation failed: ${gitErr.message}`
        };
      } finally {
        // Best-effort restore so this executor never leaves the caller's
        // working tree switched to a generated feature branch.
        if (originalBranch) {
          try {
            this.execFn('git', ['checkout', originalBranch]);
          } catch {
            // If restoring fails, the repo stays on branchName; the caller
            // still has an accurate gitResult to act on.
          }
        }
      }
    }

    return {
      action: 'SEO_PAGE_GENERATED',
      keyword,
      slug,
      canonicalUrl,
      filePath,
      artifactHash,
      wordCount: markdownContent.split(/\s+/).length,
      schemaValid: true,
      git: gitResult,
      evidence: {
        gscMetrics: gscEvidence || { status: 'OPTIMIZATION_TARGET' },
        generatedAt: new Date().toISOString(),
        qualityGatePassed: true
      }
    };
  }
}
