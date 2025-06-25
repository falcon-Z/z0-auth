import { Hono } from "hono";
import { renderer } from "./renderer";
import Login from "./components/auth/login";
import Auth from "./pages/auth";
import Dashboard from "./pages/dashboard";

const app = new Hono();

app.use(renderer);

app.get("/", (c) => {
  return c.render(<Dashboard />);
});

app.get("/auth", (c) => {
  return c.render(<Auth />);
});

export default app;
