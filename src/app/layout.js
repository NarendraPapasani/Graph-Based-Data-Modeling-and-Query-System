import "./globals.css";

export const metadata = {
  title: "SAP O2C Context Graph",
  description: "Graph-based data modeling and query system for SAP Order-to-Cash data with LLM-powered natural language queries",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
