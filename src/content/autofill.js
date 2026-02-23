/**
 * AutoApplyMAX — Main Autofill Orchestrator (Content Script)
 *
 * Coordinates field detection, filling, the learning engine,
 * and the overlay UI. Triggered via message from the popup/background.
 */
var AAM = window.AAM || {};

AAM.Autofill = {
  /** @type {boolean} */
  _running: false,

  /**
   * Initialize the content script.
   */
  init() {
    // Listen for messages from the popup/background
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === AAM.CONSTANTS.MSG.TRIGGER_AUTOFILL) {
        this.run().then(result => {
          sendResponse(result);
        }).catch(err => {
          sendResponse({ error: err.message });
        });
        return true; // keep the message channel open for async response
      }
    });

    // Start the learning engine
    const adapter = AAM.getAdapter();
    AAM.LearningEngine.start(adapter.getSiteKey());

    console.log('[AutoApplyMAX] Content script loaded on', window.location.hostname);
  },

  /**
   * Run the full autofill pipeline.
   * @returns {Promise<{filled: number, skipped: number, unmatched: number, adapter: string}>}
   */
  async run() {
    if (this._running) {
      AAM.Overlay.showMessage('Autofill is already running...', 'info');
      return { error: 'Already running' };
    }

    this._running = true;

    try {
      // 1. Get the profile
      const profile = await AAM.Storage.getProfile();
      if (!profile || Object.keys(profile).length === 0) {
        AAM.Overlay.showMessage(
          'No profile found. Please fill your profile in the extension options first.',
          'warning'
        );
        return { error: 'No profile', filled: 0, skipped: 0, unmatched: 0 };
      }

      // 2. Get the adapter for this ATS
      const adapter = AAM.getAdapter();
      console.log(`[AutoApplyMAX] Using adapter: ${adapter.name}`);

      // 3. Adapter preparation (expand sections, wait for elements, etc.)
      await adapter.prepare();

      // 4. Get learned mappings for this site
      const siteKey = adapter.getSiteKey();
      const siteMappings = await AAM.Storage.getSiteMappings(siteKey);

      // 5. Merge adapter known mappings into site mappings
      const knownMappings = adapter.getKnownMappings();
      const mergedMappings = { ...siteMappings };
      for (const km of knownMappings) {
        // Don't override learned mappings
        if (!mergedMappings[km.selector]) {
          mergedMappings[km.selector] = km.profileKey;
        }
      }

      // 6. Get settings
      const settings = await AAM.Storage.getSettings();

      // 7. Detect form fields using heuristics + learned mappings
      const detectedFields = AAM.FieldDetector.detectFields(mergedMappings);
      console.log(`[AutoApplyMAX] Detected ${detectedFields.length} form fields`);

      // 8. Fill the fields
      const result = AAM.FieldFiller.fillFields(detectedFields, profile, settings);
      console.log(
        `[AutoApplyMAX] Fill result: ${result.filled} filled, ` +
        `${result.skipped} skipped, ${result.unmatched} unmatched`
      );

      // 9. Run adapter post-fill hook
      await adapter.afterFill(result);

      // 10. Show the overlay
      if (settings.showOverlay !== false) {
        AAM.Overlay.show({
          filled: result.filled,
          skipped: result.skipped,
          unmatched: result.unmatched,
        }, detectedFields, siteKey);
      }

      return {
        filled: result.filled,
        skipped: result.skipped,
        unmatched: result.unmatched,
        adapter: adapter.name,
      };
    } catch (err) {
      console.error('[AutoApplyMAX] Autofill error:', err);
      AAM.Overlay.showMessage('Autofill error: ' + err.message, 'error');
      return { error: err.message, filled: 0, skipped: 0, unmatched: 0 };
    } finally {
      this._running = false;
    }
  },
};

// Initialize when the content script loads
AAM.Autofill.init();

window.AAM = AAM;
