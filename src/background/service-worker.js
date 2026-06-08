/**
 * AutoApplyMAX privileged broker.
 *
 * Content scripts never access extension storage or community services directly.
 */
importScripts('../shared/constants.js', '../shared/profile-schema.js');

const RESUME_DB = 'autoapplymax-assets';
const RESUME_STORE = 'resumes';
const LOCAL_MAPPING_SOURCE = 'local';
const COMMUNITY_MAPPING_SOURCE = 'community';
let historyWriteQueue = Promise.resolve();
let mappingWriteQueue = Promise.resolve();

let initializationPromise = initialize();

async function initialize() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await migrateStorage();
}

chrome.runtime.onInstalled.addListener(details => {
  initializationPromise = initialize();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(error => console.error(error));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  initializationPromise
    .then(() => handleMessage(message, sender))
    .then(sendResponse)
    .catch(error => sendResponse({ error: error.message }));
  return true;
});

async function handleMessage(message, sender) {
  if (!message || typeof message.type !== 'string') {
    throw new Error('Invalid message');
  }

  switch (message.type) {
    case AAM.CONSTANTS.MSG.TRIGGER_AUTOFILL:
      assertExtensionPageSender(sender);
      return triggerAutofill(message);
    case AAM.CONSTANTS.MSG.STORAGE_OPERATION:
      return handleStorageOperation(message, sender);
    case AAM.CONSTANTS.MSG.SAVE_RESUME:
      assertExtensionPageSender(sender);
      return saveResumeMessage(message);
    case AAM.CONSTANTS.MSG.DOWNLOAD_RESUME:
      assertSupportedContentSender(sender);
      return downloadResume(message);
    case AAM.CONSTANTS.MSG.SUBMIT_MAPPINGS:
      assertExtensionPageSender(sender);
      return submitMappings(message.mappings);
    case AAM.CONSTANTS.MSG.SIGN_IN:
      assertExtensionPageSender(sender);
      return signInWithPassword(message.email, message.password);
    case AAM.CONSTANTS.MSG.SIGN_OUT:
      assertExtensionPageSender(sender);
      return signOut();
    case AAM.CONSTANTS.MSG.GET_AUTH_STATE:
      assertExtensionPageSender(sender);
      return getAuthState();
    default:
      return { error: 'Unsupported message type' };
  }
}

function assertExtensionPageSender(sender) {
  if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(''))) {
    throw new Error('Message must originate from an extension page');
  }
}

function assertSupportedContentSender(sender) {
  if (!sender.tab || !sender.url || !AAM.getSupportedATS(sender.url)) {
    throw new Error('Unsupported sender origin');
  }
}

async function triggerAutofill(message) {
  const tabId = Number(message.tabId);
  if (!Number.isInteger(tabId) || typeof message.expectedOrigin !== 'string') {
    throw new Error('Autofill request is not bound to a tab and origin');
  }

  const tab = await chrome.tabs.get(tabId);
  const tabUrl = new URL(tab.url || tab.pendingUrl || '');
  if (!AAM.getSupportedATS(tabUrl) || tabUrl.origin !== message.expectedOrigin) {
    throw new Error('This site is not supported or the active page changed');
  }

  const payload = {
    type: AAM.CONSTANTS.MSG.TRIGGER_AUTOFILL,
    requestId: String(message.requestId || ''),
    expectedOrigin: tabUrl.origin,
  };

  try {
    return await chrome.tabs.sendMessage(tabId, payload, { frameId: 0 });
  } catch {
    await injectContentScripts(tabId);
    const updatedTab = await chrome.tabs.get(tabId);
    const updatedUrl = new URL(updatedTab.url || updatedTab.pendingUrl || '');
    if (updatedUrl.origin !== tabUrl.origin || !AAM.getSupportedATS(updatedUrl)) {
      throw new Error('Page changed during autofill initialization');
    }
    return chrome.tabs.sendMessage(tabId, payload, { frameId: 0 });
  }
}

async function injectContentScripts(tabId) {
  const scripts = [
    'src/shared/constants.js',
    'src/shared/profile-schema.js',
    'src/shared/storage.js',
    'src/content/adapters/adapter-base.js',
    'src/content/adapters/linkedin.js',
    'src/content/adapters/greenhouse.js',
    'src/content/adapters/lever.js',
    'src/content/adapters/workable.js',
    'src/content/adapters/mainder.js',
    'src/content/adapters/workday.js',
    'src/content/adapters/revolut.js',
    'src/content/adapters/hirehive.js',
    'src/content/adapters/zoho.js',
    'src/content/field-detector.js',
    'src/content/field-filler.js',
    'src/content/learning-engine.js',
    'src/content/overlay.js',
    'src/content/autofill.js',
    'src/content/application-logger.js',
  ];
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: scripts });
}

