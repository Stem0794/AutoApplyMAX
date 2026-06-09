import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * ATS adapter UI contracts (BDD)
 *
 * Each platform below carries a `fixture` that represents the form layout the
 * adapter currently expects from the live site. Every field that an adapter
 * known-mapping should target is tagged with `data-expected="<profileKey>"`.
 *
 * The contract: every selector returned by `getKnownMappings()` must
 *   1. resolve to at least one field in the fixture, and
 *   2. only ever match fields tagged with the matching profile key.
 *
 * WHEN A SITE CHANGES ITS UI:
 *   Replace that platform's `fixture` with the new markup (copy/paste the new
 *   form's relevant inputs, keeping the `data-expected` tags on the fields you
 *   want autofilled). Run `npm run test:unit`. Any selector that no longer
 *   resolves is reported by name — that's your to-do list for updating the
 *   adapter in `src/content/adapters/<platform>.js`.
 */

const root = process.cwd();

function load(relativePath: string) {
  window.eval(readFileSync(path.join(root, relativePath), 'utf8'));
}

function aam(): any {
  return (window as any).AAM;
}

interface Platform {
  /** Adapter file under src/content/adapters/ */
  file: string;
  /** Registered adapter `name` */
  adapter: string;
  /** Representative markup of the live application form */
  fixture: string;
}

const PLATFORMS: Platform[] = [
  {
    file: 'ashby.js',
    adapter: 'Ashby',
    fixture: `
      <input name="_systemfield_name" data-expected="fullName">
      <input type="email" name="_systemfield_email" data-expected="email">
      <input name="phone" data-expected="phone">
      <input name="linkedin" data-expected="linkedinUrl">
      <input name="github" data-expected="githubUrl">
      <input name="portfolio" data-expected="portfolioUrl">
      <input type="file" data-expected="resumeFile">
      <input name="x_decoy_field" data-expected="DECOY">
    `,
  },
  {
    file: 'smartrecruiters.js',
    adapter: 'SmartRecruiters',
    fixture: `
      <input id="firstName" data-expected="firstName">
      <input id="lastName" data-expected="lastName">
      <input id="email" type="email" data-expected="email">
      <input id="phoneNumber" name="phoneNumber" data-expected="phone">
      <input name="linkedin" data-expected="linkedinUrl">
      <input type="file" data-expected="resumeFile">
      <input id="x_decoy_field" data-expected="DECOY">
    `,
  },
  {
    file: 'icims.js',
    adapter: 'iCIMS',
    fixture: `
      <input id="firstName_1" data-expected="firstName">
      <input id="lastName_1" data-expected="lastName">
      <input id="email_1" type="email" data-expected="email">
      <input id="homePhone" data-expected="phone">
      <input id="addressLine1" data-expected="address">
      <input id="city_1" data-expected="city">
      <input id="zipCode" data-expected="zip">
      <input type="file" data-expected="resumeFile">
      <input id="x_decoy_field" data-expected="DECOY">
    `,
  },
  {
    file: 'successfactors.js',
    adapter: 'SAP SuccessFactors',
    fixture: `
      <input id="sfFirstName_guid" data-expected="firstName">
      <input id="sfLastName_guid" data-expected="lastName">
      <input id="sfEmail_guid" type="email" data-expected="email">
      <input id="cellPhone_guid" data-expected="phone">
      <input type="file" data-expected="resumeFile">
      <input id="x_decoy_field" data-expected="DECOY">
    `,
  },
  {
    file: 'taleo.js',
    adapter: 'Oracle Taleo',
    fixture: `
      <input id="firstName_input" data-expected="firstName">
      <input id="lastName_input" data-expected="lastName">
      <input id="email_input" type="email" data-expected="email">
      <input id="telephone_input" data-expected="phone">
      <input id="city_input" data-expected="city">
      <input id="zipCode_input" data-expected="zip">
      <input type="file" data-expected="resumeFile">
      <input id="x_decoy_field" data-expected="DECOY">
    `,
  },
  {
    file: 'recruitee.js',
    adapter: 'Recruitee',
    fixture: `
      <input name="candidate[name]" data-expected="fullName">
      <input name="candidate[email]" type="email" data-expected="email">
      <input name="candidate[phone]" data-expected="phone">
      <textarea name="candidate[cover_letter]" data-expected="coverLetter"></textarea>
      <input name="linkedin" data-expected="linkedinUrl">
      <input type="file" data-expected="resumeFile">
      <input name="x_decoy_field" data-expected="DECOY">
    `,
  },
  {
    file: 'teamtailor.js',
    adapter: 'Teamtailor',
    fixture: `
      <input id="job_application_first_name" data-expected="firstName">
      <input id="job_application_last_name" data-expected="lastName">
      <input id="job_application_email" type="email" data-expected="email">
      <input id="job_application_phone" data-expected="phone">
      <input type="file" data-expected="resumeFile">
      <input id="x_decoy_field" data-expected="DECOY">
    `,
  },
  {
    file: 'jazzhr.js',
    adapter: 'JazzHR',
    fixture: `
      <input id="first_name" data-expected="firstName">
      <input id="last_name" data-expected="lastName">
      <input id="email" type="email" data-expected="email">
      <input id="phone" data-expected="phone">
      <input name="linkedin" data-expected="linkedinUrl">
      <input type="file" data-expected="resumeFile">
      <input id="x_decoy_field" data-expected="DECOY">
    `,
  },
  {
    file: 'breezy.js',
    adapter: 'Breezy HR',
    fixture: `
      <input name="name" data-expected="fullName">
      <input name="email" type="email" data-expected="email">
      <input name="phone" data-expected="phone">
      <textarea name="cover_letter" data-expected="coverLetter"></textarea>
      <input name="linkedin" data-expected="linkedinUrl">
      <input type="file" data-expected="resumeFile">
      <input name="x_decoy_field" data-expected="DECOY">
    `,
  },
  {
    file: 'jobvite.js',
    adapter: 'Jobvite',
    fixture: `
      <input id="firstname" data-expected="firstName">
      <input id="lastname" data-expected="lastName">
      <input id="email" type="email" data-expected="email">
      <input id="phone" data-expected="phone">
      <input type="file" data-expected="resumeFile">
      <input id="x_decoy_field" data-expected="DECOY">
    `,
  },
  {
    file: 'bamboohr.js',
    adapter: 'BambooHR',
    fixture: `
      <input name="firstName" data-expected="firstName">
      <input name="lastName" data-expected="lastName">
      <input name="email" type="email" data-expected="email">
      <input name="phone" data-expected="phone">
      <input name="addressLine" data-expected="address">
      <input name="city" data-expected="city">
      <input name="zipCode" data-expected="zip">
      <input type="file" data-expected="resumeFile">
      <input name="x_decoy_field" data-expected="DECOY">
    `,
  },
  {
    file: 'jobfluent.js',
    adapter: 'JobFluent',
    fixture: `
      <input autocomplete="name" data-expected="fullName">
      <input autocomplete="given-name" data-expected="firstName">
      <input autocomplete="family-name" data-expected="lastName">
      <input autocomplete="email" data-expected="email">
      <input autocomplete="tel" data-expected="phone">
      <input name="linkedin_url" data-expected="linkedinUrl">
      <textarea name="cover_letter" data-expected="coverLetter"></textarea>
      <input type="file" name="resume" data-expected="resumeFile">
      <input type="checkbox" name="privacy_policy_consent" data-expected="DECOY">
    `,
  },
  {
    file: 'bizneo.js',
    adapter: 'Bizneo HR',
    fixture: `
      <input type="email" name="inscription_form[user_form][email]" data-expected="email">
      <input name="inscription_form[user_form][first_name]" data-expected="firstName">
      <input name="inscription_form[user_form][last_name]" data-expected="lastName">
      <input name="inscription_form[user_form][phone]" data-expected="phone">
      <select name="inscription_form[user_form][country_code]" data-expected="country"></select>
      <select name="inscription_form[user_form][region_id]" data-expected="city"></select>
      <input type="file"
             name="inscription_form[user_form][assets_attributes][0][file]"
             data-expected="resumeFile">
      <input type="text" data-aam-bizneo="salary" data-expected="salaryExpectation">
      <input type="text" data-aam-bizneo="education" data-expected="education">
      <input type="text" data-aam-bizneo="motivation" data-expected="coverLetter">
      <input type="checkbox"
             name="inscription_form[terms_and_conditions]"
             data-expected="DECOY">
    `,
  },
];

