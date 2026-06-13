import { Suspense, lazy, useEffect, useState } from "react";
import HelioLandingPage from "./features/landing/HelioLandingPage";

const HelioDashboard = lazy(() => import("./features/dashboard/HelioDashboard.jsx"));
const AuditReportPage = lazy(() => import("./features/reports/AuditReportPage"));

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#c8ff00", fontFamily: "monospace", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
      HELIO LOADING...
    </div>
  );
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (path.startsWith("/reports/")) return <Suspense fallback={<LoadingScreen />}><AuditReportPage /></Suspense>;
  if (path.startsWith("/dashboard")) return <Suspense fallback={<LoadingScreen />}><HelioDashboard /></Suspense>;
  return <HelioLandingPage />;
}
