import Card from './Card';
import 'tailwindcss/tailwind.css';

const Hand = () => {
  return (
    <div className="h-screen w-screen bg-slate-800">
      <div
        className="w-screen h-6 text-center bg-slate-200 text-center"
        style={{ WebkitAppRegion: 'drag' }}
      >
        Hand
      </div>
      <Card
        scryfallId="e8815cd9-7032-445a-aebc-cfc19bd51ee4"
        draggable={false}
        tappable={false}
      />
    </div>
  );
};

export default Hand;
