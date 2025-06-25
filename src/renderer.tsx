import { jsxRenderer } from "hono/jsx-renderer";
import { Link, ViteClient } from "vite-ssr-components/hono";

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html class={"dark"}>
      <head>
        <ViteClient />
        <Link href="/src/style.css" rel="stylesheet" />
      </head>
      <body
        class={
          "dark:bg-black dark:text-neutral-50 bg-neutral-100 text-neutral-950 h-full w-full"
        }
      >
        <main class={"h-screen w-full"}>{children}</main>
      </body>
    </html>
  );
});
