import 'tailwindcss/tailwind.css';
import Abilities from 'AbilityConsts';
import classNames from 'classnames';
import FlyingIcon from '../icons/feathered-wing.svg';
import DefenderIcon from '../icons/crenulated-shield.svg';

const AbilityIconMap = {
  [Abilities.Flying]: FlyingIcon,
  [Abilities.Defender]: DefenderIcon,
};

const AbilityIndicator = ({ ability }) => {
  getIconComponent = () => {
    switch (ability) {
      case 'flying':
        return WingIcon;
      default:
        return null;
    }
  };

  const IconComponent = AbilityIconMap[ability] || null;

  return (
    <div className="h-10 w-24 rounded-lg image-block bg-black opacity-50 mb-0.5 flex items-center justify-start pl-2 hover:opacity-100">
      {IconComponent && <IconComponent className="h-6 w-6" />}
    </div>
  );
};

export default AbilityIndicator;
