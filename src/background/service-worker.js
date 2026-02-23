/**
 * AutoApplyMAX — Background Service Worker (Manifest V3)
 *
 * Handles:
 * - Injecting content scripts on demand (for pages not in the static match list)
 * - Relaying messages between popup ↔ content scripts
 * - Handling extension install/update events
 */

// On install — open the options page so the user fills their profile
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'aam:trigger_autofill') {
    handleAutofillTrigger(msg, sendResponse);
    return true; // async
  }

  if (msg.type === 'aam:inject_and_fill') {
    handleInjectAndFill(msg, sendResponse);
    return true; // async
  }
});

/**
 * Trigger autofill on the active tab by sending a message to the content script.
 */
async function handleAutofillTrigger(msg, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      sendResponse({ error: 'No active tab found' });
      return;
    }

    // Try to send a message to the content script
    try {
      const result = await chrome.tabs.sendMessage(tab.id, {
        type: 'aam:trigger_autofill',
      });
      sendResponse(result);
    } catch (err) {
      // Content script might not be loaded — inject it first
      console.log('[AutoApplyMAX] Content script not found, injecting...');
      await injectContentScripts(tab.id);

      // Wait for scripts to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      // Retry
      try {
        const result = await chrome.tabs.sendMessage(tab.id, {
          type: 'aam:trigger_autofill',
        });
        sendResponse(result);
      } catch (retryErr) {
        sendResponse({ error: 'Failed to communicate with content script: ' + retryErr.message });
      }
    }
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

/**
 * Inject content scripts and then trigger autofill.
 */
async function handleInjectAndFill(msg, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      sendResponse({ error: 'No active tab found' });
      return;
    }

    await injectContentScripts(tab.id);
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await chrome.tabs.sendMessage(tab.id, {
      type: 'aam:trigger_autofill',
    });
    sendResponse(result);
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

/**
 * Programmatically inject all content scripts into a tab.
 * @param {number} tabId
 */
async function injectContentScripts(tabId) {
  const scripts = [
    'src/shared/constants.js',
    'src/shared/profile-schema.js',
    'src/shared/storage.js',
    'src/content/adapters/adapter-base.js',
    'src/content/adapters/linkedin.js',
    'src/content/adapters/greenhouse.js',
    'src/content/adapters/lever.js',
    'src/content/adapters/workday.js',
    'src/content/adapters/hirehive.js',
    'src/content/field-detector.js',
    'src/content/field-filler.js',
    'src/content/learning-engine.js',
    'src/content/overlay.js',
    'src/content/autofill.js',
    'src/content/application-logger.js',
  ];

  await chrome.scripting.executeScript({
    target: { tabId },
    files: scripts,
  });
}
