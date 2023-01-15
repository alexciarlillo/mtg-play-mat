import 'tailwindcss/tailwind.css';
import { AbilityKeywordMap } from 'AbilityConsts';
import AbilityIndicator from 'AbilityIndicator';

const AbilityIndicators = ({ abilities }) => {
  const filteredAbilities = abilities?.filter((ability) =>
    Object.hasOwn(AbilityKeywordMap, ability)
  );

  return filteredAbilities && filteredAbilities.length > 0 ? (
    <div className="flex-col absolute -left-10 top-6 -z-10  ">
      {filteredAbilities.map((ability) => (
        <AbilityIndicator ability={ability} key={ability} />
      ))}
    </div>
  ) : null;
};

export default AbilityIndicators;
