/** Stable display snapshot. `value` is the comparison key; the rest is display data. */
export interface LabeledValue {
  label: string;
  value: string;
  description?: string;
  color?: string;
}

export interface DataFieldOption extends LabeledValue {
  children?: DataFieldOption[];
}

export interface ResourceReferenceValue extends LabeledValue {
  resourceCode: string;
  /** Non-authoritative display JSON captured at selection time. */
  snapshot?: Record<string, unknown>;
}

export interface DepartmentReferenceValue extends LabeledValue {
  fullPath?: string;
  path?: LabeledValue[];
  parent?: LabeledValue;
}

export interface UserReferenceValue extends LabeledValue {
  avatarUrl?: string;
  employeeNo?: string;
  title?: string;
  mobile?: string;
  email?: string;
  departments?: DepartmentReferenceValue[];
}

export interface DateRangeValue {
  start: string;
  end: string;
}

export type CascadePathValue = LabeledValue[];

export interface ManagedFileValue {
  id: string;
  name: string;
  size: number;
  contentType: string;
}

export interface ManagedImageValue extends ManagedFileValue {
  width: number;
  height: number;
  thumbnailUrl: string;
  previewUrl: string;
}

export interface AttachmentVariant {
  url: string;
  objectName?: string;
  bucketName?: string;
  width?: number;
  height?: number;
  size?: number;
  contentType?: string;
}

/** Stable platform attachment value stored in Data API JSONB/file fields. */
export interface StableAttachmentValue {
  name: string;
  url: string;
  size?: number;
  type?: string;
  provider?: "platform" | "oss";
  storageCode?: string;
  fileId?: string;
  thumbUrl?: string;
  previewUrl?: string;
  variants?: {
    thumb?: AttachmentVariant;
    preview?: AttachmentVariant;
  };
}

export interface StableAddressValue {
  country?: LabeledValue;
  province?: LabeledValue;
  city?: LabeledValue;
  district?: LabeledValue;
  street?: LabeledValue;
  detail?: string;
  fullAddress?: string;
}

export interface StableLocationSnapshot {
  address?: string;
  name?: string;
  province?: string;
  city?: string;
  district?: string;
  accuracy?: number;
  capturedAt?: string;
}

export type StableLocationValue = StableLocationSnapshot & {
  source: "browser" | "dingTalk";
  longitude: number;
  latitude: number;
};

export interface StableSignaturePoint {
  x: number;
  y: number;
  t: number;
}

/** Stable handwritten business signature backed by a managed PNG file. */
export interface StableSignatureValue {
  file: ManagedFileValue;
  signer?: UserReferenceValue;
  signedAt: string;
  points?: StableSignaturePoint[];
  hash: string;
}
