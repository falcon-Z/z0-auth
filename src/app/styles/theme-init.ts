/** Apply shadcn `.dark` class from OS theme (used by all app entry points). */
const root = document.documentElement;
const apply = () => root.classList.toggle("dark", matchMedia("(prefers-color-scheme: dark)").matches);
apply();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
