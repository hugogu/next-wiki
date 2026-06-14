import { redirect } from 'next/navigation';
import * as authService from '@/server/services/auth';

export async function POST() {
  await authService.logout();
  redirect('/');
}
