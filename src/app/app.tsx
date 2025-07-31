import "../index.css";
import { Outlet } from "react-router";

export function App() {
  return (
    <main className="grid place-items-center w-full h-screen">
      <Outlet />
    </main>
  );
}

export default App;
