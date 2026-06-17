import Link from 'next/link';
import type { Metadata } from 'next';
import { Layout } from '@/components/ui/Layout';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = {
  title: 'Register',
};

export default function RegisterPage() {
  return (
    <Layout>
      <div className="max-w-md mx-auto px-lg py-xl">
        <h1 className="font-display text-2xl font-semibold mb-md">Create an account</h1>
        <RegisterForm />
        <p className="mt-md text-sm text-muted">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </Layout>
  );
}
