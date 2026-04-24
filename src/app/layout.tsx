import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Avalon",
  description: "Internal operations platform for Finn Cotton",
};

const themeScript = `
(function(){
  try {
    var s = JSON.parse(localStorage.getItem('avalon-theme') || '{}');
    var t = s.theme || 'light';
    var a = s.accent || 'blue';
    var d = s.density || 'comfortable';
    var r = document.documentElement;
    if (t === 'dark') r.classList.add('dark');
    else if (t === 'system') r.classList.add('theme-system');
    if (a !== 'blue') r.classList.add('accent-' + a);
    if (d === 'compact') r.classList.add('density-compact');
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${cormorant.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
