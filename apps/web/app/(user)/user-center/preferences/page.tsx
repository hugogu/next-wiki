import { redirect } from 'next/navigation';

export default async function PreferencesPage() {
  redirect('/user-center/profile');
}
