import { Navigate, Route, Routes } from "react-router-dom";

import { MembersAccessGate } from "./MembersAccessGate";
import { InviteDetailPage } from "./pages/InviteDetailPage";
import { MemberDetailPage } from "./pages/MemberDetailPage";
import { MembersListPage } from "./pages/MembersListPage";

export function MembersModule() {
  return (
    <MembersAccessGate>
      <Routes>
        <Route index element={<MembersListPage />} />
        <Route path="invites/:inviteId" element={<InviteDetailPage />} />
        <Route path=":userId" element={<MemberDetailPage />} />
      </Routes>
    </MembersAccessGate>
  );
}
