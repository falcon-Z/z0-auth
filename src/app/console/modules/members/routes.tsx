import type { RouteObject } from "react-router-dom";

import { MembersPage } from "./pages/MembersPage";

export const membersRoutes: RouteObject[] = [
  { path: "/members", element: <MembersPage /> },
];
