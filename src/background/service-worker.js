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
/** Hosts we've already reported adapter drift for this service-worker lifetime. */
const reportedDriftHosts = new Set();
/** host|label pairs we've already submitted as field requests this lifetime. */
const requestedFieldKeys = new Set();
const approvedMappingsCache = new Map();
const APPROVED_MAPPINGS_CACHE_MS = 5 * 60 * 1000;
let communitySessionPromise = null;

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
    case AAM.CONSTANTS.MSG.REPORT_DRIFT:
      assertSupportedContentSender(sender);
      return reportDrift(message, sender);
    case AAM.CONSTANTS.MSG.REQUEST_FIELD:
      assertSupportedContentSender(sender);
      return requestField(message, sender);
    case AAM.CONSTANTS.MSG.SIGN_IN:
      assertExtensionPageSender(sender);
      return signInWithPassword(message.email, message.password);
    case AAM.CONSTANTS.MSG.SIGN_OUT:
      assertExtensionPageSender(sender);
      return signOut();
    case AAM.CONSTANTS.MSG.GET_AUTH_STATE:
      assertExtensionPageSender(sender);
      return getAuthState();
    case AAM.CONSTANTS.MSG.ADMIN_LIST_REQUESTS:
      assertExtensionPageSender(sender);
      return adminListFieldRequests();
    case AAM.CONSTANTS.MSG.ADMIN_SET_REQUEST_STATUS:
      assertExtensionPageSender(sender);
      return adminSetFieldRequestStatus(message.id, message.status);
    case AAM.CONSTANTS.MSG.ADMIN_LIST_PENDING_MAPPINGS:
      assertExtensionPageSender(sender);
      return adminListPendingMappings();
    case AAM.CONSTANTS.MSG.ADMIN_REVIEW_MAPPING:
      assertExtensionPageSender(sender);
      return adminReviewMapping(message.submissionId, message.decision, message.note);
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
    'src/content/adapters/jobfluent.js',
    'src/content/adapters/bizneo.js',
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
  const fromContent = Boolean(sender.tab) && !sender.url?.startsWith(chrome.runtime.getURL(''));
  if (fromContent) assertSupportedContentSender(sender);
  else assertExtensionPageSender(sender);

  switch (operation) {
    case 'getProfile': {
      const profile = fromContent ? await getProfile() : await getProfileMergedWithCloud();
      return fromContent ? sanitizeAutofillProfile(profile) : sanitizeStoredProfile(profile);
    }
    case 'getAutofillContext': {
      if (!fromContent) throw new Error('Autofill context is only available to supported pages');
      const [profile, settings, mappings] = await Promise.all([
        getProfile(),
        getSettings(),
        getSiteMappings(message.siteKey, sender.url),
      ]);
      return {
        profile: sanitizeAutofillProfile(profile),
        settings,
        siteMappings: mappings,
      };
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
  };
}

async function saveSettings(input) {
  const settings = {
    highlightFilled: input?.highlightFilled !== false,
    showOverlay: input?.showOverlay !== false,
    showProactiveTrigger: input?.showProactiveTrigger !== false,
  };
  await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_SETTINGS]: settings });
  return settings;
}

async function getSiteMappings(siteKey, senderUrl) {
  validateSiteKey(siteKey, senderUrl);
  const communityPromise = getApprovedMappings(siteKey).catch(error => {
    console.warn('[AutoApplyMAX] Community mappings unavailable:', error);
    return {};
  });
  const [all, community] = await Promise.all([
    getStorageValue(AAM.CONSTANTS.STORAGE_MAPPINGS, {}),
    promiseWithTimeout(communityPromise, 250, {}),
  ]);
  const local = all[siteKey] || {};
  return {
    localMappings: sanitizeMappingObject(local, false),
    communityMappings: sanitizeMappingObject(community, true),
  };
}

function promiseWithTimeout(promise, timeoutMs, fallback) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

