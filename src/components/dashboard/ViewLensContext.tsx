"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ViewLens } from "@/types";

interface ViewLensContextValue {
  currentLens: ViewLens;
  setCurrentLens: (lens: ViewLens) => void;
}

const ViewLensContext = createContext<ViewLensContextValue | null>(null);

export function ViewLensProvider({ children }: { children: ReactNode }) {
  const [currentLens, setCurrentLens] = useState<ViewLens>("shipbroker");

  return (
    <ViewLensContext.Provider value={{ currentLens, setCurrentLens }}>
      {children}
    </ViewLensContext.Provider>
  );
}

export function useViewLens() {
  const context = useContext(ViewLensContext);
  if (!context) {
    throw new Error("useViewLens must be used within a ViewLensProvider");
  }
  return context;
}
