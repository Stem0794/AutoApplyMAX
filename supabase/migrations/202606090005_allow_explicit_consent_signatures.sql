-- Community mappings contain field structure only. These keys identify the
-- kind of consent checkbox; each installation's boolean preference remains
-- local and is never submitted.

create or replace function public.is_allowed_mapping_profile_key(p_profile_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_profile_key = any (array[
    'salutation',
    'firstName',
    'lastName',
    'fullName',
    'email',
    'phoneCountryCode',
    'phone',
    'address',
    'city',
    'state',
    'zip',
    'country',
    'linkedinUrl',
    'githubUrl',
    'portfolioUrl',
    'currentTitle',
    'currentCompany',
    'yearsExperience',
    'education',
    'preferredLocations',
    'skills',
    'englishLevel',
    'startDate',
    'workAuthorization',
    'sponsorshipRequirement',
    'howDidYouHear',
    'coverLetter',
    'salaryExpectation',
    'gender',
    'ethnicity',
    'veteranStatus',
    'disabilityStatus',
    'privacyPolicyConsent',
    'futureOffersConsent',
    'dataProcessingConsent'
  ]::text[]);
$$;

comment on function public.is_allowed_mapping_profile_key(text) is
  'Allowlist for structural community mappings. Consent values are never submitted.';