async function handleStorageOperation(message, sender) {
  const operation = message.operation;
  const fromContent = Boolean(sender.tab) && !(sender.url?.startsWith(chrome.runtime.getURL('')));
  if (fromContent) assertSupportedContentSender(sender);
  else assertExtensionPageSender(sender);

  switch (operation) {
    case 'getProfile': {
      const profile = fromContent ? await getProfile() : await getProfileMergedWithCloud();
      return fromContent ? sanitizeAutofillProfile(profile) : sanitizeStoredProfile(profile);
    }
    case 'saveProfile':
      if (fromContent) throw new Error('Content scripts cannot save profiles');
      return saveProfile(message.profile);
    case 'getSettings':
      return getSettings();
    case 'saveSettings':
      if (fromContent) throw new Error('Content scripts cannot save settings');
      return saveSettings(message.settings);
    case 'getMappings':
      if (fromContent) throw new Error('Content scripts cannot enumerate mappings');
      return getStorageValue(AAM.CONSTANTS.STORAGE_MAPPINGS, {});
    case 'clearMappings':
      if (fromContent) throw new Error('Content scripts cannot clear mappings');
      await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_MAPPINGS]: {} });
      return true;
    case 'getSiteMappings':
      return getSiteMappings(message.siteKey, sender.url);
    case 'saveMapping':
      mappingWriteQueue = mappingWriteQueue.then(() =>
        saveMapping(
          message.siteKey,
          message.selector,
          message.profileKey,
          message.signature,
          sender
        )
      );
      return mappingWriteQueue;
    case 'getAppliedJobs':
      return getStorageValue(AAM.CONSTANTS.STORAGE_APPLIED_JOBS, []);
    case 'logAppliedJob':
      if (!fromContent) throw new Error('Applications must be logged from supported pages');
      historyWriteQueue = historyWriteQueue.then(() => logAppliedJob(message.entry, sender.url));
      return historyWriteQueue;
    case 'confirmAppliedJob':
      if (fromContent) throw new Error('Content scripts cannot confirm history');
      return confirmAppliedJob(message.index);
    case 'clearAppliedJobs':
      if (fromContent) throw new Error('Content scripts cannot clear history');
      await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_APPLIED_JOBS]: [] });
      return true;
    case 'deleteAppliedJob':
      if (fromContent) throw new Error('Content scripts cannot delete history');
      return deleteAppliedJob(message.index);
    default:
      throw new Error('Unsupported storage operation');
  }
}

async function getStorageValue(key, fallback) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? fallback;
}

async function getProfile() {
  const profile = await getStorageValue(AAM.CONSTANTS.STORAGE_PROFILE, {});
  return migrateLegacyResume(profile);
}

function sanitizeAutofillProfile(profile) {
  const clean = {};
  for (const field of AAM.PROFILE_FIELDS) {
    if (!field.autofillable || field.type === 'file') continue;
    const value = profile[field.key];
    if (typeof value === 'string' && value) clean[field.key] = value.slice(0, field.maxLength);
  }
  if (isResumeMetadata(profile.resumeAsset)) clean.resumeAsset = profile.resumeAsset;
  return clean;
}

function sanitizeStoredProfile(profile) {
  const clean = {};
  for (const field of AAM.PROFILE_FIELDS) {
    if (field.type === 'file') continue;
    const value = profile[field.key];
    if (typeof value === 'string' && value.trim()) {
      clean[field.key] = value.trim().slice(0, field.maxLength);
    }
  }
  if (isResumeMetadata(profile.resumeAsset)) clean.resumeAsset = profile.resumeAsset;
  return clean;
}

async function saveProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid profile');
  }
  const current = await getProfile();
  const clean = {};
  for (const field of AAM.PROFILE_FIELDS) {
    if (field.type === 'file') continue;
    const value = input[field.key];
    if (typeof value === 'string' && value.trim()) {
      clean[field.key] = value.trim().slice(0, field.maxLength);
    }
  }
  const resumeAsset = isResumeMetadata(input.resumeAsset) ? input.resumeAsset : current.resumeAsset;
  if (resumeAsset) clean.resumeAsset = resumeAsset;
  await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_PROFILE]: clean });
  getUserSession()
    .then(session => session && syncProfileToCloud(clean, session))
    .catch(() => {});
  return clean;
}

