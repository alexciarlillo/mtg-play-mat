import 'tailwindcss/tailwind.css';
import Abilities from 'AbilityConsts';
import classNames from 'classnames';
import DeathtouchIcon from '../icons/deathtouch.svg';
import DefenderIcon from '../icons/defender.svg';
import DoubleStrikeIcon from '../icons/double-strike.svg';
import FirstStrikeIcon from '../icons/first-strike.svg';
import FlyingIcon from '../icons/flying.svg';
import HasteIcon from '../icons/haste.svg';
import HexproofIcon from '../icons/hexproof.svg';
import IndestructibleIcon from '../icons/indestructible.svg';
import IntimidateIcon from '../icons/intimidate.svg';
import LandwalkIcon from '../icons/landwalk.svg';
import LifelinkIcon from '../icons/lifelink.svg';
import ProtectionIcon from '../icons/protection.svg';
import ReachIcon from '../icons/reach.svg';
import ShadowIcon from '../icons/shadow.svg';
import ShroudIcon from '../icons/shroud.svg';
import TrampleIcon from '../icons/trample.svg';
import VigilanceIcon from '../icons/vigilance.svg';

const AbilityIconMap = {
  [Abilities.Deathtouch]: DeathtouchIcon,
  [Abilities.Defender]: DefenderIcon,
  [Abilities.DoubleStrike]: DoubleStrikeIcon,
  [Abilities.FirstStrike]: FirstStrikeIcon,
  [Abilities.Flying]: FlyingIcon,
  [Abilities.Haste]: HasteIcon,
  [Abilities.Hexproof]: HexproofIcon,
  [Abilities.Indestructible]: IndestructibleIcon,
  [Abilities.Intimidate]: IntimidateIcon,
  [Abilities.Landwalk]: LandwalkIcon,
  [Abilities.Lifelink]: LifelinkIcon,
  [Abilities.Protection]: ProtectionIcon,
  [Abilities.Reach]: ReachIcon,
  [Abilities.Shadow]: ShadowIcon,
  [Abilities.Shroud]: ShroudIcon,
  [Abilities.Trample]: TrampleIcon,
  [Abilities.Vigilance]: VigilanceIcon,
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
