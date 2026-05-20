export interface ContentstackField {
  uid: string;
  data_type: string;
  reference_to?: string[];
  field_metadata?: {
    rich_text_type?: boolean;
    allow_rich_text?: boolean;
  };
  schema?: ContentstackField[];
  blocks?: Array<{
    uid: string;
    title?: string;
    schema: ContentstackField[];
  }>;
}

export interface ContentstackContentType {
  uid: string;
  title: string;
  options?: {
    singleton?: boolean;
  };
  schema: ContentstackField[];
}

export interface ContentstackSchema {
  content_type: ContentstackContentType;
}

export interface CompactContentModel {
  uid: string;
  type: 'single' | 'multiple';
  url?: string;
  fields: Record<string, string>;
}

export interface ContentstackConfig {
  apiKey: string;
  deliveryToken: string;
  environment: string;
  region?: string;
  branch?: string;
  previewToken?: string;
  previewHost?: string;
  appHost?: string;
  livePreview?: boolean;
}
