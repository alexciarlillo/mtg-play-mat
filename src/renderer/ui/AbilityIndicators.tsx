import 'tailwindcss/tailwind.css';
import AbilityIndicator from 'AbilityIndicator';

const AbilityIndicators = ({ abilities }) => {
  return abilities && abilities.length > 0 ? (
    <div className="flex-col absolute -left-10 top-6 -z-10  ">
      {abilities.map((ability) => (
        <AbilityIndicator ability={ability} key={ability} />
      ))}
    </div>
  ) : null;
};

export default AbilityIndicators;
