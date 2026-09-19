import { useEffect } from 'react';
import { useNavigate } from 'react-router';

// Main asks for a page when an application menu item needs one, such as
// Settings… chosen while the board window has focus.
const useMainNavigation = () => {
  const navigate = useNavigate();

  useEffect(
    () =>
      window.api.onNavigate((route) => {
        void navigate(`/${route}`);
      }),
    [navigate]
  );
};

export default useMainNavigation;
