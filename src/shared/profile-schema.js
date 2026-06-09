/**
 * AutoApplyMAX — Profile schema & field definitions
 *
 * Each field has:
 *   key        – storage key
 *   label      – human-readable label
 *   type       – input type for the options page
 *   keywords   – terms used by the heuristic engine to match DOM fields
 *   aliases    – additional regex patterns for fuzzy matching
 *   group      – UI grouping on the options page
 */
var AAM = globalThis.AAM || {};

AAM.PROFILE_FIELDS = [
  // ── Personal ──────────────────────────────────────
  {
    key: 'salutation',
    label: 'Salutation (Mr., Ms., etc.)',
    type: 'text',
    group: 'personal',
    keywords: ['salutation', 'title', 'prefix', 'honorific', 'mr', 'ms', 'mrs', 'dr'],
    aliases: [/salutation/i, /honorific/i, /^title$/i, /prefix/i],
  },
  {
    key: 'firstName',
    label: 'First Name',
    type: 'text',
    group: 'personal',
    keywords: ['first name', 'given name', 'your first name', 'candidate first name', 'fname', 'prenom', 'prénom', 'nombre', 'nome', 'vorname'],
    aliases: [/first[\s_-]?name/i, /given[\s_-]?name/i, /fname/i],
  },
  {
    key: 'lastName',
    label: 'Last Name',
    type: 'text',
    group: 'personal',
    keywords: ['last name', 'last_name', 'lastname', 'surname', 'family name', 'lname', 'apellido', 'nom', 'cognome', 'nachname'],
    aliases: [/last[\s_-]?name/i, /sur[\s_-]?name/i, /family[\s_-]?name/i, /lname/i],
  },
  {
    key: 'fullName',
    label: 'Full Name',
    type: 'text',
    group: 'personal',
    keywords: ['full name', 'your full name', 'candidate full name', 'complete name', 'fullname'],
    aliases: [/full[\s_-]?name/i, /your[\s_-]?name/i, /candidate[\s_-]?name/i],
  },
  {
    key: 'email',
    label: 'Email Address',
    type: 'email',
    group: 'personal',
    keywords: ['email', 'e-mail', 'email address', 'email_address', 'mail', 'correo', 'correo electrónico'],
    aliases: [/e[\s_-]?mail/i, /email[\s_-]?address/i, /correo[\s_-]?electr[oó]nico/i],
  },
  {
    key: 'phoneCountryCode',
    label: 'Phone Country Code (e.g., +33)',
    type: 'text',
    group: 'personal',
    keywords: ['phone country code', 'mobile country code', 'dialing code', 'prefix code', 'phone area', '+'],
    aliases: [/country[\s_-]?code/i, /dialling[\s_-]?code/i, /phone[\s_-]?code/i, /prefix/i],
  },
  {
    key: 'phone',
    label: 'Phone Number',
    type: 'tel',
    group: 'personal',
    keywords: ['phone', 'telephone', 'phone number', 'phone_number', 'mobile', 'cell', 'contact number', 'teléfono', 'téléphone', 'telefono', 'telefon'],
    aliases: [/phone[\s_-]?number/i, /tele[\s_-]?phone/i, /mobile[\s_-]?(number|phone)?/i, /cell[\s_-]?(phone)?/i],
  },
  {
    key: 'address',
    label: 'Street Address',
    type: 'text',
    group: 'personal',
    keywords: ['address', 'street address', 'street', 'address line 1', 'address_line_1'],
    aliases: [/street[\s_-]?address/i, /address[\s_-]?(line[\s_-]?1)?/i],
  },
  {
    key: 'city',
    label: 'City',
    type: 'text',
    group: 'personal',
    keywords: ['city', 'town', 'municipality'],
    aliases: [/^city$/i, /^town$/i],
  },
  {
    key: 'state',
    label: 'State / Province',
    type: 'text',
    group: 'personal',
    keywords: ['state', 'province', 'region'],
    aliases: [/^state$/i, /province/i, /^region$/i],
  },
  {
    key: 'zip',
    label: 'ZIP / Postal Code',
    type: 'text',
    group: 'personal',
    keywords: ['zip', 'zip code', 'zipcode', 'postal code', 'postal_code', 'postcode'],
    aliases: [/zip[\s_-]?code/i, /postal[\s_-]?code/i, /post[\s_-]?code/i],
  },
  {
    key: 'country',
    label: 'Country',
    type: 'text',
    group: 'personal',
    keywords: ['country', 'nation', 'country of residence'],
    aliases: [/^country$/i, /country[\s_-]?of[\s_-]?residence/i],
  },

  // ── Professional ──────────────────────────────────
  {
    key: 'linkedinUrl',
    label: 'LinkedIn URL',
    type: 'url',
    group: 'professional',
    keywords: ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin_url'],
    aliases: [/linked[\s_-]?in/i],
  },
  {
    key: 'githubUrl',
    label: 'GitHub URL',
    type: 'url',
    group: 'professional',
    keywords: ['github', 'github url', 'github profile', 'github_url'],
    aliases: [/git[\s_-]?hub/i],
  },
  {
    key: 'portfolioUrl',
    label: 'Portfolio / Website URL',
    type: 'url',
    group: 'professional',
    keywords: ['portfolio', 'website', 'personal website', 'portfolio url', 'website url', 'personal site', 'homepage'],
    aliases: [/portfolio/i, /personal[\s_-]?(website|site)/i, /home[\s_-]?page/i, /^website$/i],
  },
  {
    key: 'resumeFile',
    label: 'Resume / CV File',
    type: 'file',
    group: 'professional',
    keywords: ['resume', 'cv', 'resume file', 'cv file', 'upload resume', 'upload cv'],
    aliases: [/resum[eé]/i, /curriculum[\s_-]?vitae/i, /\bcv\b/i, /upload[\s_-]?resume/i, /upload[\s_-]?cv/i],
  },
  {
    key: 'currentTitle',
    label: 'Current Job Title',
    type: 'text',
    group: 'professional',
    keywords: ['job title', 'current title', 'title', 'position', 'current position', 'role'],
    aliases: [/job[\s_-]?title/i, /current[\s_-]?(title|position|role)/i, /^title$/i, /^position$/i],
  },
  {
    key: 'currentCompany',
    label: 'Current Company',
    type: 'text',
    group: 'professional',
    keywords: ['company', 'current company', 'employer', 'current employer', 'organization'],
    aliases: [/current[\s_-]?(company|employer)/i, /^company$/i, /^employer$/i, /organization/i],
  },
  {
    key: 'yearsExperience',
    label: 'Years of Experience',
    type: 'text',
    group: 'professional',
    keywords: ['years of experience', 'experience', 'years experience', 'total experience', 'work experience'],
    aliases: [/years?[\s_-]?(of[\s_-]?)?experience/i, /total[\s_-]?experience/i, /work[\s_-]?experience/i],
  },
  {
    key: 'education',
    label: 'Highest Education',
    type: 'text',
    group: 'professional',
    keywords: [
      'education',
      'degree',
      'highest education',
      'qualification',
      'school',
      'university',
      'formación académica',
      'formacion academica',
      'nivel de estudios',
      'estudios',
      'titulación',
      'titulacion',
    ],
    aliases: [
      /education/i,
      /degree/i,
      /qualification/i,
      /school/i,
      /university/i,
      /formaci[oó]n[\s_-]?acad[eé]mica/i,
      /nivel[\s_-]?de[\s_-]?estudios/i,
      /titulaci[oó]n/i,
    ],
  },
  {
    key: 'preferredLocations',
    label: 'Preferred Work Locations',
    type: 'text',
    group: 'professional',
    keywords: ['preferred work locations', 'locations', 'work locations', 'preferred locations', 'where would you like to work'],
    aliases: [/preferred[\s_-]?work[\s_-]?locations/i, /preferred[\s_-]?locations/i],
  },
  {
    key: 'skills',
    label: 'Skills (comma-separated)',
    type: 'textarea',
    group: 'professional',
    keywords: ['skills', 'key skills', 'technical skills', 'competencies'],
    aliases: [/skills/i, /competenc/i],
  },
  {
    key: 'englishLevel',
    label: 'English Level',
    type: 'text',
    group: 'professional',
    keywords: ['english', 'english level', 'english proficiency', 'english language', 'level of english', 'what is your level of english', 'spoken english', 'written english', 'fluency', 'fluent', 'proficient'],
    aliases: [/english[\s_-]?(level|proficiency|language|fluency)?/i, /level[\s_-]?of[\s_-]?english/i],
  },

  // ── Additional ────────────────────────────────────
  {
    key: 'coverLetter',
    label: 'Default Cover Letter',
    type: 'textarea',
    group: 'additional',
    keywords: ['cover letter', 'cover_letter', 'coverletter', 'letter of motivation', 'motivation letter'],
    aliases: [/cover[\s_-]?letter/i, /motivation[\s_-]?letter/i, /letter[\s_-]?of[\s_-]?motivation/i],
  },
  {
    key: 'salaryExpectation',
    label: 'Salary Expectation',
    type: 'text',
    group: 'additional',
    keywords: ['salary', 'salary expectation', 'expected salary', 'compensation', 'desired salary', 'salario', 'salaire', 'gehalt', 'stipendio'],
    aliases: [/salary/i, /compensation/i, /desired[\s_-]?salary/i, /expected[\s_-]?salary/i],
  },
  {
    key: 'startDate',
    label: 'Earliest Start Date',
    type: 'text',
    group: 'additional',
    keywords: ['start date', 'start_date', 'available from', 'availability', 'earliest start'],
    aliases: [/start[\s_-]?date/i, /availab/i, /earliest[\s_-]?start/i],
  },
  {
    key: 'workAuthorization',
    label: 'Legally Authorized to Work',
    type: 'text',
    group: 'additional',
    keywords: ['work authorization', 'authorized to work', 'right to work', 'eligible to work', 'legally authorized'],
    aliases: [/work[\s_-]?authoriz/i, /right[\s_-]?to[\s_-]?work/i, /eligible[\s_-]?to[\s_-]?work/i, /legally[\s_-]?authorized/i],
  },
  {
    key: 'sponsorshipRequirement',
    label: 'Require Visa Sponsorship',
    type: 'text',
    group: 'additional',
    keywords: ['visa', 'sponsorship', 'require sponsorship', 'require immigration sponsorship', 'employment visa'],
    aliases: [/visa/i, /sponsorship/i, /require[\s_-]?sponsorship/i],
  },
  {
    key: 'howDidYouHear',
    label: 'How did you hear about us?',
    type: 'text',
    group: 'additional',
    keywords: ['how did you hear', 'source', 'where did you hear', 'how did you find'],
    aliases: [/how[\s_-]?did[\s_-]?you[\s_-]?hear/i, /^source$/i],
  },
  {
    key: 'privacyPolicyConsent',
    label: 'Privacy Policy Consent (Type "Yes" or "I Accept")',
    type: 'text',
    group: 'additional',
    keywords: ['privacy policy', 'privacy notice', 'data protection', 'personal data', 'terms and conditions'],
    aliases: [/privacy[\s_-]?(policy|notice)/i, /data[\s_-]?protection/i, /personal[\s_-]?data/i],
  },
  {
    key: 'gender',
    label: 'Gender',
    type: 'text',
    group: 'additional',
    keywords: ['gender', 'sex'],
    aliases: [/^gender$/i, /^sex$/i],
  },
  {
    key: 'ethnicity',
    label: 'Ethnicity / Race',
    type: 'text',
    group: 'additional',
    keywords: ['ethnicity', 'race', 'ethnic background'],
    aliases: [/ethnicity/i, /\brace\b/i, /ethnic/i],
  },
  {
    key: 'veteranStatus',
    label: 'Veteran Status',
    type: 'text',
    group: 'additional',
    keywords: ['veteran', 'veteran status', 'military'],
    aliases: [/veteran/i, /military/i],
  },
  {
    key: 'disabilityStatus',
    label: 'Disability Status',
    type: 'text',
    group: 'additional',
    keywords: ['disability', 'disability status', 'disabled'],
    aliases: [/disabilit/i, /disabled/i],
  },
];

