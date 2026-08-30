import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Personal Health Data',
  description: 'A person-centred view of health, clinical records and genomic evidence.',
  openGraph: {
    title: 'Personal Health Data',
    description: 'Your data, independent of the device.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Personal Health Data',
    description: 'Your data, independent of the device.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
