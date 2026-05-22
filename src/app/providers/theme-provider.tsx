import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { initSystemTheme, resolveSystemTheme, type ResolvedTheme } from "@z0/styles/theme-init";

const ThemeContext = createContext<ResolvedTheme>(resolveSystemTheme());

export function useTheme(): ResolvedTheme {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(resolveSystemTheme);

  useEffect(() => initSystemTheme(setTheme), []);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
