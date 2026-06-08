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
        if (msg.expectedOrigin !== window.location.origin || !msg.requestId) {
          sendResponse({ error: 'Autofill request does not match this document' });
          return false;
        }
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

    // Proactively check if we should show the "Prefill" trigger
    this.checkAndShowTrigger();

    console.log('[AutoApplyMAX] Content script loaded on', window.location.hostname);
  },

  /**
   * Check if the current page can be prefilled and show a proactive overlay button.
   */
  async checkAndShowTrigger() {
    if (this._triggerShown) return;

    console.log('[AutoApplyMAX] Checking if proactive trigger should show...');
    try {
      // 1. Check if we have a profile
      const profile = await AAM.Storage.getProfile();
      if (!profile || Object.keys(profile).length === 0) {
        console.log('[AutoApplyMAX] Trigger hidden: No profile saved.');
        return;
      }

      // 2. Get the settings
      const settings = await AAM.Storage.getSettings();
      if (settings.showProactiveTrigger === false) {
        console.log('[AutoApplyMAX] Trigger hidden: Disabled in settings.');
        return;
      }

      // 3. Get the adapter
      const adapter = AAM.getAdapter();
      const isGeneric = adapter.name === 'Generic';

      // 4. Look for fields (briefly)
      const detectedFields = AAM.FieldDetector.detectFields();
      console.log(`[AutoApplyMAX] Quick scan found ${detectedFields.length} fields. Adapter: ${adapter.name}`);

      // If we find any form fields AND it's a known ATS
      if (detectedFields.length > 0 && !isGeneric) {
        console.log(`[AutoApplyMAX] Showing proactive trigger for ${adapter.name}`);
        this._triggerShown = true;
        AAM.Overlay.showTrigger(() => {
          this.run();
        });

        if (this._triggerObserver) {
          this._triggerObserver.disconnect();
          this._triggerObserver = null;
        }
      } else if (!isGeneric && !this._triggerObserver) {
        // Known ATS but no fields yet - watch for them
        console.log('[AutoApplyMAX] No fields found on known ATS, watching for DOM changes...');
        this._startTriggerObserver();
      } else {
        console.log('[AutoApplyMAX] Trigger hidden: Site not recognized or no fields found.');
      }
    } catch (err) {
      console.warn('[AutoApplyMAX] Trigger check failed:', err);
    }
  },

  /**
   * Watch the DOM for changes to detect dynamically loaded forms
   */
  _startTriggerObserver() {
    if (this._triggerObserver) return;

    let throttleTimer = null;
    this._triggerObserver = new MutationObserver(() => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        this.checkAndShowTrigger();
        throttleTimer = null;
      }, 2000);
    });

    this._triggerObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  },

  /**
   * Decide whether a known adapter has drifted — i.e. it declares known
   * field mappings but none of them matched any field on the page, even
   * though the page clearly has a form. Pure function for testability.
   *
   * @param {Array} detectedFields
   * @param {{name: string}} adapter
   * @param {Array<{selector: string, profileKey: string}>} knownMappings
   * @returns {{adapter: string, missingProfileKeys: string[]}|null}
   */
  detectAdapterDrift(detectedFields, adapter, knownMappings) {
    if (!adapter || adapter.name === 'Generic') return null;
    if (!Array.isArray(knownMappings) || knownMappings.length === 0) return null;
    if (!Array.isArray(detectedFields) || detectedFields.length === 0) return null;

    const adapterMatched = detectedFields.filter(f => f.source === 'adapter').length;
    if (adapterMatched > 0) return null;

    const expectedKeys = [...new Set(knownMappings.map(m => m.profileKey))];
    const resolvedKeys = new Set(
      detectedFields.filter(f => f.profileKey).map(f => f.profileKey)
    );
    const missingProfileKeys = expectedKeys.filter(key => !resolvedKeys.has(key));
    return { adapter: adapter.name, missingProfileKeys };
  },

  /**
   * Fire-and-forget drift telemetry + a one-line console note.
   * @param {{adapter: string, missingProfileKeys: string[]}} drift
   * @param {string} siteKey
   * @param {Array} detectedFields
   */
  reportDrift(drift, siteKey, detectedFields) {
    try {
      const fieldSignatures = detectedFields
        .map(f => f.signature || AAM.FieldDetector.buildSignature(f.element))
        .filter(Boolean)
        .slice(0, 50);
      chrome.runtime.sendMessage({
        type: AAM.CONSTANTS.MSG.REPORT_DRIFT,
        adapter: drift.adapter,
        siteKey,
        missingProfileKeys: drift.missingProfileKeys,
        fieldSignatures,
      }).catch(() => {});
    } catch {
      // Telemetry is best-effort; never block autofill.
    }
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

      // 5. Adapter mappings are matched against elements, not selector strings.
      const knownMappings = adapter.getKnownMappings();

      // 6. Get settings
      const settings = await AAM.Storage.getSettings();

      // 7. Detect form fields using heuristics + learned mappings
      const detectedFields = AAM.FieldDetector.detectFields(siteMappings, knownMappings);
      console.log(`[AutoApplyMAX] Detected ${detectedFields.length} form fields`);

      // 7b. Detect adapter drift (known site whose selectors no longer match).
      const drift = this.detectAdapterDrift(detectedFields, adapter, knownMappings);
      let driftNotice = '';
      if (drift) {
        console.warn(`[AutoApplyMAX] Adapter drift detected for ${adapter.name} — its known fields matched nothing.`);
        this.reportDrift(drift, siteKey, detectedFields);
        driftNotice =
          `${adapter.name} looks different than we expected. ` +
          `Map any wrong fields below — your fixes are shared so everyone adapts.`;
      }

      // 8. Fill the fields
      const result = await AAM.FieldFiller.fillFields(detectedFields, profile, settings);
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
        }, detectedFields, siteKey, driftNotice);
      }

      // 11. Notify the background/sidepanel that we're done
      chrome.runtime.sendMessage({
        type: AAM.CONSTANTS.MSG.AUTOFILL_COMPLETED,
        result: {
          filled: result.filled,
          skipped: result.skipped,
          unmatched: result.unmatched,
          adapter: adapter.name
        }
      });

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
