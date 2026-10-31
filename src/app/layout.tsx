import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: "ORIL — Know what you're signing", description: 'Inspect wallet signature requests before approval.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
