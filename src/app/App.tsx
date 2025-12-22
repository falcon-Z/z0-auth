import "../index.css";
import { Outlet } from "react-router";
import { AuthLayout } from "./components/layout/auth-layout";

export function App() {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  );
}

export default App;
