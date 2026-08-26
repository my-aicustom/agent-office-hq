// Iron Director — Verifier & Deterministic Quality Gate
// Enforces hard validation rules without relying on LLM self-grading or subjective guesswork.

import vm from 'vm';

export class VerifierGate {
  /**
   * Validates structured JSON artifact against strict type & boundary rules.
   */
  static validateJson(data, rules = {}) {
    const errors = [];
    if (!data || typeof data !== 'object') {
      return { passed: false, errors: ['Artifact is not a valid JSON object.'] };
    }

    if (rules.requiredFields) {
      for (const field of rules.requiredFields) {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
          errors.push(`Missing required field: '${field}'`);
        }
      }
    }

    if (rules.stringLengths) {
      for (const [field, { min, max }] of Object.entries(rules.stringLengths)) {
        const val = data[field];
        if (typeof val === 'string') {
          if (min && val.length < min) errors.push(`Field '${field}' too short (min ${min} chars).`);
          if (max && val.length > max) errors.push(`Field '${field}' too long (max ${max} chars).`);
        }
      }
    }

    if (rules.arrayBounds) {
      for (const [field, { min, max }] of Object.entries(rules.arrayBounds)) {
        const val = data[field];
        if (Array.isArray(val)) {
          if (min && val.length < min) errors.push(`Array '${field}' must have at least ${min} items.`);
          if (max && val.length > max) errors.push(`Array '${field}' must have at most ${max} items.`);
        } else if (val !== undefined) {
          errors.push(`Field '${field}' must be an Array.`);
        }
      }
    }

    return {
      passed: errors.length === 0,
      errors
    };
  }

  /**
   * Validates Markdown content structure (word count, headings, disallowed tags).
   */
  static validateMarkdown(markdown, { minWords = 250, requiredHeadings = 2 } = {}) {
    const errors = [];
    if (typeof markdown !== 'string' || !markdown.trim()) {
      return { passed: false, errors: ['Markdown content is empty or invalid.'] };
    }

    const wordCount = markdown.trim().split(/\s+/).length;
    if (wordCount < minWords) {
      errors.push(`Word count too low: got ${wordCount} words, minimum is ${minWords}.`);
    }

    const h2Count = (markdown.match(/^##\s+.+$/gm) || []).length;
    if (h2Count < requiredHeadings) {
      errors.push(`Not enough H2 sections: found ${h2Count}, required at least ${requiredHeadings}.`);
    }

    // Check for banned raw template artifacts
    if (/\{\{\s*[\w.]+\s*\}\}/.test(markdown)) {
      errors.push('Found unparsed template placeholder (e.g. {{variable}}).');
    }

    return {
      passed: errors.length === 0,
      errors,
      stats: { wordCount, h2Count }
    };
  }

  /**
   * Validates JavaScript/ES module code syntax using Node VM compiler.
   */
  static validateJsSyntax(code) {
    if (typeof code !== 'string' || !code.trim()) {
      return { passed: false, errors: ['Code string is empty.'] };
    }

    try {
      // Strip module import/export declarations for isolated script compilation
      const sanitized = code
        .replace(/^\s*import\s+.*?;?\s*$/gm, '')
        .replace(/^\s*export\s+(?:default\s+)?/gm, '');
      new vm.Script(sanitized);
      return { passed: true, errors: [] };
    } catch (err) {
      return {
        passed: false,
        errors: [`JavaScript Syntax Error: ${err.message}`]
      };
    }
  }

  /**
   * Full comprehensive pipeline check.
   */
  static verifyArtifact(artifact, { type = 'json', rules = {} } = {}) {
    if (type === 'json') {
      return this.validateJson(artifact, rules);
    }
    if (type === 'markdown') {
      return this.validateMarkdown(artifact, rules);
    }
    if (type === 'code') {
      return this.validateJsSyntax(artifact);
    }
    return { passed: true, errors: [] };
  }
}
