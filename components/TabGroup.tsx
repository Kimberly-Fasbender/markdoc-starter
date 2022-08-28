import React, { useState } from 'react';
import { SideNav } from './SideNav';
import { Tab } from './Tab';
import { TableOfContents } from './TableOfContents';

const labels = {
  portfolio: 'Portfolio',
  aboutMe: 'About Me',
}

export function TabGroup(props) {
  const { toc, component } = props;
  const [ activeTab, setActiveTab ] = useState('portfolio');

  const onClickTab = (tab) => {
    setActiveTab(tab);
  }

  return (
  <>
    <nav>
      <section>
        <Tab
          activeTab={activeTab}
          label={labels.portfolio}
          onClickTab={onClickTab}
        />
        <Tab
          activeTab={activeTab}
          label={labels.aboutMe}
          onClickTab={onClickTab}
        />
      </section>
    </nav>
    <div>
      {activeTab === 'portfolio' ? 
      (
        <div className="page">
          <SideNav />
            <main className="flex column">
              { component }
            </main>
          <TableOfContents toc={toc} />
        </div>
      ) : 
      (
        <div className="page">About Me - TODO</div>
      )} 
    </div>
    <style jsx>
    {`
      nav {
        top: 51px;
        position: fixed;
        width: 100%;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        padding: 1rem 2rem;
        background: #F7FAFC;
        border-bottom: 1px solid var(--border-color);
      }
      nav :global(a) {
        text-decoration: none;
      }
      main {
        overflow: auto;
        height: calc(100vh - 102px);
        flex-grow: 1;
        font-size: 16px;
        padding: 0 2rem 2rem;
      }
      .page {
        position: fixed; 
        top: 102px;
        display: flex;
        width: 100vw;
        flex-grow: 1;
      }
      section {
        display: flex;
        gap: 1rem;
        padding: 0;
      }
    `}
  </style>
</>
);
}
