import PropTypes from 'prop-types';
import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { observer } from 'mobx-react';
import Card from './Card';
import 'tailwindcss/tailwind.css';

const Board = ({ store }) => {
  return (
    <div className="h-screen w-screen bg-slate-300 relative">
      {store.battlefield.map((id) => (
        <Card scryfallId={id} />
      ))}
    </div>
  );
};

Board.propTypes = {
  store: PropTypes.object,
};

Board.defaultProps = {
  store: {},
};

export default observer(Board);
