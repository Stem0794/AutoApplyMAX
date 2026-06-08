import { expect, test } from '../fixtures/extension';

test('trusted prefill fills ordinary fields but leaves sensitive fields for confirmation', async ({
  context,
  serviceWorker,
}) => {
  await context.route('https://boards.greenhouse.io/**', route => {
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html>
        <html><body>
          <form id="application_form">
            <label for="first_name">First name</label>
            <input id="first_name">
            <label for="salary">Salary expectation</label>
            <input id="salary" name="salary_expectation">
            <label for="resume_upload">Resume</label>
            <input id="resume_upload" type="file">
          </form>
        </body></html>`,
    });
  });

  await serviceWorker.evaluate(async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await chrome.storage.local.get('aam_schema_version');
      if (result.aam_schema_version === 2) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await chrome.storage.local.set({
      aam_user_profile: {
        firstName: 'Ada',
        salaryExpectation: '100000',
        resumeAsset: {
          id: 'opaque-resume-id',
          name: 'resume.pdf',
          mime: 'application/pdf',
          size: 100,
          updatedAt: new Date().toISOString(),
        },
      },
      aam_settings: {
        showProactiveTrigger: true,
        showOverlay: true,
        highlightFilled: true,
      },
    });
  });

  const page = await context.newPage();
  await page.goto('https://boards.greenhouse.io/acme/jobs/123');
  await page.getByRole('button', { name: 'Prefill Form' }).click();

  await expect(page.locator('#first_name')).toHaveValue('Ada');
  await expect(page.locator('#salary')).toHaveValue('');
  await expect(page.locator('.aam-download-btn')).toBeVisible();
  await expect(page.locator('[data-filecontent]')).toHaveCount(0);
  await page.getByRole('button', { name: /Fix .* Review Fields/ }).click();
  await expect(page.getByText('Confirmation Required')).toBeVisible();
});
