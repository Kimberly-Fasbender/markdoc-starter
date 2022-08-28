export function Tab(props) {
  const { label, onClickTab } = props;

  const onClick = () => {
    const tab = label === 'Portfolio' ? 'portfolio' : 'about_me';
    onClickTab(tab);
  }

  return (
    <div
      onClick={onClick}
    >
      {label}
    </div>
)};
