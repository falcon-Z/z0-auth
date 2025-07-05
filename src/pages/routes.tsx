import AuthPageRoutes from "./auth/routes";

const PageRoutes = new Hono();

PageRoutes.get("/", (c) => c.render(<Dashboard />));
PageRoutes.route("/auth", AuthPageRoutes);

export default PageRoutes;
