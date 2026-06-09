/**
 * AutoApplyMAX — Bizneo HR Adapter
 *
 * Handles application forms hosted on tenant.careers.ats.bizneo.cloud.
 * Legal terms remain a manual applicant action.
 */
(function () {
  const BizneoAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'Bizneo HR',

    matches() {
      return (
        AAM.isExactOrSubdomain(window.location.hostname, 'careers.ats.bizneo.cloud') &&
        window.location.pathname.startsWith('/jobs/')
      );
    },

    getSiteKey() {
      const tenant =
        window.location.hostname
          .toLowerCase()
          .replace(/\.careers\.ats\.bizneo\.cloud$/, '') || 'unknown';
      return `bizneo:${tenant}`;
    },

    async prepare() {
      const formSelector =
        '#inscription_form_user_form_email, ' +
        'input[name="inscription_form[user_form][email]"]';
      if (!document.querySelector(formSelector)) {
        const applyButton = [...document.querySelectorAll('button')].find(
          button => button.textContent.trim().toLowerCase() === 'inscribirme'
        );
        if (applyButton) applyButton.click();
        await this.waitForElement(formSelector, 2000);
      }

      // Bizneo renders Select2 mirrors and one input per radio option. They are
      // not independently fillable profile fields and otherwise pollute review.
      for (const control of document.querySelectorAll(
        'input[type="radio"], ' +
          'input[type="checkbox"], ' +
          'span[role="combobox"], ' +
          'input[name="inscription_form[terms_and_conditions]"]'
      )) {
        control.dataset.aamIgnore = 'true';
      }

      for (const input of document.querySelectorAll(
        'input[name*="responses_attributes"][name$="[response]"]'
      )) {
        const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
        const text = label?.textContent?.trim().toLowerCase() || '';
        if (/salari|sueldo|compensaci/.test(text)) {
          input.dataset.aamBizneo = 'salary';
        } else if (/formaci[oó]n acad[eé]mica|nivel de estudios|titulaci[oó]n/.test(text)) {
          input.dataset.aamBizneo = 'education';
        } else if (/por qué.*interesa|motivaci/.test(text)) {
          input.dataset.aamBizneo = 'motivation';
        }
      }
    },

    getKnownMappings() {
      return [
        {
          selector: 'input[name="inscription_form[user_form][email]"]',
          profileKey: 'email',
        },
        {
          selector: 'input[name="inscription_form[user_form][first_name]"]',
          profileKey: 'firstName',
        },
        {
          selector: 'input[name="inscription_form[user_form][last_name]"]',
          profileKey: 'lastName',
        },
        {
          selector: 'input[name="inscription_form[user_form][phone]"]',
          profileKey: 'phone',
        },
        {
          selector: 'select[name="inscription_form[user_form][country_code]"]',
          profileKey: 'country',
        },
        {
          selector: 'select[name="inscription_form[user_form][region_id]"]',
          profileKey: 'city',
        },
        {
          selector:
            'input[type="file"][name="inscription_form[user_form][assets_attributes][0][file]"]',
          profileKey: 'resumeFile',
        },
        {
          selector: 'input[data-aam-bizneo="salary"]',
          profileKey: 'salaryExpectation',
        },
        {
          selector: 'input[data-aam-bizneo="education"]',
          profileKey: 'education',
        },
        {
          selector: 'input[data-aam-bizneo="motivation"]',
          profileKey: 'coverLetter',
        },
      ];
    },
  });

  AAM.registerAdapter(BizneoAdapter);
})();
