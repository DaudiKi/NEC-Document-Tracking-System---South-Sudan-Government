import type { Metadata, Viewport } from 'next';
import './tokens.css';
import './design-system.css';
import './app.css';

export const metadata: Metadata = {
  title: { default: 'Document Tracking System | National Elections Commission', template: '%s | NEC Document Tracking' },
  description: 'Register, scan, route and audit incoming and outgoing documents of the Office of the Chairperson and the Office of the Secretary General.',
  icons: { icon: '/brand/nec-emblem.svg' },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="nec">
        <a href="#main" className="skip">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
