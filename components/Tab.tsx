import React, { Component, useState } from 'react';
import { SideNav } from './SideNav';
import { TableOfContents } from './TableOfContents';

export function Tab(props) {
  const { label, onClickTab } = props;

  const onClick = () => {
    const tab = label === 'Portfolio' ? 'portfolio' : 'about_me';
    onClickTab(tab);
  }

  return (
    <li
      onClick={onClick}
    >
      {label}
    </li>
)};
