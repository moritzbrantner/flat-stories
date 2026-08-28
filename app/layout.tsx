import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Flat Stories",
  description: "A focused flat-design SVG editor",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
