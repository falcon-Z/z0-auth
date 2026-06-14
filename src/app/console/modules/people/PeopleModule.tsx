import { Navigate, Route, Routes } from "react-router-dom";

import { MembersAccessGate } from "../members/MembersAccessGate";
import { InviteDetailPage } from "../members/pages/InviteDetailPage";
import { MemberDetailPage } from "../members/pages/MemberDetailPage";
import { MembersListPage } from "../members/pages/MembersListPage";
import { PeopleAccessPage } from "./pages/PeopleAccessPage";

export function PeopleModule() {
  return (
    <MembersAccessGate>
      <Routes>
        <Route index element={<MembersListPage />} />
        <Route path="access" element={<PeopleAccessPage />} />
        <Route path="invites/:inviteId" element={<InviteDetailPage />} />
        <Route path=":userId" element={<MemberDetailPage />} />
      </Routes>
    </MembersAccessGate>
  );
}
