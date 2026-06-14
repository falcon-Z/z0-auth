import { Route, Routes } from "react-router-dom";

import { MembersAccessGate } from "../members/MembersAccessGate";
import { InviteDetailPage } from "../members/pages/InviteDetailPage";
import { MemberDetailPage } from "../members/pages/MemberDetailPage";
import { MembersListPage } from "../members/pages/MembersListPage";
import { RoleDetailPage } from "./pages/RoleDetailPage";
import { RolesListPage } from "./pages/RolesListPage";

export function PeopleModule() {
  return (
    <MembersAccessGate>
      <Routes>
        <Route index element={<MembersListPage />} />
        <Route path="roles" element={<RolesListPage />} />
        <Route path="roles/:roleId" element={<RoleDetailPage />} />
        <Route path="invites/:inviteId" element={<InviteDetailPage />} />
        <Route path=":userId" element={<MemberDetailPage />} />
      </Routes>
    </MembersAccessGate>
  );
}
