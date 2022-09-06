import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';

export function TopNav() {
  const router = useRouter();
  const links = [{label: 'About Kim', hrefs: ['/']}, {label: 'Portfolio', hrefs: ['/cert_generation', '/design_doc']}];

  return (
    <nav>
      {links.map((link) => {
        const active = link.hrefs.includes(router.pathname);
        return (
          <Link key={link.hrefs[0]} href={link.hrefs[0]} className="flex">
            <a className={active ? 'active' : ''}>
              {link.label}
            </a>
          </Link>
        );
      })}
      <style jsx>
        {`
          a {
            color: #697386;
            padding: 1rem 2rem;
            align-items: center;
            justify-content: center;
          }
          a:hover {
            color: black;
          }
          a.active {
            color: #5469D4;
            border-bottom: 2px solid #5469D4;
          }
          nav {
            top: 0;
            padding: 0 0 0 15px;
            position: fixed;
            width: 100%;
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 1rem;
            background: #F7FAFC;
            border-bottom: 1px solid var(--border-color);
          }
          nav :global(a) {
            text-decoration: none;
          }
          section {
            display: flex;
            gap: 1rem;
            padding: 0;
          }
        `}
      </style>
    </nav>
  );
}
