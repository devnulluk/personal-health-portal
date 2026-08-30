import type { Metadata } from 'next';
import './globals.css';
import './service-theme.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://health.newland-brown.com'),
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
      <body>{children}</body>
    </html>
  );
}
