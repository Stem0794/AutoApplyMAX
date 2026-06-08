import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * "Request a new field" (BDD)
 *
 * The ⚡ zap picker offers a "Request a new field…" option. Selecting it reveals
 * a name/note form; confirming sends an AAM.Storage.requestField call with the
 * user-authored label and the structural signature — never a profile value.
 */

const root = process.cwd();

function load(relativePath: string) {
  window.eval(readFileSync(path.join(root, relativePath), 'utf8'));
}

function aam(): any {
  return (window as any).AAM;
}

describe('Overlay new-field request', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    delete (window as any).AAM;
    (globalThis as any).chrome = {
      runtime: { sendMessage: vi.fn().mockResolvedValue({}), onMessage: { addListener: vi.fn() } },
    };
    load('src/shared/constants.js');
    load('src/shared/profile-schema.js');
    load('src/content/adapters/adapter-base.js');
    load('src/content/field-filler.js');
    load('src/content/overlay.js');
  });

  function showOverlayWithField() {
    const input = document.createElement('input');
    input.id = 'mystery';
    document.body.appendChild(input);
    aam().Overlay.show(
      { filled: 0, skipped: 0 },
      [
        {
          element: input,
          selector: '#mystery',
          signature:
            '{"v":1,"tag":"input","type":"text","autocomplete":"","name":"x","label":"notice period"}',
          profileKey: null,
          confidence: 0,
          context: 'notice period',
          displayLabel: 'Notice period',
          source: 'unmatched',
        },
      ],
      'greenhouse:boards.greenhouse.io:acme'
    );
  }

  it('GIVEN the request option WHEN selected THEN the name form appears prefilled with the field label', () => {
    showOverlayWithField();
    const picker = document.querySelector('.aam-zap-picker') as HTMLElement;
    picker.hidden = false;
    const select = document.querySelector('.aam-zap-select') as HTMLSelectElement;
    select.value = '__request__';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const requestForm = document.querySelector('.aam-zap-request') as HTMLElement;
    expect(requestForm.hidden).toBe(false);
    const labelInput = document.querySelector('.aam-zap-req-label') as HTMLInputElement;
    expect(labelInput.value).toBe('Notice period');
  });

  it('GIVEN Storage.requestField WHEN called THEN it forwards only label/note/siteKey/signature — no profile values', async () => {
    load('src/shared/storage.js');
    const sendMessage = (globalThis as any).chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    sendMessage.mockResolvedValue({ requested: true });

    await aam().Storage.requestField({
      suggestedLabel: 'Notice period',
      note: 'Number of weeks before I can start',
      siteKey: 'greenhouse:boards.greenhouse.io:acme',
      signature:
        '{"v":1,"tag":"input","type":"text","autocomplete":"","name":"x","label":"notice period"}',
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const msg = sendMessage.mock.calls[0][0];
    expect(msg.type).toBe(aam().CONSTANTS.MSG.REQUEST_FIELD);
    expect(msg.suggestedLabel).toBe('Notice period');
    expect(msg.note).toBe('Number of weeks before I can start');
    expect(msg.siteKey).toBe('greenhouse:boards.greenhouse.io:acme');
    expect(msg.signature).toContain('"label":"notice period"');
    // The message shape contains no profile value keys.
    expect(Object.keys(msg).sort()).toEqual(
      ['note', 'signature', 'siteKey', 'suggestedLabel', 'type'].sort()
    );
  });

  it('GIVEN an empty field name THEN the send button stays disabled', () => {
    aam().Storage = { saveMapping: vi.fn(), requestField: vi.fn() };
    showOverlayWithField();
    const picker = document.querySelector('.aam-zap-picker') as HTMLElement;
    picker.hidden = false;
    const select = document.querySelector('.aam-zap-select') as HTMLSelectElement;
    select.value = '__request__';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const labelInput = document.querySelector('.aam-zap-req-label') as HTMLInputElement;
    labelInput.value = '';
    labelInput.dispatchEvent(new Event('input', { bubbles: true }));

    const confirmBtn = document.querySelector('.aam-zap-confirm') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });
});
