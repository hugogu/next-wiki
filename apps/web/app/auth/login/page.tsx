import Link from 'next/link';
import type { Metadata } from 'next';
import { Layout } from '@/components/ui/Layout';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
};

export default function LoginPage() {
  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-semibold mb-md">Sign in</h1>
        <LoginForm />
        <p className="mt-md text-sm text-muted">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="text-primary hover:underline">Create one</Link>
        </p>
      </div>
    </Layout>
  );
}
