export type Sensitivity = 'standard' | 'sensitive' | 'document';

export interface ProfileFieldDefinition {
  key: string;
  label: string;
  type: string;
  group: 'personal' | 'professional' | 'additional';
  sensitivity: Sensitivity;
  autofillable: boolean;
  cloudMappable: boolean;
  requiresConfirmation: boolean;
  maxLength: number;
  keywords: string[];
  aliases: RegExp[];
}

export interface Profile {
  [key: string]: string | ResumeAsset | undefined;
  resumeAsset?: ResumeAsset;
}

export interface ProfileStorageRecord {
  schemaVersion: number;
  profile: Profile;
}

export interface ResumeAsset {
  id: string;
  name: string;
  mime: string;
  size: number;
  updatedAt: string;
}

export interface SiteScope {
  adapter: string;
  origin: string;
  tenant: string;
  pathPrefix?: string;
}

export interface FieldSignature {
  v: 1;
  tag: string;
  type: string;
  autocomplete: string;
  name: string;
  label: string;
}

export interface MappingRecord {
  siteKey: string;
  fieldSignature: string;
  profileKey: string;
  source: 'local' | 'community';
  status: 'pending' | 'approved' | 'rejected';
  confidence: number;
}

export interface AutofillRequest {
  type: 'aam:trigger_autofill';
  requestId: string;
  tabId: number;
  expectedOrigin: string;
}

export interface SaveMappingRequest {
  type: 'aam:storage_operation';
  operation: 'saveMapping';
  siteKey: string;
  selector: string;
  fieldSignature: string;
  profileKey: string;
}

export interface DownloadResumeRequest {
  type: 'aam:download_resume';
  assetId: string;
  filename: string;
}

export interface LogApplicationRequest {
  type: 'aam:storage_operation';
  operation: 'logAppliedJob';
  entry: {
    jobTitle: string;
    company: string;
    url: string;
    ats: string;
    trigger: 'form-submit';
    status: 'pending';
  };
}