async function saveMapping(siteKey, selector, profileKey, signature, sender) {
  validateSiteKey(siteKey, sender.url);
  validateSelector(selector);
  if (!AAM.isProfileKey(profileKey) || !AAM.PROFILE_MAP[profileKey].autofillable) {
    throw new Error('Invalid profile key');
  }

  const all = await getStorageValue(AAM.CONSTANTS.STORAGE_MAPPINGS, {});
  const site = all[siteKey] && typeof all[siteKey] === 'object' ? all[siteKey] : {};
  const communityEligible =
    AAM.isCloudMappableProfileKey(profileKey) &&
    typeof signature === 'string' &&
    signature.length > 0 &&
    signature.length <= 500;
  site[selector] = {
    profileKey,
    signature: communityEligible ? signature : '',
    communityStatus: communityEligible ? 'pending' : 'local_only',
  };
  all[siteKey] = site;
  await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_MAPPINGS]: all });

  if (!communityEligible) {
    return { saved: true, communityEligible: false, communitySubmitted: false };
  }

  try {
    await submitMappings([{ siteKey, signature, profileKey }]);
    site[selector].communityStatus = 'submitted';
    site[selector].communitySubmittedAt = new Date().toISOString();
    await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_MAPPINGS]: all });
    return { saved: true, communityEligible: true, communitySubmitted: true };
  } catch (error) {
    site[selector].communityStatus = 'failed';
    await chrome.storage.local.set({ [AAM.CONSTANTS.STORAGE_MAPPINGS]: all });
    console.warn('[AutoApplyMAX] Community submission failed:', error);
    return { saved: true, communityEligible: true, communitySubmitted: false };
  }
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
  const duplicate = jobs.some(
    job =>
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
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;
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
  let bytes = message.bytes;
  if (!(bytes instanceof ArrayBuffer) && typeof message.bytesBase64 === 'string') {
    const binary = atob(message.bytesBase64);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
    bytes = buf.buffer;
  }
  const name = cleanText(message.name, 255);
  const mime = cleanText(message.mime, 100);
  if (
    !(bytes instanceof ArrayBuffer) ||
    !name ||
    bytes.byteLength > AAM.CONSTANTS.MAX_RESUME_BYTES
  ) {
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
  return String(value || 'resume.pdf')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .slice(0, 255);
}

function openResumeDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RESUME_DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(RESUME_STORE, { keyPath: 'id' });
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
    if (bytes.byteLength > AAM.CONSTANTS.MAX_RESUME_BYTES)
      throw new Error('Legacy resume is too large');
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
  const cached = approvedMappingsCache.get(siteKey);
  if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.promise) return cached.promise;

  const promise = (async () => {
    const session = await getCommunitySession();
    const url = new URL('/functions/v1/read-mappings', AAM.CONSTANTS.COMMUNITY_API_URL);
    url.searchParams.set('siteKey', siteKey);
    const response = await fetch(url, {
      headers: {
        apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
      },
    });
    if (!response.ok) return cached?.value || {};
    const data = await response.json();
    const output = {};
    for (const row of data.mappings || []) {
      if (typeof row.fieldSignature === 'string' && AAM.isCloudMappableProfileKey(row.profileKey)) {
        output[row.fieldSignature] = row.profileKey;
      }
    }
    approvedMappingsCache.set(siteKey, {
      value: output,
      expiresAt: Date.now() + APPROVED_MAPPINGS_CACHE_MS,
    });
    return output;
  })();

  approvedMappingsCache.set(siteKey, {
    value: cached?.value,
    expiresAt: cached?.expiresAt || 0,
    promise,
  });
  try {
    return await promise;
  } finally {
    const current = approvedMappingsCache.get(siteKey);
    if (current?.promise === promise) {
      if (current.value) {
        approvedMappingsCache.set(siteKey, {
          value: current.value,
          expiresAt: current.expiresAt,
        });
      } else {
        approvedMappingsCache.delete(siteKey);
      }
    }
  }
}

async function submitMappings(mappings) {
  if (!Array.isArray(mappings) || mappings.length > 500)
    throw new Error('Invalid mappings payload');
  const submissions = mappings.filter(
    item =>
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
    }
  );
  if (!response.ok) throw new Error('Community submission failed');
  return response.json();
}

async function reportDrift(message, sender) {
  if (!AAM.CONSTANTS.COMMUNITY_API_URL || !AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY) {
    return { reported: false };
  }

  const ats = AAM.getSupportedATS(sender.url);
  if (!ats) throw new Error('Unsupported sender origin');

  const host = new URL(sender.url).hostname.toLowerCase();
  // Throttle: one report per host per service-worker lifetime.
  if (reportedDriftHosts.has(host)) return { reported: false, deduped: true };

  const adapterName = String(message.adapter || '').slice(0, 64);
  const siteKey = String(message.siteKey || '').slice(0, 253);
  if (!adapterName || !siteKey) throw new Error('Invalid drift payload');

  const missingProfileKeys = Array.isArray(message.missingProfileKeys)
    ? message.missingProfileKeys.filter(key => AAM.isProfileKey(key)).slice(0, 40)
    : [];

  // Only structural signatures — never values — and drop restricted semantics.
  const restricted =
    /(^|[^a-z0-9])(resume|curriculum|cv|salary|compensation|wage|pay|privacy|consent|eeo|demographic|race|racial|ethnicity|ethnic|gender|sex|disability|disabled|veteran|military)([^a-z0-9]|$)/i;
  const fieldSignatures = Array.isArray(message.fieldSignatures)
    ? message.fieldSignatures
        .filter(sig => typeof sig === 'string' && sig.length <= 1000 && !restricted.test(sig))
        .slice(0, 50)
    : [];

  const session = await getCommunitySession();
  const response = await fetch(
    new URL('/rest/v1/adapter_drift_signals', AAM.CONSTANTS.COMMUNITY_API_URL),
    {
      method: 'POST',
      headers: {
        apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        adapter_name: adapterName,
        site_key: siteKey,
        host,
        missing_profile_keys: missingProfileKeys,
        field_signatures: fieldSignatures,
      }),
    }
  );

  if (!response.ok) {
    console.warn('[AutoApplyMAX] Drift report failed:', response.status);
    return { reported: false };
  }
  reportedDriftHosts.add(host);
  return { reported: true };
}

