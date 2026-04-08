import "./globals.css";

export const metadata = {
  title: "Climate Risk Intelligence — CRI Platform",
  description:
    "Cloud-Native B2B SaaS platform for climate risk intelligence. Predicts physical climate risks for corporate real estate portfolios and translates them into financial metrics.",
  keywords:
    "climate risk, ESG, CVaR, CSRD, physical risk, real estate, geospatial",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
