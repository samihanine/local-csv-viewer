import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "theme";

const initial = (): Theme => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

let current = initial();
const listeners = new Set<(t: Theme) => void>();
document.documentElement.classList.toggle("dark", current === "dark");

export function setTheme(theme: Theme) {
  current = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  for (const listener of listeners) listener(theme);
}

export function useTheme() {
  const [theme, set] = useState(current);
  useEffect(() => {
    listeners.add(set);
    return () => void listeners.delete(set);
  }, []);
  return { theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
