export const ALLOWED_PROFILE_KEYS = new Set([
  "salutation",
  "firstName",
  "lastName",
  "fullName",
  "email",
  "phoneCountryCode",
  "phone",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "linkedinUrl",
  "githubUrl",
  "portfolioUrl",
  "currentTitle",
  "currentCompany",
  "yearsExperience",
  "education",
  "preferredLocations",
  "skills",
  "englishLevel",
  "startDate",
  "workAuthorization",
  "sponsorshipRequirement",
  "howDidYouHear",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SITE_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9._:/-]*[a-z0-9])?$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const RESTRICTED_SIGNATURE_PATTERN =
  /(^|[^a-z0-9])(resume|curriculum|cv|salary|compensation|wage|pay|privacy|consent|eeo|demographic|race|racial|ethnicity|ethnic|gender|sex|disability|disabled|veteran|military)([^a-z0-9]|$)/i;

export interface MappingInput {
  siteKey: string;
  fieldSignature: string;
  profileKey: string;
}

export interface SubmitMappingsBody {
  installationId: string;
  mappings: MappingInput[];
}

export interface ValidationResult {
  value?: SubmitMappingsBody;
  error?: string;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length &&
    keys.every((key, index) => key === expected[index]);
}

export function validateSubmitBody(body: unknown): ValidationResult {
  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    !hasOnlyKeys(body as Record<string, unknown>, [
      "installationId",
      "mappings",
    ])
  ) {
    return { error: "Body must contain only installationId and mappings" };
  }

  const candidate = body as Record<string, unknown>;
  if (
    typeof candidate.installationId !== "string" ||
    !UUID_PATTERN.test(candidate.installationId)
  ) {
    return { error: "installationId must be a UUID" };
  }

  if (
    !Array.isArray(candidate.mappings) ||
    candidate.mappings.length < 1 ||
    candidate.mappings.length > 100
  ) {
    return { error: "mappings must contain between 1 and 100 items" };
  }

  const mappings: MappingInput[] = [];

  for (const rawMapping of candidate.mappings) {
    if (
      !rawMapping || typeof rawMapping !== "object" ||
      Array.isArray(rawMapping) ||
      !hasOnlyKeys(rawMapping as Record<string, unknown>, [
        "profileKey",
        "fieldSignature",
        "siteKey",
      ])
    ) {
      return {
        error: "Each mapping must contain only siteKey, fieldSignature, and profileKey",
      };
    }

    const mapping = rawMapping as Record<string, unknown>;
    if (
      typeof mapping.siteKey !== "string" ||
      typeof mapping.fieldSignature !== "string" ||
      typeof mapping.profileKey !== "string"
    ) {
      return { error: "Mapping fields must be strings" };
    }

    const siteKey = mapping.siteKey.trim().toLowerCase();
    const fieldSignature = mapping.fieldSignature.trim();
    const profileKey = mapping.profileKey.trim();

    if (
      siteKey.length < 1 ||
      siteKey.length > 253 ||
      !SITE_KEY_PATTERN.test(siteKey) ||
      siteKey.includes("..")
    ) {
      return { error: `Invalid siteKey: ${mapping.siteKey}` };
    }

    if (
      fieldSignature.length < 1 ||
      fieldSignature.length > 1000 ||
      CONTROL_CHARACTER_PATTERN.test(fieldSignature)
    ) {
      return { error: "fieldSignature must be 1-1000 printable characters" };
    }

    if (!ALLOWED_PROFILE_KEYS.has(profileKey)) {
      return { error: `profileKey is not allowed: ${profileKey}` };
    }

    try {
      const parsed = JSON.parse(fieldSignature) as Record<string, unknown>;
      const expectedKeys = [
        "autocomplete",
        "label",
        "name",
        "tag",
        "type",
        "v",
      ];
      if (
        !hasOnlyKeys(parsed, expectedKeys) ||
        parsed.v !== 1 ||
        !["input", "select", "textarea"].includes(String(parsed.tag)) ||
        ["type", "autocomplete", "name", "label"].some(
          (key) =>
            typeof parsed[key] !== "string" ||
            String(parsed[key]).length > 120,
        )
      ) {
        return { error: "fieldSignature has an unsupported schema" };
      }
      const normalizedSignature = JSON.stringify({
        v: 1,
        tag: parsed.tag,
        type: parsed.type,
        autocomplete: parsed.autocomplete,
        name: parsed.name,
        label: parsed.label,
      });
      if (RESTRICTED_SIGNATURE_PATTERN.test(normalizedSignature)) {
        return { error: "fieldSignature refers to a restricted field category" };
      }
      mappings.push({
        siteKey,
        fieldSignature: normalizedSignature,
        profileKey,
      });
    } catch {
      return { error: "fieldSignature must be normalized JSON" };
    }
  }

  return {
    value: {
      installationId: candidate.installationId.toLowerCase(),
      mappings,
    },
  };
}

export function validateSiteKey(value: string | null): string | null {
  if (!value) return null;
  const siteKey = value.trim().toLowerCase();
  if (
    siteKey.length < 1 ||
    siteKey.length > 253 ||
    !SITE_KEY_PATTERN.test(siteKey) ||
    siteKey.includes("..")
  ) {
    return null;
  }
  return siteKey;
}
