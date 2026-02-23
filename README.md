# 🚀 AutoApplyMAX

**Smart Job Application Automation for Modern Candidates.**

AutoApplyMAX is a powerful browser extension designed to eliminate the repetitive drudgery of job hunting. By leveraging intelligent field detection, a local-first profile system, and community-driven cloud matching, it empowers you to fill out complex job applications in seconds.

---

## 🌟 Why AutoApplyMAX?

- **Save Hours Daily**: Turn 10-minute forms into 10-second clicks.
- **Proactive Intelligence**: Detects when you land on a job site and offers a one-click "Prefill" button.
- **Support for Major Platforms**: Seamlessly works with Greenhouse, Lever, Workday, Zoho Recruit, and more.
- **Hybrid Matching**: Combines local heuristics with community-shared mappings via Supabase.
- **Privacy First**: Your personal data stays on **your** device. Cloud syncing is limited to anonymous form field selectors.

---

## 🏗 Supported Platforms

AutoApplyMAX provides optimized support for:
- [x] **LinkedIn** (Easy Apply & external)
- [x] **Greenhouse** (`boards.greenhouse.io`, `jobs.greenhouse.io`)
- [x] **Lever** (`jobs.lever.co`)
- [x] **Workday** (`*.myworkdayjobs.com`)
- [x] **HireHive** (`*.hirehive.com`)
- [x] **Zoho Recruit** (`*.zohorecruit.eu`, `*.zohorecruit.com`)
- [ ] *More platforms coming soon!*

---

## ✨ Features

- **Proactive Prefill**: A sleek, floating trigger appears automatically on supported sites, making autofill faster than ever.
- **Cloud Sync (Supabase)**: Opt-in to share and receive field mappings from the community. If one person "teaches" the extension a new field, everyone benefits.
- **Resume Upload Helper**: Due to browser security, automatic file injection is restricted. We provide a premium "Manual Upload Helper" that gives you a one-click download of your CV right next to the upload button.
- **Advanced Field Training**: Use the built-in "Trainer" overlay to map unknown fields. See exactly what the engine matched and what's missing from your profile.
- **Heuristic Detection Engine**: High-confidence matching for "Years of Experience," "English Level," "Work Authorization," and dozens more.
- **Application History**: Automatically logs every job you submit for easy tracking.

---

## 🛠 Setup & Cloud Sync

### 1. Installation
1. Download the latest release.
2. Unzip the archive.
3. Open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**.

### 2. Configure Supabase (Optional)
To enable shared community mappings:
1. Create a free project at [Supabase.com](https://supabase.com).
2. Create a table named `field_mappings` with the following schema:
   - `id`: int8 (Primary Key, Identity)
   - `site_key`: text
   - `selector`: text
   - `profile_key`: text
   - `created_at`: timestamptz (default: now())
3. Copy your **Project URL** and **Anon Key** into the AutoApplyMAX **Settings** tab.
4. Click **Sync with Cloud** in the "Learned Mappings" tab to contribute your findings.

---

## 🔒 Privacy & Security

- **Local Storage**: Your personal profile (Name, Email, Phone, etc.) is **never** sent to the cloud. It stays on your machine.
- **Anonymous Mappings**: Only form field selectors (e.g., `#first_name`) and their corresponding profile labels are synced to Supabase. No user data is ever included in these mappings.
- **Zero Tracking**: No analytics, no tracking pixels, no telemetry.

---

## 🤝 Contributing

We welcome contributions!
- **Add Adapters**: Help us support more ATS platforms by contributing to `src/content/adapters/`.
- **Improve Heuristics**: Update `src/shared/profile-schema.js` with move keywords or regex patterns.
- **Feedback**: Open an issue if a specific site isn't being recognized correctly.

---

## 📄 License

This project is licensed under the MIT License.
