import Link from 'next/link';
import { ROLE_LABEL, type Role } from '@/lib/constants';
import type { Profile } from '@/lib/auth';
import { signOut } from '@/app/login/actions';
import NavLink from '@/components/NavLink';
import NavMenu from '@/components/NavMenu';

const NAV: Record<Role, { href: string; label: string; exact?: boolean }[]> = {
  system_administrator: [
    { href: '/', label: 'Dashboard', exact: true }, { href: '/documents/incoming', label: 'Incoming' }, { href: '/documents/outgoing', label: 'Outgoing' },
    { href: '/search', label: 'Search' }, { href: '/reports', label: 'Reports' }, { href: '/corrections', label: 'Corrections' }, { href: '/admin', label: 'Administration' },
  ],
  registry_officer: [
    { href: '/', label: 'Registry desk', exact: true }, { href: '/documents/incoming', label: 'Incoming' }, { href: '/documents/outgoing', label: 'Outgoing' },
    { href: '/search', label: 'Search' }, { href: '/contacts', label: 'Contacts' }, { href: '/reports', label: 'Reports' }, { href: '/corrections', label: 'Corrections' },
  ],
  action_officer: [
    { href: '/', label: 'My work', exact: true }, { href: '/search', label: 'Search' },
  ],
  executive_viewer: [
    { href: '/', label: 'Dashboard', exact: true }, { href: '/documents/incoming', label: 'Incoming' }, { href: '/documents/outgoing', label: 'Outgoing' },
    { href: '/search', label: 'Search' }, { href: '/reports', label: 'Reports' },
  ],
  auditor: [
    { href: '/', label: 'Overview', exact: true }, { href: '/documents/incoming', label: 'Incoming' }, { href: '/documents/outgoing', label: 'Outgoing' },
    { href: '/search', label: 'Search' }, { href: '/reports', label: 'Reports' }, { href: '/reports/audit-trail', label: 'Audit trail' },
  ],
};

export default function Header({ profile, unread }: { profile: Profile; unread: number }) {
  return (
    <header className="nec-header">
      <Link href="/" className="nec-header__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/nec-emblem.svg" alt="" height={44} width={45} />
        <span className="nec-header__name">National Elections Commission<span>Document Tracking System</span></span>
      </Link>
      <NavMenu>
        <ul className="nec-nav">
          {NAV[profile.role].map((n) => <NavLink key={n.href} href={n.href} exact={n.exact}>{n.label}</NavLink>)}
          <NavLink href="/notifications">
            <span className="bell">Notifications {unread > 0 && <span className="count" aria-label={`${unread} unread`}>{unread}</span>}</span>
          </NavLink>
          <li className="nec-header__user">
            <div>{profile.full_name}</div>
            <span>{ROLE_LABEL[profile.role]}</span>
          </li>
          <li>
            <form action={signOut}><button type="submit">Sign out</button></form>
          </li>
        </ul>
      </NavMenu>
    </header>
  );
}
