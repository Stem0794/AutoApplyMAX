/**
 * AutoApplyMAX — shared constants
 */
var AAM = globalThis.AAM || {};

AAM.CONSTANTS = {
  // Storage keys
  STORAGE_PROFILE: 'aam_user_profile',
  STORAGE_MAPPINGS: 'aam_field_mappings',
  STORAGE_SETTINGS: 'aam_settings',
  STORAGE_APPLIED_JOBS: 'aam_applied_jobs',
  STORAGE_SCHEMA_VERSION: 'aam_schema_version',
  STORAGE_COMMUNITY_SESSION: 'aam_community_session',
  STORAGE_INSTALLATION_ID: 'aam_installation_id',
  SCHEMA_VERSION: 2,
  MAX_HISTORY_ENTRIES: 1000,
  HISTORY_PAGE_SIZE: 50,
  MAX_IMPORT_BYTES: 1024 * 1024,
  MAX_RESUME_BYTES: 5 * 1024 * 1024,

  // Highlight colour for autofilled fields
  HIGHLIGHT_COLOR: '#d4edda',
  HIGHLIGHT_BORDER: '#28a745',

  // Manual-fill tracking colour
  MANUAL_HIGHLIGHT: '#fff3cd',

  // Overlay z-index
  OVERLAY_Z: 2147483647,

  // Confidence thresholds for heuristic matching
  CONFIDENCE_HIGH: 0.8,
  CONFIDENCE_MEDIUM: 0.5,
  CONFIDENCE_LOW: 0.3,

  // Supported ATS hostnames
  ATS_HOSTS: {
    LINKEDIN: ['linkedin.com', 'www.linkedin.com'],
    GREENHOUSE: ['boards.greenhouse.io', 'jobs.greenhouse.io'],
    LEVER: ['jobs.lever.co'],
    WORKDAY: ['myworkdayjobs.com', 'workday.com'],
    HIREHIVE: ['hirehive.com'],
    ZOHO: ['zohorecruit.com', 'zohorecruit.eu'],
    REVOLUT: ['revolut.com'],
    WORKABLE: ['workable.com'],
    MAINDER: ['mainder.ai'],
  },

  // Set at build/release time. Clients only call authenticated Edge Functions.
  COMMUNITY_API_URL:
    typeof AAM_COMMUNITY_API_URL !== 'undefined' ? AAM_COMMUNITY_API_URL : '',
  COMMUNITY_PUBLISHABLE_KEY:
    typeof AAM_COMMUNITY_PUBLISHABLE_KEY !== 'undefined'
      ? AAM_COMMUNITY_PUBLISHABLE_KEY
      : '',

  // Message types for background ↔ content communication
  MSG: {
    TRIGGER_AUTOFILL: 'aam:trigger_autofill',
    AUTOFILL_RESULT: 'aam:autofill_result',
    GET_PROFILE: 'aam:get_profile',
    SAVE_MAPPING: 'aam:save_mapping',
    GET_MAPPINGS: 'aam:get_mappings',
    PROFILE_UPDATED: 'aam:profile_updated',
    LOG_APPLICATION: 'aam:log_application',
    GET_APPLIED_JOBS: 'aam:get_applied_jobs',
    AUTOFILL_COMPLETED: 'aam:autofill_completed',
    PAGE_INFO: 'aam:page_info',
    STORAGE_OPERATION: 'aam:storage_operation',
    DOWNLOAD_RESUME: 'aam:download_resume',
    SAVE_RESUME: 'aam:save_resume',
    SUBMIT_MAPPINGS: 'aam:submit_mappings',
  },
};

AAM.isExactOrSubdomain = function (hostname, allowedHost, allowSubdomains = true) {
  const host = String(hostname || '').toLowerCase();
  const allowed = String(allowedHost || '').toLowerCase();
  return host === allowed || (allowSubdomains && host.endsWith('.' + allowed));
};

AAM.getSupportedATS = function (urlValue) {
  let url;
  try {
    url = urlValue instanceof URL ? urlValue : new URL(urlValue);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  const checks = [
    ['LINKEDIN', ['linkedin.com']],
    ['GREENHOUSE', ['boards.greenhouse.io', 'jobs.greenhouse.io']],
    ['LEVER', ['jobs.lever.co']],
    ['WORKDAY', ['myworkdayjobs.com', 'workday.com']],
    ['HIREHIVE', ['hirehive.com']],
    ['ZOHO', ['zohorecruit.com', 'zohorecruit.eu']],
    ['WORKABLE', ['apply.workable.com']],
    ['MAINDER', ['mainder.ai']],
  ];

  for (const [name, hosts] of checks) {
    if (hosts.some(allowed => AAM.isExactOrSubdomain(host, allowed))) return name;
  }
  if (host === 'www.revolut.com' && url.pathname.startsWith('/careers/apply/')) {
    return 'REVOLUT';
  }
  return null;
};

globalThis.AAM = AAM;
