export const metadata = {
  title: "Pullback Pipeline",
  description: "Germ-layer pullback pipeline control panel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#0b0e14", color: "#e6e6e6" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12c3-5 9-7 13-5s5 8 5 8-5 3-9 3-9-1-9-6z" fill="#11233f" />
              <path d="M16 12c2-1.5 4-1.5 5 0-1 1.5-3 1.5-5 0z" />
              <circle cx="8.5" cy="11" r="0.9" fill="#3b82f6" stroke="none" />
            </svg>
            <h1 style={{ fontSize: 22, margin: 0 }}>Germ-Layer Pullback Pipeline</h1>
          </div>
          <p style={{ color: "#8a93a6", marginTop: 0 }}>Pick a marker and stage, point it at a raw embryo, get a mesh back.</p>
          {children}
        </div>
      </body>
    </html>
  );
}
