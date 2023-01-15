import 'tailwindcss/tailwind.css';
import Abilities from 'AbilityConsts';
import classNames from 'classnames';
import FlyingIcon from '../icons/flying.svg';
import DefenderIcon from '../icons/defender.svg';
import LandwalkIcon from '../icons/landwalk.svg';
import VigilanceIcon from '../icons/vigilance.svg';
import LifelinkIcon from '../icons/lifelink.svg';
import DeathtouchIcon from '../icons/deathtouch.svg';
import ProtectionIcon from '../icons/protection.svg';
import ReachIcon from '../icons/reach.svg';

const AbilityIconMap = {
  [Abilities.Flying]: FlyingIcon,
  [Abilities.Defender]: DefenderIcon,
  [Abilities.Landwalk]: LandwalkIcon,
  [Abilities.Vigilance]: VigilanceIcon,
  [Abilities.Lifelink]: LifelinkIcon,
  [Abilities.Deathtouch]: DeathtouchIcon,
  [Abilities.Protection]: ProtectionIcon,
  [Abilities.Reach]: ReachIcon,
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