/** Collapse whitespace, strip control characters, and clamp length. */
function cleanRequestText(value, maxLength) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return stripped.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function requestField(message, sender) {
  if (!AAM.CONSTANTS.COMMUNITY_API_URL || !AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY) {
    return { requested: false };
  }

  const ats = AAM.getSupportedATS(sender.url);
  if (!ats) throw new Error('Unsupported sender origin');

  const suggestedLabel = cleanRequestText(message.suggestedLabel, 100);
  if (!suggestedLabel) throw new Error('A field name is required');

  const host = new URL(sender.url).hostname.toLowerCase();
  const dedupeKey = `${host}|${suggestedLabel.toLowerCase()}`;
  if (requestedFieldKeys.has(dedupeKey)) return { requested: false, deduped: true };

  const note = cleanRequestText(message.note, 500) || null;
  const siteKey = String(message.siteKey || '').slice(0, 253) || null;

  // Attach the structural signature only (never values). Drop it if it isn't
  // the normalized JSON shape we expect.
  let fieldSignature = null;
  if (typeof message.signature === 'string' && message.signature.length <= 1000) {
    try {
      const parsed = JSON.parse(message.signature);
      if (parsed && parsed.v === 1) fieldSignature = parsed;
    } catch {
      fieldSignature = null;
    }
  }

  const session = await getCommunitySession();
  const response = await fetch(
    new URL('/rest/v1/field_requests', AAM.CONSTANTS.COMMUNITY_API_URL),
    {
      method: 'POST',
      headers: {
        apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        suggested_label: suggestedLabel,
        note,
        site_key: siteKey,
        host,
        field_signature: fieldSignature,
      }),
    }
  );

  if (!response.ok) {
    console.warn('[AutoApplyMAX] Field request failed:', response.status);
    return { requested: false };
  }
  requestedFieldKeys.add(dedupeKey);
  return { requested: true };
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

  if (!communitySessionPromise) {
    communitySessionPromise = (async () => {
      if (stored?.refreshToken) {
        const refreshed = await requestCommunityAuth(`/auth/v1/token?grant_type=refresh_token`, {
          refresh_token: stored.refreshToken,
        });
        if (refreshed) return persistCommunitySession(refreshed);
      }

      const created = await requestCommunityAuth('/auth/v1/signup', {});
      if (!created?.access_token) {
        throw new Error('Community authentication is unavailable');
      }
      return persistCommunitySession(created);
    })();
  }
  const pendingSession = communitySessionPromise;
  try {
    return await pendingSession;
  } finally {
    if (communitySessionPromise === pendingSession) communitySessionPromise = null;
  }
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
  'salutation',
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phoneCountryCode',
  'phone',
  'address',
  'city',
  'state',
  'zip',
  'country',
  'linkedinUrl',
  'githubUrl',
  'portfolioUrl',
  'currentTitle',
  'currentCompany',
  'yearsExperience',
  'education',
  'preferredLocations',
  'skills',
  'englishLevel',
  'startDate',
  'workAuthorization',
  'sponsorshipRequirement',
  'howDidYouHear',
  'salaryExpectation',
  'gender',
  'ethnicity',
  'disabilityStatus',
  'veteranStatus',
  'privacyPolicyConsent',
  'coverLetter',
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
  await persistUserSession(raw);
  return getAuthState();
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
  const isReviewer = await checkIsReviewer(session).catch(() => false);
  return { signedIn: true, email: session.email, userId: session.userId, isReviewer };
}