/** Returns a human-readable failure per broken/over-broad known mapping. */
function contractFailures(adapter: any): string[] {
  const failures: string[] = [];
  for (const { selector, profileKey } of adapter.getKnownMappings()) {
    const matched = Array.from(document.querySelectorAll(selector)) as HTMLElement[];

    if (matched.length === 0) {
      failures.push(`"${selector}" (→ ${profileKey}) matched no field`);
      continue;
    }
    const misrouted = matched.filter(el => el.dataset.expected !== profileKey);
    if (misrouted.length > 0) {
      const tags = misrouted.map(el => el.dataset.expected ?? '∅').join(', ');
      failures.push(`"${selector}" (→ ${profileKey}) also matched: ${tags}`);
    }
  }
  return failures;
}

describe('ATS adapter UI contracts', () => {
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
  });

  for (const platform of PLATFORMS) {
    describe(`${platform.adapter} application form`, () => {
      beforeEach(() => {
        load(`src/content/adapters/${platform.file}`);
      });

      it('is registered as an adapter', () => {
        const adapter = aam().Adapters.find((a: any) => a.name === platform.adapter);
        expect(adapter, `adapter "${platform.adapter}" not registered`).toBeDefined();
      });

      it('GIVEN the known layout WHEN selectors run THEN every field maps to its profile field', () => {
        document.body.innerHTML = platform.fixture;
        const adapter = aam().Adapters.find((a: any) => a.name === platform.adapter);

        const failures = contractFailures(adapter);
        expect(
          failures,
          `\n${platform.adapter} selectors are out of sync with its form fixture:\n  - ${failures.join('\n  - ')}\n` +
            `Update src/content/adapters/${platform.file} (or the fixture if the site changed).`
        ).toEqual([]);
      });

      it('GIVEN a changed layout (ids/names dropped) WHEN selectors run THEN drift is detected', () => {
        document.body.innerHTML = platform.fixture;
        // Simulate the site renaming/removing its field identifiers.
        for (const el of document.querySelectorAll('input, textarea')) {
          el.removeAttribute('id');
          el.removeAttribute('name');
        }
        const adapter = aam().Adapters.find((a: any) => a.name === platform.adapter);

        // At least one id/name-based selector must now fail — proving the
        // contract catches a real UI change rather than silently passing.
        expect(contractFailures(adapter).length).toBeGreaterThan(0);
      });
    });
  }
});
