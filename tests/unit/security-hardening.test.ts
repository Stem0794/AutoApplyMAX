import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validateSubmitBody } from '../../supabase/functions/_shared/validation';

const root = process.cwd();

function load(relativePath: string) {
  window.eval(readFileSync(path.join(root, relativePath), 'utf8'));
}

function aam(): any {
  return (window as any).AAM;
}

describe('public-release security boundaries', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    delete (window as any).AAM;
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({}),
        onMessage: { addListener: vi.fn() },
      },
    };
    (globalThis as any).CSS ??= {};
    (globalThis as any).CSS.escape = (value: string) =>
      value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
    load('src/shared/constants.js');
    load('src/shared/profile-schema.js');
  });

  it('recognizes supported origins without accepting lookalikes', () => {
    expect(aam().getSupportedATS('https://jobs.lever.co/acme/job')).toBe('LEVER');
    expect(aam().getSupportedATS('https://linkedin.com.attacker.example/jobs')).toBeNull();
    expect(aam().getSupportedATS('http://jobs.lever.co/acme/job')).toBeNull();
  });

  it('keeps internal and sensitive fields out of community mappings', () => {
    expect(aam().PROFILE_MAP.resumeFileContent).toBeUndefined();
    expect(aam().PROFILE_MAP.resumeFileName).toBeUndefined();
    expect(aam().PROFILE_MAP.resumeFile.cloudMappable).toBe(false);
    expect(aam().PROFILE_MAP.salaryExpectation.cloudMappable).toBe(false);
    expect(aam().PROFILE_MAP.ethnicity.requiresConfirmation).toBe(true);
    expect(aam().PROFILE_MAP.privacyPolicyConsent.autofillable).toBe(false);
  });

  it('matches adapter selectors against elements and requires semantic agreement for community data', () => {
    load('src/content/adapters/adapter-base.js');
    load('src/content/field-detector.js');
    document.body.innerHTML = `
      <label for="first">First name</label>
      <input id="first" name="candidate_first">
      <label for="salary">Unrelated value</label>
      <input id="salary" name="unrelated">
    `;
    for (const element of document.querySelectorAll('input')) {
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        width: 200,
        height: 30,
        top: 0,
        left: 0,
        right: 200,
        bottom: 30,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    }

    const first = document.getElementById('first') as HTMLInputElement;
    const salary = document.getElementById('salary') as HTMLInputElement;
    const firstSignature = aam().FieldDetector.buildSignature(first);
    const salarySignature = aam().FieldDetector.buildSignature(salary);
    const results = aam().FieldDetector.detectFields(
      {
        localMappings: {},
        communityMappings: {
          [firstSignature]: { profileKey: 'firstName', source: 'community', confidence: 0.75 },
          [salarySignature]: { profileKey: 'email', source: 'community', confidence: 0.75 },
        },
      },
      [{ selector: '#first', profileKey: 'firstName' }]
    );

    expect(results.find((result: any) => result.element === first).source).toBe('adapter');
    expect(results.find((result: any) => result.element === salary).profileKey).not.toBe('email');
  });

  it('never embeds resume bytes in page DOM and ignores synthetic download clicks', async () => {
    load('src/content/adapters/adapter-base.js');
    aam().getAdapter = () => ({ fillField: async () => false });
    load('src/content/field-filler.js');
    document.body.innerHTML = '<input id="resume" type="file">';
    const input = document.getElementById('resume') as HTMLInputElement;

    await aam().FieldFiller.fillFields(
      [
        {
          element: input,
          selector: '#resume',
          profileKey: 'resumeFile',
          confidence: 1,
          displayLabel: 'Resume',
          source: 'adapter',
        },
      ],
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        resumeAsset: {
          id: 'asset-id',
          name: 'resume.pdf',
          mime: 'application/pdf',
          size: 20,
        },
      }
    );

    expect(document.body.innerHTML).not.toContain('data-filecontent');
    expect(document.body.innerHTML).not.toContain('JVBER');
    (document.querySelector('.aam-download-btn') as HTMLButtonElement).click();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('marks fields before extension-generated input events are dispatched', () => {
    load('src/content/adapters/adapter-base.js');
    load('src/content/field-filler.js');
    const input = document.createElement('input');
    document.body.appendChild(input);
    let markerDuringInput = false;
    input.addEventListener('input', () => {
      markerDuringInput = input.dataset.aamFilled === 'true';
    });
    aam().FieldFiller.setNativeValue(input, 'value');
    expect(markerDuringInput).toBe(true);
  });

  it('does not run the proactive trigger from a synthetic click', () => {
    load('src/content/overlay.js');
    const callback = vi.fn();
    aam().Overlay.showTrigger(callback);
    (document.getElementById('aam-trigger-btn') as HTMLButtonElement).click();
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not save trainer mappings from synthetic change events', async () => {
    load('src/content/adapters/adapter-base.js');
    load('src/content/field-filler.js');
    load('src/content/overlay.js');
    aam().Storage = { saveMapping: vi.fn().mockResolvedValue(true) };
    const input = document.createElement('input');
    input.id = 'unknown';
    document.body.appendChild(input);
    aam().Overlay.show(
      { filled: 0, skipped: 0 },
      [
        {
          element: input,
          selector: '#unknown',
          signature: '{"v":1}',
          profileKey: null,
          confidence: 0,
          context: 'unknown',
          displayLabel: 'Unknown',
          source: 'unmatched',
        },
      ],
      'greenhouse:boards.greenhouse.io:acme'
    );
    const select = document.querySelector('.aam-train-select') as HTMLSelectElement;
    select.value = 'email';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(aam().Storage.saveMapping).not.toHaveBeenCalled();
  });

  it('does not log history from synthetic submit events', async () => {
    aam().Storage = {
      logAppliedJob: vi.fn().mockResolvedValue(true),
      getAppliedJobs: vi.fn().mockResolvedValue([]),
    };
    aam().getAdapter = () => ({ name: 'Greenhouse' });
    load('src/content/application-logger.js');
    const form = document.createElement('form');
    form.id = 'application_form';
    document.body.appendChild(form);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(aam().Storage.logAppliedJob).not.toHaveBeenCalled();
  });

  it('uses minimum manifest host access', () => {
    const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    expect(manifest.host_permissions).not.toContain('https://*/*');
    expect(manifest.content_scripts[0].all_frames).toBe(false);
    expect(manifest.permissions).toContain('downloads');
  });

  it('neutralizes spreadsheet formulas during CSV export', () => {
    load('src/shared/storage.js');
    load('src/options/options.js');
    expect((window as any).csvEscape('=HYPERLINK("https://invalid")')).toContain('"\'=');
    expect((window as any).csvEscape('@SUM(1,2)')).toContain("'@SUM");
  });

  it('accepts only normalized non-sensitive community mapping submissions', () => {
    const installationId = 'c8b22106-f267-4c74-b8b4-63131f91781f';
    const validSignature = JSON.stringify({
      v: 1,
      tag: 'input',
      type: 'email',
      autocomplete: 'email',
      name: 'email',
      label: 'email address',
    });
    expect(
      validateSubmitBody({
        installationId,
        mappings: [
          {
            siteKey: 'greenhouse:boards.greenhouse.io:acme',
            fieldSignature: validSignature,
            profileKey: 'email',
          },
        ],
      }).value
    ).toBeDefined();
    expect(
      validateSubmitBody({
        installationId,
        mappings: [
          {
            siteKey: 'greenhouse:boards.greenhouse.io:acme',
            fieldSignature: '#email',
            profileKey: 'email',
          },
        ],
      }).error
    ).toBeDefined();
    expect(
      validateSubmitBody({
        installationId,
        mappings: [
          {
            siteKey: 'greenhouse:boards.greenhouse.io:acme',
            fieldSignature: validSignature.replace('email address', 'salary expectation'),
            profileKey: 'salaryExpectation',
          },
        ],
      }).error
    ).toBeDefined();
  });
});