async function getSettings() {
  const settings = await getStorageValue(AAM.CONSTANTS.STORAGE_SETTINGS, {});
  return {
    highlightFilled: settings.highlightFilled !== false,
    showOverlay: settings.showOverlay !== false,
    showProactiveTrigger: settings.showProactiveTrigger !== false,
    shareMappings: settings.shareMappings === true,
  };
}

async function saveSettings(input) {
  const settings = {
    highlightFilled: input?.highlightFilled !== false,
    showOverlay: input?.showOverlay !== false,
    showProactiveTrigger: input?.showProactiveTrigger !== false,
    shareMappings: input?.shareMappings === true,
  };
  await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_SETTINGS]: settings });
  return settings;
}

async function getSiteMappings(siteKey, senderUrl) {
  validateSiteKey(siteKey, senderUrl);
  const all = await getStorageValue(AAM.CONSTANTS.STORAGE_MAPPINGS, {});
  const local = all[siteKey] || {};
  const community = await getApprovedMappings(siteKey).catch(error => {
    console.warn('[AutoApplyMAX] Community mappings unavailable:', error);
    return {};
  });
  return {
    localMappings: sanitizeMappingObject(local, false),
    communityMappings: sanitizeMappingObject(community, true),
  };
}

async function saveMapping(siteKey, selector, profileKey, signature, sender) {
  validateSiteKey(siteKey, sender.url);
  validateSelector(selector);
  if (!AAM.isProfileKey(profileKey) || !AAM.PROFILE_MAP[profileKey].autofillable) {
    throw new Error('Invalid profile key');
  }

  const all = await getStorageValue(AAM.CONSTANTS.STORAGE_MAPPINGS, {});
  const site = all[siteKey] && typeof all[siteKey] === 'object' ? all[siteKey] : {};
  site[selector] = profileKey;
  all[siteKey] = site;
  await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_MAPPINGS]: all });

  const settings = await getSettings();
  if (
    settings.shareMappings &&
    AAM.isCloudMappableProfileKey(profileKey) &&
    typeof signature === 'string' &&
    signature.length <= 500
  ) {
    submitMappings([{ siteKey, signature, profileKey }]).catch(error => {
      console.warn('[AutoApplyMAX] Community submission failed:', error);
    });
  }
  return true;
}

function sanitizeMappingObject(input, cloudOnly) {
  const output = {};
  if (!input || typeof input !== 'object') return output;
  for (const [selector, raw] of Object.entries(input)) {
    const profileKey = typeof raw === 'string' ? raw : raw?.profileKey;
    if (!AAM.isProfileKey(profileKey)) continue;
    if (cloudOnly && !AAM.isCloudMappableProfileKey(profileKey)) continue;
    if (typeof selector !== 'string' || selector.length > 500) continue;
    output[selector] = {
      profileKey,
      source: cloudOnly ? COMMUNITY_MAPPING_SOURCE : LOCAL_MAPPING_SOURCE,
      confidence: cloudOnly ? 0.75 : 1,
    };
  }
  return output;
}

function validateSiteKey(siteKey, senderUrl) {
  if (typeof siteKey !== 'string' || !/^[a-z0-9._:/-]{1,200}$/i.test(siteKey)) {
    throw new Error('Invalid site scope');
  }
  if (senderUrl && !AAM.getSupportedATS(senderUrl)) throw new Error('Unsupported site');
}

function validateSelector(selector) {
  if (typeof selector !== 'string' || selector.length < 1 || selector.length > 500) {
    throw new Error('Invalid selector');
  }
}

async function logAppliedJob(input, senderUrl) {
  const pageUrl = new URL(senderUrl);
  const suppliedUrl = safeHttpUrl(input?.url, pageUrl.origin);
  const entry = {
    jobTitle: cleanText(input?.jobTitle, 200, 'Unknown Position'),
    company: cleanText(input?.company, 200, 'Unknown Company'),
    url: suppliedUrl,
    timestamp: new Date().toISOString(),
    ats: cleanText(input?.ats, 50, AAM.getSupportedATS(pageUrl) || 'Unknown'),
    trigger: cleanText(input?.trigger, 30, 'form-submit'),
    status: 'pending',
  };

  const jobs = await getStorageValue(AAM.CONSTANTS.STORAGE_APPLIED_JOBS, []);
  const duplicate = jobs.some(job =>
    job.url === entry.url &&
    Math.abs(Date.parse(entry.timestamp) - Date.parse(job.timestamp)) < 60000
  );
  if (duplicate) return false;
  jobs.unshift(entry);
  await chrome.storage.local.set({
    [AAM.CONSTANTS.STORAGE_APPLIED_JOBS]: jobs.slice(0, AAM.CONSTANTS.MAX_HISTORY_ENTRIES),
  });
  return true;
}

