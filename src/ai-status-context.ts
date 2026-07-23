import { createContext, useContext } from "react";

// Shared BYO-key status, consumed by every AI surface. Split from the provider
// component so the .tsx file only exports components (react-refresh).
export interface AiStatus {
  configured: boolean;
  hint: string | null;
  loading: boolean;
  refresh: () => void;
}

export const AiStatusContext = createContext<AiStatus>({
  configured: false,
  hint: null,
  loading: true,
  refresh: () => {},
});

export function useAiStatus() {
  return useContext(AiStatusContext);
}
