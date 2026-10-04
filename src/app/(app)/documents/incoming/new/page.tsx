import { requireUser, loadLookups } from '@/lib/auth';
import { PageHead } from '@/components/ui';
import { MAX_UPLOAD_BYTES } from '@/lib/constants';
import IncomingForm from './IncomingForm';

export const metadata = { title: 'Register incoming document' };

export default async function NewIncoming() {
  const { profile } = await requireUser(['registry_officer']);
  const lookups = await loadLookups();
  return (
    <>
      <PageHead eyebrow="Incoming register" title="Register an incoming document">
        Register and scan it on the day it arrives. The reference number is issued when you save.
      </PageHead>
      <IncomingForm lookups={lookups} defaultOffice={profile.office_id} maxMb={Math.round(MAX_UPLOAD_BYTES / 1048576)} />
    </>
  );
}
