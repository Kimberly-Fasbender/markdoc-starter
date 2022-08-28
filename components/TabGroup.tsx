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
    <div className='tab-group'>
      <ol>
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
      </ol>
    </div>
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
        <div>About Me - TODO</div>
      )} 
    </div>
    <style jsx>
    {`
      .tab-group {
        top: 51px;
        position: fixed;
        width: 100%;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1 rem;
        padding: 1 rem 2rem;
        background: #F7FAFC;
        border-bottom: 1px solid var(--border-color);
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
      span {
        font-size: larger;
        font-weight: 500;
        padding: 0.5rem 0 0.5rem;
      }
    `}
  </style>
</>
);
}
