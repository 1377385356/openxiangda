export interface GeneratedDetailFieldDescriptor {
  key: string;
  label: string;
  type: string;
  system?: boolean;
  hidden?: boolean;
}

/**
 * Visibility is declared, never guessed from a key, label or storage type.
 * A system-owned business number may opt in with hidden:false. This function
 * does not grant or revoke Data API access.
 */
export function isGeneratedDetailFieldVisible(field: GeneratedDetailFieldDescriptor) {
  return !(field.hidden ?? field.system ?? false);
}
