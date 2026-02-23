/**
 * AutoApplyMAX — shared constants
 */
var AAM = window.AAM || {};

AAM.CONSTANTS = {
  // Storage keys
  STORAGE_PROFILE: 'aam_user_profile',
  STORAGE_MAPPINGS: 'aam_field_mappings',
  STORAGE_SETTINGS: 'aam_settings',
  STORAGE_APPLIED_JOBS: 'aam_applied_jobs',

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
  },

  // Supabase Configuration (Sync shared mappings)
  SUPABASE_URL: '', // User will provide
  SUPABASE_KEY: '', // User will provide
  SUPABASE_TABLE: 'field_mappings',

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
  },
};

window.AAM = AAM;
