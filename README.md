# AutoApplyMAX

AutoApplyMAX is a Chrome extension that helps fill job application forms from a reusable local profile. It combines ATS-specific adapters, general field detection, locally learned mappings, and reviewed community mappings.

AutoApplyMAX fills forms but does not submit applications for you. Review every field before submitting.

## Supported Sites

AutoApplyMAX includes dedicated support for these application hosts:

| Platform | Supported hosts |
| --- | --- |
| LinkedIn | `linkedin.com`, `www.linkedin.com` |
| Greenhouse | `boards.greenhouse.io`, `jobs.greenhouse.io` |
| Lever | `jobs.lever.co` |
| Workday | `*.myworkdayjobs.com`, `*.workday.com` |
| HireHive | `*.hirehive.com` |
| Zoho Recruit | `*.zohorecruit.com`, `*.zohorecruit.eu` |
| Revolut Careers | `www.revolut.com/careers/apply/*` |
| Workable | `apply.workable.com` |
| Mainder | `*.mainder.ai` |

Application forms change frequently. A supported host can still contain custom fields that require manual review or training.

## Privacy

Your profile, settings, locally learned field mappings, and application history are stored in `chrome.storage.local`. Resume bytes are stored separately in extension-owned IndexedDB. AutoApplyMAX does not upload your profile, resume, answers, or application history to the community service.

The extension can use a centrally operated community service for reusable field mappings. Community submissions contain an ATS/site scope, a normalized field signature, and a non-sensitive profile-field key. Raw selectors are kept locally. Submissions are manually moderated before distribution.

See [PRIVACY.md](PRIVACY.md) for the Chrome Web Store privacy policy draft.

## Install From Source

Requirements:

- A current Node.js LTS release
- npm
- Google Chrome or another Chromium-based browser

```sh
npm ci
AAM_COMMUNITY_API_URL=https://your-project.supabase.co \
AAM_COMMUNITY_PUBLISHABLE_KEY=your-publishable-key \
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the generated `dist` directory.

The community service is centrally configured by the distributed extension. End users do not need to create a backend project or provide service credentials.

## Development And Release Checks

Before packaging a release, run:

```sh
npm run typecheck
npm run lint
npm run test
npm run build
npm run package
```

- `typecheck` validates static types.
- `lint` checks source and configuration files.
- `test` runs the automated test suite.
- `build` creates the unpacked extension in `dist`.
- `package` creates the Chrome Web Store upload artifact.

## Main Features

- ATS-specific adapters and heuristic field detection
- One-click prefill with a review-before-submit workflow
- Local profile and resume storage
- Local learning for previously unknown fields
- Manually moderated community field mappings
- Local application history with export controls

## Contributing

Open an issue for a broken form or unsupported application host. Include the application host and a description of the field, but do not post personal data, resume contents, or completed application answers.

Run all release checks before submitting a pull request.

## License

Licensed under the [MIT License](LICENSE).
