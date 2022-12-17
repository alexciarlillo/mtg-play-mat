import { useDeckStore } from 'DeckStore';
import { observer } from 'mobx-react';
import 'tailwindcss/tailwind.css';

const DeckViewer = () => {
  const store = useDeckStore();

  return <div className="w-full h-full">DECK VIEWER</div>;
};

export default observer(DeckViewer);
