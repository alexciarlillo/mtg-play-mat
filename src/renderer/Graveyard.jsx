import { observer } from 'mobx-react';
import Card from './Card';
import { useBoardStore } from './BoardStore';
import 'tailwindcss/tailwind.css';

const Graveyard = () => {
  const board = useBoardStore();

  return <div className="">Graveyard</div>;
};

export default observer(Graveyard);
