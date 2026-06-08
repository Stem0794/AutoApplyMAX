import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Adapter drift detection (BDD)
 *
 * `AAM.Autofill.detectAdapterDrift` decides whether a known adapter has gone
 * stale: it declared field mappings, the page has a form, yet none of the
 * adapter's selectors resolved. That signal is what nudges the user and feeds
 * maintainer telemetry.
 */

const root = process.cwd();

function load(relativePath: string) {
  window.eval(readFileSync(path.join(root, relativePath), 'utf8'));
}

function aam(): any {
  return (window as any).AAM;
}

const KNOWN_MAPPINGS = [
  { selector: '#firstName', profileKey: 'firstName' },
  { selector: '#email', profileKey: 'email' },
];

describe('AAM.Autofill.detectAdapterDrift', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    delete (window as any).AAM;
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: () => Promise.resolve({}),
        onMessage: { addListener: () => {} },
      },
    };
    load('src/shared/constants.js');
    load('src/shared/profile-schema.js');
    load('src/content/adapters/adapter-base.js');
    // autofill.js calls AAM.Autofill.init() (registers a listener) on load.
    load('src/content/field-detector.js');
    load('src/content/field-filler.js');
    load('src/content/overlay.js');
    load('src/content/learning-engine.js');
    load('src/content/autofill.js');
  });

  it('GIVEN a known adapter whose selectors matched nothing WHEN fields exist THEN drift is reported with the missing keys', () => {
    const detected = [
      { profileKey: 'firstName', source: 'heuristic' },
      { profileKey: null, source: 'unmatched' },
    ];
    const drift = aam().Autofill.detectAdapterDrift(detected, { name: 'Ashby' }, KNOWN_MAPPINGS);
    expect(drift).not.toBeNull();
    expect(drift.adapter).toBe('Ashby');
    // firstName was resolved by heuristics; email was not → reported missing.
    expect(drift.missingProfileKeys).toContain('email');
    expect(drift.missingProfileKeys).not.toContain('firstName');
  });

  it('GIVEN at least one adapter-sourced match WHEN checked THEN no drift', () => {
    const detected = [
      { profileKey: 'firstName', source: 'adapter' },
      { profileKey: null, source: 'unmatched' },
    ];
    expect(
      aam().Autofill.detectAdapterDrift(detected, { name: 'Ashby' }, KNOWN_MAPPINGS)
    ).toBeNull();
  });

  it('GIVEN the Generic adapter THEN never reports drift', () => {
    const detected = [{ profileKey: null, source: 'unmatched' }];
    expect(
      aam().Autofill.detectAdapterDrift(detected, { name: 'Generic' }, KNOWN_MAPPINGS)
    ).toBeNull();
  });

  it('GIVEN no detected fields THEN no drift (page may not have loaded the form)', () => {
    expect(aam().Autofill.detectAdapterDrift([], { name: 'Ashby' }, KNOWN_MAPPINGS)).toBeNull();
  });

  it('GIVEN an adapter with no known mappings THEN no drift', () => {
    const detected = [{ profileKey: null, source: 'unmatched' }];
    expect(
      aam().Autofill.detectAdapterDrift(detected, { name: 'SAP SuccessFactors' }, [])
    ).toBeNull();
  });
});
