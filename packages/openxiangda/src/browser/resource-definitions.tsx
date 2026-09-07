import { createContext, useContext, type ReactNode } from 'react';
import type { GeneratedResourceDefinitions } from './components/resource/generated-resource-definition';

const ResourceDefinitionsContext =
  createContext<GeneratedResourceDefinitions | null>(null);

export function OpenXiangdaResourceDefinitionsProvider({
  children,
  definitions,
}: {
  children: ReactNode;
  definitions: GeneratedResourceDefinitions;
}) {
  return (
    <ResourceDefinitionsContext.Provider value={definitions}>
      {children}
    </ResourceDefinitionsContext.Provider>
  );
}

export function useResourceDefinitions() {
  const definitions = useContext(ResourceDefinitionsContext);
  if (!definitions) {
    throw new Error('OPENXIANGDA_RESOURCE_DEFINITIONS_NOT_READY');
  }
  return definitions;
}
