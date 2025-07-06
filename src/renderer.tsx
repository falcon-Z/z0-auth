import { jsxRenderer } from "hono/jsx-renderer";
import { Link, ViteClient } from "vite-ssr-components/hono";

export const renderer = jsxRenderer(
  ({ children }) => {
    return (
      <html class={"dark"}>
        <head>
          <ViteClient />
          <Link href="/src/index.css" rel="stylesheet" />
        </head>
        <body>
          <main class={"h-screen w-full"}>{children}</main>
        </body>
      </html>
    );
  },
  {
    docType: true,
    stream: false,
  }
);
