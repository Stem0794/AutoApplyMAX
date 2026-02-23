/**
 * AutoApplyMAX — Application Logger (Content Script)
 *
 * Automatically logs every job application you submit by:
 * 1. Scraping job metadata (title, company, URL) from the page
 * 2. Detecting form submissions and submit-button clicks
 * 3. Saving an entry to chrome.storage.local on submission
 *
 * Uses ATS-specific selectors with cascading fallbacks so it works
 * across LinkedIn, Greenhouse, Lever, Workday, HireHive, and unknown sites.
 */
var AAM = window.AAM || {};

AAM.ApplicationLogger = {
  /** @type {boolean} */
  _listening: false,

  /** Debounce guard — prevent duplicate logs within a short window */
  _lastLoggedUrl: '',
  _lastLoggedTime: 0,

  // ── Initialisation ──────────────────────────────────

  init() {
    if (this._listening) return;
    this._listening = true;

    // 1. Standard form submit (capture phase so SPAs can't swallow it)
    document.addEventListener('submit', this._onFormSubmit.bind(this), true);

    // 2. Click-based submit detection (for SPAs that never fire "submit")
    document.addEventListener('click', this._onButtonClick.bind(this), true);

    // 3. Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === AAM.CONSTANTS.MSG.GET_APPLIED_JOBS) {
        AAM.Storage.getAppliedJobs().then(jobs => sendResponse(jobs));
        return true;
      }
    });

    console.log('[AutoApplyMAX] Application logger active on', window.location.hostname);
  },

  // ── Event Handlers ──────────────────────────────────

  /**
   * Native <form> submit event handler.
   * @param {SubmitEvent} e
   */
  _onFormSubmit(e) {
    // Only log if the form looks like a job application
    if (this._isApplicationForm(e.target)) {
      this._logCurrentApplication('form-submit');
    }
  },

  /**
   * Click handler — catches SPA submit buttons that never fire "submit".
   * We detect clicks on buttons / links whose text matches submit keywords.
   * @param {MouseEvent} e
   */
  _onButtonClick(e) {
    const el = e.target.closest(
      'button, input[type="submit"], a[role="button"], [role="button"], a.btn, a.button'
    );
    if (!el) return;

    const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();

    // Broad set of submit keywords across ATS platforms
    const submitPatterns = [
      /\bsubmit\s*(application|my\s*application)?\b/,
      /\bapply\b/,
      /\bsend\s*application\b/,
      /\bconfirm\s*(and\s*)?(submit|apply)\b/,
      /\bcomplete\s*application\b/,
      /\bfinish\s*(and\s*)?(submit|apply)\b/,
      /\bsubmit\b/,
    ];

    const isSubmit = submitPatterns.some(p => p.test(text));
    if (!isSubmit) return;

    // Also check if the button is within or near a form
    const nearForm = el.closest('form') ||
                     document.querySelector('form') ||
                     el.closest('[class*="application"], [class*="apply"], [id*="application"]');
    if (!nearForm && !this._pageIsApplicationPage()) return;

    // Slight delay to let the SPA process the click
    setTimeout(() => this._logCurrentApplication('button-click'), 300);
  },

  // ── Submission Heuristics ───────────────────────────

  /**
   * Check whether a <form> element looks like a job application form.
   * @param {HTMLFormElement} form
   * @returns {boolean}
   */
  _isApplicationForm(form) {
    if (!form || form.tagName !== 'FORM') return false;
    const formHtml = (form.id + ' ' + form.className + ' ' + (form.getAttribute('action') || '')).toLowerCase();
    const keywords = ['apply', 'application', 'job', 'candidate', 'career', 'submit', 'hire'];
    return keywords.some(k => formHtml.includes(k)) || this._pageIsApplicationPage();
  },

  /**
   * Broad check: is the current page likely a job application page?
   * @returns {boolean}
   */
  _pageIsApplicationPage() {
    const url = window.location.href.toLowerCase();
    const appKeywords = ['/apply', '/application', '/jobs/', '/careers/', '/job/', 'lever.co', 'greenhouse.io', 'myworkdayjobs', 'hirehive'];
    if (appKeywords.some(k => url.includes(k))) return true;

    const title = document.title.toLowerCase();
    const titleKeywords = ['apply', 'application', 'job', 'career'];
    return titleKeywords.some(k => title.includes(k));
  },

  // ── Metadata Scraping ──────────────────────────────

  /**
   * Scrape the job title from the current page.
   * Tries ATS-specific selectors first, then cascading fallbacks.
   * @returns {string}
   */
  scrapeJobTitle() {
    const strategies = [
      // ── LinkedIn ──
      () => this._text('.jobs-unified-top-card__job-title, .t-24.job-details-jobs-unified-top-card__job-title'),
      () => this._text('.job-details-jobs-unified-top-card__job-title'),
      () => this._text('.topcard__title'),
      () => this._text('[data-test-job-title]'),

      // ── Greenhouse ──
      () => this._text('#header .app-title, .job-title'),
      () => this._text('h1.app-title'),

      // ── Lever ──
      () => this._text('.posting-headline h2, .posting-headline .posting-title'),

      // ── Workday ──
      () => this._text('[data-automation-id="jobPostingHeader"] h2'),
      () => this._text('[data-automation-id="jobTitle"]'),
      () => this._text('.css-1q2dra3'),

      // ── HireHive ──
      () => this._text('.job-detail-title, .job-title h1'),

      // ── Generic fallbacks ──
      () => this._metaContent('og:title'),
      () => this._metaContent('twitter:title'),
      () => {
        // Try the first <h1> on the page that looks job-related
        const h1s = document.querySelectorAll('h1');
        for (const h1 of h1s) {
          const t = h1.textContent.trim();
          if (t.length > 3 && t.length < 200) return t;
        }
        return '';
      },
      () => {
        // Fall back to <title> tag, cleaned up
        const raw = document.title || '';
        // Strip common suffixes like " | Company Name" or " - Company"
        return raw.split(/\s*[|\-–—]\s*/)[0].trim();
      },
    ];

    return this._firstNonEmpty(strategies);
  },

  /**
   * Scrape the company name from the current page.
   * @returns {string}
   */
  scrapeCompanyName() {
    const strategies = [
      // ── LinkedIn ──
      () => this._text('.jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name a'),
      () => this._text('.jobs-unified-top-card__company-name'),
      () => this._text('.topcard__org-name-link'),
      () => this._text('[data-test-employer-name]'),

      // ── Greenhouse ──
      () => this._text('.company-name, #header .company-name'),
      () => {
        // Greenhouse often puts company in the meta or subdomain
        const host = window.location.hostname; // e.g. boards.greenhouse.io
        const path = window.location.pathname; // e.g. /companyname/jobs/123
        const parts = path.split('/').filter(Boolean);
        if (host.includes('greenhouse.io') && parts.length > 0) {
          return this._titleCase(parts[0].replace(/[-_]/g, ' '));
        }
        return '';
      },

      // ── Lever ──
      () => this._text('.posting-categories .sort-by-team, [data-qa="posting-name"]'),
      () => {
        // Lever: company in the URL path → jobs.lever.co/companyname
        const host = window.location.hostname;
        const parts = window.location.pathname.split('/').filter(Boolean);
        if (host.includes('lever.co') && parts.length > 0) {
          return this._titleCase(parts[0].replace(/[-_]/g, ' '));
        }
        return '';
      },

      // ── Workday ──
      () => this._text('[data-automation-id="jobPostingHeader"] [data-automation-id="companyName"]'),
      () => {
        // Workday: subdomain is typically the company → companyname.wd5.myworkdayjobs.com
        const host = window.location.hostname;
        if (host.includes('myworkdayjobs.com') || host.includes('workday.com')) {
          const sub = host.split('.')[0];
          if (sub && sub !== 'www') return this._titleCase(sub.replace(/[-_]/g, ' '));
        }
        return '';
      },

      // ── HireHive ──
      () => this._text('.company-name, .employer-name'),

      // ── Generic fallbacks ──
      () => this._metaContent('og:site_name'),
      () => this._metaContent('author'),
      () => {
        // Try extracting from <title> — "Job Title | Company Name" or "Job Title - Company"
        const raw = document.title || '';
        const parts = raw.split(/\s*[|\-–—]\s*/);
        if (parts.length >= 2) {
          // The company is usually the last segment
          return parts[parts.length - 1].trim();
        }
        return '';
      },
      () => {
        // Structured data fallback — JSON-LD
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          try {
            const data = JSON.parse(script.textContent);
            const org = data.hiringOrganization || data.employer;
            if (org) return org.name || org;
            if (data['@type'] === 'Organization' && data.name) return data.name;
          } catch { /* ignore parse errors */ }
        }
        return '';
      },
    ];

    return this._firstNonEmpty(strategies);
  },

  /**
   * Get the canonical job URL.
   * @returns {string}
   */
  scrapeJobUrl() {
    // Prefer a canonical URL
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) return canonical.href;

    // og:url
    const ogUrl = this._metaContent('og:url');
    if (ogUrl) return ogUrl;

    // Current URL, cleaned of tracking params
    const url = new URL(window.location.href);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref', 'fbclid', 'gclid'].forEach(
      p => url.searchParams.delete(p)
    );
    return url.toString();
  },

  /**
   * Detect which ATS platform we're on.
   * @returns {string}
   */
  detectATS() {
    const adapter = AAM.getAdapter();
    return adapter.name || 'Unknown';
  },

  // ── Core Logging Logic ─────────────────────────────

  /**
   * Scrape metadata and log the application.
   * @param {string} trigger - what triggered the log ('form-submit' | 'button-click')
   */
  async _logCurrentApplication(trigger) {
    const url = this.scrapeJobUrl();
    const now = Date.now();

    // Debounce: skip if same URL was logged < 30 s ago
    if (url === this._lastLoggedUrl && (now - this._lastLoggedTime) < 30000) {
      return;
    }

    const entry = {
      jobTitle: this.scrapeJobTitle() || 'Unknown Position',
      company: this.scrapeCompanyName() || 'Unknown Company',
      url: url,
      timestamp: new Date().toISOString(),
      ats: this.detectATS(),
      trigger: trigger,
    };

    try {
      const saved = await AAM.Storage.logAppliedJob(entry);
      if (saved) {
        this._lastLoggedUrl = url;
        this._lastLoggedTime = now;
        console.log(
          `[AutoApplyMAX] Application logged: "${entry.jobTitle}" @ ${entry.company} (${entry.ats})`
        );
      }
    } catch (err) {
      console.warn('[AutoApplyMAX] Failed to log application:', err);
    }
  },

  // ── DOM Helpers ────────────────────────────────────

  /**
   * Return trimmed textContent of the first matching element, or ''.
   * @param {string} selector
   * @returns {string}
   */
  _text(selector) {
    const el = document.querySelector(selector);
    return el ? el.textContent.trim() : '';
  },

  /**
   * Return the content attribute of a <meta> tag.
   * @param {string} name - the property or name attribute
   * @returns {string}
   */
  _metaContent(name) {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return el ? (el.getAttribute('content') || '').trim() : '';
  },

  /**
   * Run a list of strategy functions and return the first non-empty result.
   * @param {Array<() => string>} strategies
   * @returns {string}
   */
  _firstNonEmpty(strategies) {
    for (const fn of strategies) {
      try {
        const val = fn();
        if (val && val.trim()) return val.trim();
      } catch { /* ignore individual strategy errors */ }
    }
    return '';
  },

  /**
   * Convert a slug-like string to Title Case.
   * @param {string} str
   * @returns {string}
   */
  _titleCase(str) {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  },
};

// Start logging as soon as the script loads
AAM.ApplicationLogger.init();

window.AAM = AAM;
