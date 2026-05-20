import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from '@remix-run/react';
import { checkAuthOnLoad } from '~/lib/stores/auth';

export function AuthGuard({ children }: Readonly<{ children: ReactNode }>) {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checkAuthOnLoad()) {
      setChecked(true);
    } else {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  if (!checked) {
    return null;
  }

  return <>{children}</>;
}
