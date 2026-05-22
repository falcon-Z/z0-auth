import { Navigate, Route, Routes } from "react-router-dom";

import { ForgotPasswordPage } from "./auth/forgot-password/forgot-password-page";
import { LoginPage } from "./auth/login/login-page";
import { RegisterPage } from "./auth/register/register-page";
import { ConsoleAuthGuard } from "./lib/auth-guard";
import { ConsoleRoutes } from "./console/routes";
import { SetupPage } from "./setup/setup-page";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route
        path="/console/*"
        element={
          <ConsoleAuthGuard>
            <ConsoleRoutes />
          </ConsoleAuthGuard>
        }
      />
      <Route path="/console" element={<Navigate to="/console/" replace />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
