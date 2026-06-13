import React from "react";
import { AuditReportRenderer } from "../../components/AuditReportRenderer";
import { generateAuditPDF } from "../../lib/generate-pdf";
import { loadAuditReportViaApi } from "../../lib/audit-report-store";

export default function AuditReportPage() {
  const path = window.location.pathname;
  const search = window.location.search;
  const parts = path.split("/").filter(Boolean);
  const id = decodeURIComponent(parts[parts.length - 1] || "");
  const [envelope, setEnvelope] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const data = await loadAuditReportViaApi(id);
      if (mounted) {
        setEnvelope(data);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  React.useEffect(() => {
    if (!envelope?.data) return;
    const q = new URLSearchParams(search);
    if (q.get("download") === "1") {
      setTimeout(() => generateAuditPDF(envelope.data), 150);
    }
  }, [envelope, search]);

  if (loading) {
    return (
      <div style={{ color: "#e2e8f0", background: "#020617", minHeight: "100vh", padding: 24, fontFamily: "monospace" }}>
        Loading report...
      </div>
    );
  }

  if (!envelope?.data) {
    return (
      <div style={{ color: "#e2e8f0", background: "#020617", minHeight: "100vh", padding: 24, fontFamily: "monospace" }}>
        Report not found for id: {id}
      </div>
    );
  }

  return (
    <AuditReportRenderer
      data={envelope.data}
      onDownloadPDF={() => generateAuditPDF(envelope.data)}
    />
  );
}
