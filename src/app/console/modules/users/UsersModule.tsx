import { Route, Routes } from "react-router-dom";

import { UsersAccessGate } from "./UsersAccessGate";
import { UsersListPage } from "./pages/UsersListPage";

export function UsersModule() {
  return (
    <UsersAccessGate>
      <Routes>
        <Route index element={<UsersListPage />} />
      </Routes>
    </UsersAccessGate>
  );
}
