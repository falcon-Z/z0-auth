import { Hono } from "hono";
import { renderer } from "./renderer";
import Login from "./components/auth/login";

const app = new Hono();

app.use(renderer);

app.get("/", (c) => {
  return c.render(
    <h1>
      Hello! <Login />
    </h1>
  );
});

export default app;
