import React from 'react';
import Head from 'next/head';

import { SideNav, TableOfContents, TopNav } from '../components';

import '../public/globals.css'

import type { AppProps } from 'next/app'
import { useRouter } from 'next/router';

const TITLE = 'Markdoc';
const DESCRIPTION = 'A powerful, flexible, Markdown-based authoring framework';

const portfolioLinks = ['/', '/design_doc', '/game_read_me'];
const portfolioItems = [
  {
    title: 'Technical Writing Portfolio',
    links: [
      {href: portfolioLinks[0], children: 'Manually Generate New CA Certificate'},
      {href: portfolioLinks[1], children: 'Work Session Clean Up Design'},
      {href: portfolioLinks[2], children: 'ATX Game Documentation'}
    ],
  },
];

const aboutMeItems = [
  {
    title: 'About Section',
    links: [
      {href: '/about_me', children: 'Meet Kimberly Fasbender'},
    ],
  },
];

function collectHeadings(node, sections = []) {
  if (node) {
    if (node.name === 'Heading') {
      const title = node.children[0];

      if (typeof title === 'string') {
        sections.push({
          ...node.attributes,
          title
        });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        collectHeadings(child, sections);
      }
    }
  }

  return sections;
}

export default function MyApp({ Component, pageProps }: AppProps) {
  const { markdoc } = pageProps;

  let title = TITLE;
  let description = DESCRIPTION;
  if (markdoc) {
    if (markdoc.frontmatter.title) {
      title = markdoc.frontmatter.title;
    }
    if (markdoc.frontmatter.description) {
      description = markdoc.frontmatter.description;
    }
  }

  const router = useRouter();
  const toc = pageProps.markdoc?.content
    ? collectHeadings(pageProps.markdoc.content)
    : [];

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="referrer" content="strict-origin" />
        <meta name="title" content={title} />
        <meta name="description" content={description} />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <TopNav/>
      <div className="page">
        {portfolioLinks.includes(router.pathname) && <SideNav items={portfolioItems} />}
        {(router.pathname === '/about_me') && <SideNav items={aboutMeItems} />}
          <main className="flex column">
            <Component {...pageProps} />
          </main>
        {portfolioLinks.includes(router.pathname) && <TableOfContents toc={toc} />}
      </div>
      <style jsx>
        {`
          .page {
            position: fixed; 
            top: var(--top-nav-height);
            display: flex;
            width: 100vw;
            flex-grow: 1;
          }
          main {
            overflow: auto;
            height: calc(100vh - var(--top-nav-height));
            flex-grow: 1;
            font-size: 16px;
            padding: 0 2rem 2rem;
          }
        `}
      </style>
    </>
  );
}
