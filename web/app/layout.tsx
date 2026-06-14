export const metadata = {
  title: "Pullback Pipeline",
  description: "Germ-layer pullback pipeline control panel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#0b0e14", color: "#e6e6e6" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px" }}>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>🐟 Germ-Layer Pullback Pipeline</h1>
          <p style={{ color: "#8a93a6", marginTop: 0 }}>One page. Pick a movie, hit Run, watch the machine work.</p>
          {children}
        </div>
      </body>
    </html>
  );
}