// Build a quick-lookup map
AAM.PROFILE_MAP = {};
AAM.SENSITIVE_PROFILE_KEYS = new Set([
  'salaryExpectation',
  'privacyPolicyConsent',
  'gender',
  'ethnicity',
  'veteranStatus',
  'disabilityStatus',
]);
// Only the file-upload field is excluded from community mapping — the selector
// for a salary/gender/etc. field is useful structural data, not a value.
AAM.NON_CLOUD_PROFILE_KEYS = new Set(['resumeFile']);
AAM.PROFILE_FIELDS.forEach(f => {
  f.sensitivity = f.key === 'resumeFile'
    ? 'document'
    : (AAM.SENSITIVE_PROFILE_KEYS.has(f.key) ? 'sensitive' : 'standard');
  f.autofillable = f.key !== 'privacyPolicyConsent';
  f.cloudMappable = !AAM.NON_CLOUD_PROFILE_KEYS.has(f.key);
  // Profile values are user-authored and may be autofilled consistently.
  // Legal/privacy consent remains non-autofillable regardless of sensitivity.
  f.requiresConfirmation = false;
  f.maxLength = f.type === 'textarea' ? 10000 : 500;
  AAM.PROFILE_MAP[f.key] = f;
});

AAM.isProfileKey = function (key) {
  return typeof key === 'string' && Boolean(AAM.PROFILE_MAP[key]);
};

AAM.isCloudMappableProfileKey = function (key) {
  const field = AAM.PROFILE_MAP[key];
  return Boolean(field && field.cloudMappable);
};

globalThis.AAM = AAM;
