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
  STORAGE_USER_SESSION: 'aam_user_session',
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
    ASHBY: ['ashbyhq.com', 'jobs.ashbyhq.com'],
    SMARTRECRUITERS: ['smartrecruiters.com'],
    ICIMS: ['icims.com'],
    SUCCESSFACTORS: ['successfactors.com', 'successfactors.eu'],
    TALEO: ['taleo.net'],
    RECRUITEE: ['recruitee.com'],
    TEAMTAILOR: ['teamtailor.com'],
    JAZZHR: ['applytojob.com'],
    BREEZY: ['breezy.hr'],
    JOBVITE: ['jobvite.com'],
    BAMBOOHR: ['bamboohr.com'],
    JOBFLUENT: ['www.jobfluent.com'],
    BIZNEO: ['careers.ats.bizneo.cloud'],
  },

  COMMUNITY_API_URL:
    typeof AAM_COMMUNITY_API_URL !== 'undefined'
      ? AAM_COMMUNITY_API_URL
      : 'https://arsfogdvglyiwqiujnof.supabase.co',
  COMMUNITY_PUBLISHABLE_KEY:
    typeof AAM_COMMUNITY_PUBLISHABLE_KEY !== 'undefined'
      ? AAM_COMMUNITY_PUBLISHABLE_KEY
      : 'sb_publishable_gzQYp8xDiox-yyusd67EEQ_MN5D8y3M',

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
    REPORT_DRIFT: 'aam:report_drift',
    REQUEST_FIELD: 'aam:request_field',
    SEND_MAGIC_LINK: 'aam:send_magic_link',
    VERIFY_OTP: 'aam:verify_otp',
    SIGN_IN: 'aam:sign_in',
    SIGN_OUT: 'aam:sign_out',
    GET_AUTH_STATE: 'aam:get_auth_state',
    ADMIN_LIST_REQUESTS: 'aam:admin_list_requests',
    ADMIN_SET_REQUEST_STATUS: 'aam:admin_set_request_status',
    ADMIN_LIST_PENDING_MAPPINGS: 'aam:admin_list_pending_mappings',
    ADMIN_REVIEW_MAPPING: 'aam:admin_review_mapping',
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
    ['ASHBY', ['ashbyhq.com']],
    ['SMARTRECRUITERS', ['smartrecruiters.com']],
    ['ICIMS', ['icims.com']],
    ['SUCCESSFACTORS', ['successfactors.com', 'successfactors.eu']],
    ['TALEO', ['taleo.net']],
    ['RECRUITEE', ['recruitee.com']],
    ['TEAMTAILOR', ['teamtailor.com']],
    ['JAZZHR', ['applytojob.com']],
    ['BREEZY', ['breezy.hr']],
    ['JOBVITE', ['jobvite.com']],
    ['BAMBOOHR', ['bamboohr.com']],
  ];

  for (const [name, hosts] of checks) {
    if (hosts.some(allowed => AAM.isExactOrSubdomain(host, allowed))) return name;
  }
  if (host === 'www.jobfluent.com' && url.pathname.startsWith('/jobs/')) {
    return 'JOBFLUENT';
  }
  if (
    AAM.isExactOrSubdomain(host, 'careers.ats.bizneo.cloud') &&
    url.pathname.startsWith('/jobs/')
  ) {
    return 'BIZNEO';
  }
  if (host === 'www.revolut.com' && url.pathname.startsWith('/careers/apply/')) {
    return 'REVOLUT';
  }
  return null;
};

/**
 * Catalog of platforms AutoApplyMAX has an adapter for, in display order.
 * `key` matches an ATS_HOSTS entry; `hosts` are user-facing domain hints.
 * Live vs. adapter-ready status is derived at render time from the manifest's
 * content_scripts matches (see the options-page Platforms tab), so this list
 * stays the single source of truth for names and domains.
 */
AAM.SUPPORTED_PLATFORMS = [
  { key: 'LINKEDIN', name: 'LinkedIn (Easy Apply)', hosts: ['linkedin.com'] },
  { key: 'GREENHOUSE', name: 'Greenhouse', hosts: ['boards.greenhouse.io', 'jobs.greenhouse.io'] },
  { key: 'LEVER', name: 'Lever', hosts: ['jobs.lever.co'] },
  { key: 'WORKDAY', name: 'Workday', hosts: ['myworkdayjobs.com', 'workday.com'] },
  { key: 'HIREHIVE', name: 'HireHive', hosts: ['hirehive.com'] },
  { key: 'ZOHO', name: 'Zoho Recruit', hosts: ['zohorecruit.com', 'zohorecruit.eu'] },
  { key: 'REVOLUT', name: 'Revolut Careers', hosts: ['revolut.com/careers'] },
  { key: 'WORKABLE', name: 'Workable', hosts: ['apply.workable.com'] },
  { key: 'MAINDER', name: 'Mainder', hosts: ['mainder.ai'] },
  { key: 'ASHBY', name: 'Ashby', hosts: ['ashbyhq.com'] },
  { key: 'SMARTRECRUITERS', name: 'SmartRecruiters', hosts: ['smartrecruiters.com'] },
  { key: 'ICIMS', name: 'iCIMS', hosts: ['icims.com'] },
  { key: 'SUCCESSFACTORS', name: 'SAP SuccessFactors', hosts: ['successfactors.com', 'successfactors.eu'] },
  { key: 'TALEO', name: 'Oracle Taleo', hosts: ['taleo.net'] },
  { key: 'RECRUITEE', name: 'Recruitee', hosts: ['recruitee.com'] },
  { key: 'TEAMTAILOR', name: 'Teamtailor', hosts: ['teamtailor.com'] },
  { key: 'JAZZHR', name: 'JazzHR', hosts: ['applytojob.com'] },
  { key: 'BREEZY', name: 'Breezy HR', hosts: ['breezy.hr'] },
  { key: 'JOBVITE', name: 'Jobvite', hosts: ['jobvite.com'] },
  { key: 'BAMBOOHR', name: 'BambooHR', hosts: ['bamboohr.com'] },
  { key: 'JOBFLUENT', name: 'JobFluent', hosts: ['jobfluent.com/jobs'] },
  { key: 'BIZNEO', name: 'Bizneo HR', hosts: ['careers.ats.bizneo.cloud/jobs'] },
];

globalThis.AAM = AAM;
