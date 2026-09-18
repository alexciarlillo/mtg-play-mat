import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

import useNetState from './useNetState';

// An invite that arrived by link opens the Play online page, pre-filled.
const useInviteNavigation = () => {
  const { pendingInvite } = useNetState();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (pendingInvite && pathname !== '/online') void navigate('/online');
  }, [pendingInvite, pathname, navigate]);
};

export default useInviteNavigation;