async function confirmAppliedJob(index) {
  const jobs = await getStorageValue(AAM.CONSTANTS.STORAGE_APPLIED_JOBS, []);
  if (!Number.isInteger(index) || index < 0 || index >= jobs.length) {
    throw new Error('Invalid history entry');
  }
  jobs[index] = { ...jobs[index], status: 'confirmed' };
  await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_APPLIED_JOBS]: jobs });
  return true;
}

async function deleteAppliedJob(index) {
  const jobs = await getStorageValue(AAM.CONSTANTS.STORAGE_APPLIED_JOBS, []);
  if (Number.isInteger(index) && index >= 0 && index < jobs.length) {
    jobs.splice(index, 1);
    await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_APPLIED_JOBS]: jobs });
  }
  return true;
}

function cleanText(value, maxLength, fallback = '') {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function safeHttpUrl(value, fallbackOrigin) {
  try {
    const url = new URL(String(value || ''), fallbackOrigin);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.toString().slice(0, 2048);
  } catch {
    return fallbackOrigin;
  }
}

async function saveResumeMessage(message) {
  const bytes = message.bytes;
  const name = cleanText(message.name, 255);
  const mime = cleanText(message.mime, 100);
  if (!(bytes instanceof ArrayBuffer) || !name || bytes.byteLength > AAM.CONSTANTS.MAX_RESUME_BYTES) {
    throw new Error('Invalid or oversized resume');
  }
  if (!isAllowedResumeType(name, mime)) throw new Error('Resume must be PDF, DOC, or DOCX');

  const asset = {
    id: crypto.randomUUID(),
    name,
    mime,
    size: bytes.byteLength,
    updatedAt: new Date().toISOString(),
  };
  await putResume({ ...asset, bytes });
  return asset;
}

async function downloadResume(message) {
  if (typeof message.assetId !== 'string') throw new Error('Invalid resume asset');
  const resume = await getResume(message.assetId);
  if (!resume) throw new Error('Resume not found');
  const dataUrl = `data:${resume.mime};base64,${arrayBufferToBase64(resume.bytes)}`;
  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename: sanitizeFilename(message.filename || resume.name),
    saveAs: true,
  });
  return { downloadId };
}

function isAllowedResumeType(name, mime) {
  const extensionAllowed = /\.(pdf|doc|docx)$/i.test(name);
  const mimeAllowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
  ].includes(mime);
  return extensionAllowed && mimeAllowed;
}

function isResumeMetadata(value) {
  return Boolean(
    value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.mime === 'string' &&
    Number.isFinite(value.size)
  );
}

function sanitizeFilename(value) {
  return String(value || 'resume.pdf').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 255);
}

function openResumeDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RESUME_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(RESUME_STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putResume(record) {
  const db = await openResumeDb();
  await new Promise((resolve, reject) => {
    const request = db.transaction(RESUME_STORE, 'readwrite').objectStore(RESUME_STORE).put(record);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  db.close();
}

async function getResume(id) {
  const db = await openResumeDb();
  const record = await new Promise((resolve, reject) => {
    const request = db.transaction(RESUME_STORE).objectStore(RESUME_STORE).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

async function migrateLegacyResume(profile) {
  if (!profile?.resumeFileContent || !profile.resumeFileName) return profile || {};
  try {
    const [header, encoded] = String(profile.resumeFileContent).split(',', 2);
    const mime = /data:([^;]+)/.exec(header)?.[1] || 'application/octet-stream';
    const binary = atob(encoded || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    if (bytes.byteLength > AAM.CONSTANTS.MAX_RESUME_BYTES) throw new Error('Legacy resume is too large');
    const asset = await saveResumeMessage({
      bytes: bytes.buffer,
      name: profile.resumeFileName,
      mime,
    });
    const migrated = { ...profile, resumeAsset: asset };
    delete migrated.resumeFileName;
    delete migrated.resumeFileContent;
    await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_PROFILE]: migrated });
    return migrated;
  } catch (error) {
    console.warn('[AutoApplyMAX] Legacy resume migration failed:', error);
    const cleaned = { ...profile };
    delete cleaned.resumeFileContent;
    delete cleaned.resumeFileName;
    await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_PROFILE]: cleaned });
    return cleaned;
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function migrateStorage() {
  const version = await getStorageValue(AAM.CONSTANTS.STORAGE_SCHEMA_VERSION, 0);
  if (version >= AAM.CONSTANTS.SCHEMA_VERSION) return;
  const profile = await getStorageValue(AAM.CONSTANTS.STORAGE_PROFILE, {});
  const migratedProfile = await migrateLegacyResume(profile);
  const settings = await getSettings();
  await chrome.storage.local.set({
    [AAM.CONSTANTS.STORAGE_PROFILE]: sanitizeStoredProfile(migratedProfile),
    [AAM.CONSTANTS.STORAGE_SETTINGS]: settings,
    [AAM.CONSTANTS.STORAGE_SCHEMA_VERSION]: AAM.CONSTANTS.SCHEMA_VERSION,
  });
}

async function getApprovedMappings(siteKey) {
  if (!AAM.CONSTANTS.COMMUNITY_API_URL || !AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY) return {};
  const session = await getCommunitySession();
  const url = new URL('/functions/v1/read-mappings', AAM.CONSTANTS.COMMUNITY_API_URL);
  url.searchParams.set('siteKey', siteKey);
  const response = await fetch(url, {
    headers: {
      apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.accessToken}`,
    },
  });
  if (!response.ok) return {};
  const data = await response.json();
  const output = {};
  for (const row of data.mappings || []) {
    if (typeof row.fieldSignature === 'string' && AAM.isCloudMappableProfileKey(row.profileKey)) {
      output[row.fieldSignature] = row.profileKey;
    }
  }
  return output;
}

async function submitMappings(mappings) {
  if (!Array.isArray(mappings) || mappings.length > 500) throw new Error('Invalid mappings payload');
  const submissions = mappings.filter(item =>
    item &&
    typeof item.siteKey === 'string' &&
    typeof item.signature === 'string' &&
    item.signature.length <= 500 &&
    AAM.isCloudMappableProfileKey(item.profileKey)
  );
  if (!AAM.CONSTANTS.COMMUNITY_API_URL || !AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY) {
    throw new Error('Community service is not configured in this build');
  }
  const session = await getCommunitySession();
  const installationId = await getInstallationId();
  const response = await fetch(
    new URL('/functions/v1/submit-mappings', AAM.CONSTANTS.COMMUNITY_API_URL),
    {
    method: 'POST',
    headers: {
      apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      installationId,
      mappings: submissions.map(item => ({
        siteKey: item.siteKey,
        fieldSignature: item.signature,
        profileKey: item.profileKey,
      })),
    }),
  });
  if (!response.ok) throw new Error('Community submission failed');
  return response.json();
}

async function getInstallationId() {
  let installationId = await getStorageValue(AAM.CONSTANTS.STORAGE_INSTALLATION_ID, '');
  if (!/^[0-9a-f-]{36}$/i.test(installationId)) {
    installationId = crypto.randomUUID();
    await chrome.storage.local.set({
      [AAM.CONSTANTS.STORAGE_INSTALLATION_ID]: installationId,
    });
  }
  return installationId;
}

async function getCommunitySession() {
  const stored = await getStorageValue(AAM.CONSTANTS.STORAGE_COMMUNITY_SESSION, null);
  if (stored?.accessToken && Number(stored.expiresAt) > Date.now() + 60000) return stored;

  if (stored?.refreshToken) {
    const refreshed = await requestCommunityAuth(
      `/auth/v1/token?grant_type=refresh_token`,
      { refresh_token: stored.refreshToken }
    );
    if (refreshed) return persistCommunitySession(refreshed);
  }

  const created = await requestCommunityAuth('/auth/v1/signup', {});
  if (!created?.access_token) {
    throw new Error('Community authentication is unavailable');
  }
  return persistCommunitySession(created);
}

async function requestCommunityAuth(path, body) {
  const response = await fetch(new URL(path, AAM.CONSTANTS.COMMUNITY_API_URL), {
    method: 'POST',
    headers: {
      apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  return response.json();
}

async function persistCommunitySession(raw) {
  const session = {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: Date.now() + Number(raw.expires_in || 3600) * 1000,
  };
  await chrome.storage.local.set({
    [AAM.CONSTANTS.STORAGE_COMMUNITY_SESSION]: session,
  });
  return session;
}

// ── User Auth (Magic Link / OTP) ─────────────────────

const CLOUD_SYNC_FIELDS = new Set([
  'salutation', 'firstName', 'lastName', 'fullName', 'email',
  'phoneCountryCode', 'phone', 'address', 'city', 'state', 'zip', 'country',
  'linkedinUrl', 'githubUrl', 'portfolioUrl', 'currentTitle', 'currentCompany',
  'yearsExperience', 'education', 'preferredLocations', 'skills', 'englishLevel',
  'startDate', 'workAuthorization', 'sponsorshipRequirement', 'howDidYouHear',
  'salaryExpectation', 'gender', 'ethnicity', 'disabilityStatus', 'veteranStatus',
  'privacyPolicyConsent', 'coverLetter',
]);

function requireApiUrl() {
  if (!AAM.CONSTANTS.COMMUNITY_API_URL) {
    throw new Error('Extension is not configured — please reinstall the latest version');
  }
}

async function signInWithPassword(email, password) {
  requireApiUrl();
  if (!email || !password) throw new Error('Email and password are required');
  const response = await fetch(
    new URL('/auth/v1/token?grant_type=password', AAM.CONSTANTS.COMMUNITY_API_URL),
    {
      method: 'POST',
      headers: {
        apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.trim(), password }),
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error_description || err.msg || 'Invalid email or password');
  }
  const raw = await response.json();
  return persistUserSession(raw);
}

async function signOut() {
  const session = await getUserSession().catch(() => null);
  if (session) {
    fetch(new URL('/auth/v1/logout', AAM.CONSTANTS.COMMUNITY_API_URL), {
      method: 'POST',
      headers: {
        apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
    }).catch(() => {});
  }
  await chrome.storage.local.remove(AAM.CONSTANTS.STORAGE_USER_SESSION);
  return { signedOut: true };
}

async function getUserSession() {
  const stored = await getStorageValue(AAM.CONSTANTS.STORAGE_USER_SESSION, null);
  if (!stored?.accessToken) return null;
  if (Number(stored.expiresAt) > Date.now() + 60000) return stored;

  if (stored.refreshToken) {
    const response = await fetch(
      new URL('/auth/v1/token?grant_type=refresh_token', AAM.CONSTANTS.COMMUNITY_API_URL),
      {
        method: 'POST',
        headers: {
          apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: stored.refreshToken }),
      }
    );
    if (response.ok) {
      const raw = await response.json();
      return persistUserSession(raw);
    }
  }

  await chrome.storage.local.remove(AAM.CONSTANTS.STORAGE_USER_SESSION);
  return null;
}

async function persistUserSession(raw) {
  const session = {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: Date.now() + Number(raw.expires_in || 3600) * 1000,
    userId: raw.user?.id,
    email: raw.user?.email,
  };
  await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_USER_SESSION]: session });
  return session;
}

async function getAuthState() {
  const session = await getUserSession().catch(() => null);
  if (!session) return { signedIn: false };
  return { signedIn: true, email: session.email, userId: session.userId };
}

async function syncProfileToCloud(profile, session) {
  const cloudData = {};
  for (const key of CLOUD_SYNC_FIELDS) {
    if (typeof profile[key] === 'string' && profile[key]) {
      cloudData[key] = profile[key];
    }
  }
  const response = await fetch(
    new URL('/rest/v1/profiles', AAM.CONSTANTS.COMMUNITY_API_URL),
    {
      method: 'POST',
      headers: {
        apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ user_id: session.userId, data: cloudData }),
    }
  );
  if (!response.ok) {
    console.warn('[AutoApplyMAX] Cloud profile sync failed:', await response.text());
  }
}

async function fetchProfileFromCloud(session) {
  const response = await fetch(
    new URL(`/rest/v1/profiles?user_id=eq.${session.userId}&select=data`, AAM.CONSTANTS.COMMUNITY_API_URL),
    {
      headers: {
        apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/json',
      },
    }
  );
  if (!response.ok) return null;
  const rows = await response.json();
  return rows[0]?.data ?? null;
}

async function getProfileMergedWithCloud() {
  const local = await getProfile();
  const session = await getUserSession().catch(() => null);
  if (!session) return local;

  const cloud = await fetchProfileFromCloud(session).catch(() => null);
  if (!cloud) return local;

  // Start with cloud (non-sensitive fields), overlay local values on top
  const merged = { ...cloud };
  for (const [key, value] of Object.entries(local)) {
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  }
  return merged;
}
