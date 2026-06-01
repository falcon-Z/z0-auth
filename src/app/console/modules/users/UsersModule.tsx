import { Route, Routes } from "react-router-dom";

import { UsersAccessGate } from "./UsersAccessGate";
import { UserDetailPage } from "./pages/UserDetailPage";
import { UsersListPage } from "./pages/UsersListPage";

export function UsersModule() {
  return (
    <UsersAccessGate>
      <Routes>
        <Route index element={<UsersListPage />} />
        <Route path=":userId" element={<UserDetailPage />} />
      </Routes>
    </UsersAccessGate>
  );
}