/** Ask the backend whether the signed-in user is a mapping reviewer (admin). */
async function checkIsReviewer(session) {
  const response = await fetch(
    new URL('/rest/v1/rpc/is_mapping_reviewer', AAM.CONSTANTS.COMMUNITY_API_URL),
    {
      method: 'POST',
      headers: {
        apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );
  if (!response.ok) return false;
  return (await response.json()) === true;
}

/**
 * Fetch against the community backend authenticated as the signed-in user.
 * Throws if the user isn't signed in. Used for all reviewer/admin operations —
 * the server still enforces reviewer access via RLS and SECURITY DEFINER checks.
 */
async function authedFetch(path, init = {}) {
  requireApiUrl();
  const session = await getUserSession().catch(() => null);
  if (!session) throw new Error('Please sign in to your account first');
  const response = await fetch(new URL(path, AAM.CONSTANTS.COMMUNITY_API_URL), {
    ...init,
    headers: {
      apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  return response;
}

async function adminListFieldRequests() {
  const response = await authedFetch(
    '/rest/v1/field_requests?select=id,suggested_label,note,site_key,host,status,created_at&order=created_at.desc&limit=200'
  );
  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Reviewer access required'
        : 'Failed to load field requests'
    );
  }
  return response.json();
}

async function adminSetFieldRequestStatus(id, status) {
  if (!Number.isInteger(id)) throw new Error('Invalid request id');
  if (!['open', 'planned', 'done', 'declined'].includes(status)) {
    throw new Error('Invalid status');
  }
  const response = await authedFetch('/rest/v1/rpc/set_field_request_status', {
    method: 'POST',
    body: JSON.stringify({ p_id: id, p_status: status }),
  });
  if (!response.ok) throw new Error('Failed to update request');
  return { ok: true };
}

async function adminListPendingMappings() {
  const response = await authedFetch(
    '/rest/v1/pending_mapping_submissions?review_status=eq.pending' +
      '&select=id,site_key,field_signature,profile_key,submitted_by,created_at' +
      '&order=created_at.desc&limit=500'
  );
  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Reviewer access required'
        : 'Failed to load pending mappings'
    );
  }
  const rows = await response.json();

  // Aggregate by (site_key, field_signature, profile_key): the consensus unit.
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.site_key}|${row.field_signature}|${row.profile_key}`;
    if (!groups.has(key)) {
      groups.set(key, {
        siteKey: row.site_key,
        fieldSignature: row.field_signature,
        profileKey: row.profile_key,
        submissionId: row.id, // representative (most recent)
        submitters: new Set(),
        firstSeen: row.created_at,
      });
    }
    const group = groups.get(key);
    group.submitters.add(row.submitted_by);
    if (row.created_at < group.firstSeen) group.firstSeen = row.created_at;
  }

  return [...groups.values()]
    .map(g => ({
      siteKey: g.siteKey,
      fieldSignature: g.fieldSignature,
      profileKey: g.profileKey,
      submissionId: g.submissionId,
      submitterCount: g.submitters.size,
      firstSeen: g.firstSeen,
    }))
    .sort((a, b) => b.submitterCount - a.submitterCount);
}

async function adminReviewMapping(submissionId, decision, note) {
  if (typeof submissionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(submissionId)) {
    throw new Error('Invalid submission id');
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new Error('Invalid decision');
  }
  const rpc = decision === 'approved' ? 'approve_mapping_submission' : 'reject_mapping_submission';
  const body =
    decision === 'approved'
      ? { p_submission_id: submissionId, p_review_note: note || null }
      : { p_submission_id: submissionId, p_review_note: note || 'Rejected by reviewer' };

  const response = await authedFetch(`/rest/v1/rpc/${rpc}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Reviewer access required'
        : `Review failed: ${text || response.status}`
    );
  }
  return { ok: true };
}

async function syncProfileToCloud(profile, session) {
  const cloudData = {};
  for (const key of CLOUD_SYNC_FIELDS) {
    if (typeof profile[key] === 'string' && profile[key]) {
      cloudData[key] = profile[key];
    }
  }
  const response = await fetch(new URL('/rest/v1/profiles', AAM.CONSTANTS.COMMUNITY_API_URL), {
    method: 'POST',
    headers: {
      apikey: AAM.CONSTANTS.COMMUNITY_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ user_id: session.userId, data: cloudData }),
  });
  if (!response.ok) {
    console.warn('[AutoApplyMAX] Cloud profile sync failed:', await response.text());
  }
}

async function fetchProfileFromCloud(session) {
  const response = await fetch(
    new URL(
      `/rest/v1/profiles?user_id=eq.${session.userId}&select=data`,
      AAM.CONSTANTS.COMMUNITY_API_URL
    ),
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
