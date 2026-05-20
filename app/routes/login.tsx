import type { MetaFunction } from '@remix-run/node';
import { LoginPage } from '~/components/auth/LoginPage';

export const meta: MetaFunction = () => {
  return [
    { title: 'Sign In | MigrateX' },
    { name: 'description', content: 'Sign in to MigrateX with your Contentstack credentials' },
  ];
};

export default function Login() {
  return <LoginPage />;
}
