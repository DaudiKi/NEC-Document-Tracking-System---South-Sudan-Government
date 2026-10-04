import { requireUser, loadLookups } from '@/lib/auth';
import { PageHead } from '@/components/ui';
import { MAX_UPLOAD_BYTES } from '@/lib/constants';
import OutgoingForm from './OutgoingForm';

export const metadata = { title: 'Register outgoing document' };

export default async function NewOutgoing() {
  const { profile } = await requireUser(['registry_officer']);
  const lookups = await loadLookups();
  return (
    <>
      <PageHead eyebrow="Outgoing register" title="Register an outgoing document">
        Register it before dispatch to get its reference number. Mark it Final once the signed copy is scanned.
      </PageHead>
      <OutgoingForm lookups={lookups} defaultOffice={profile.office_id} maxMb={Math.round(MAX_UPLOAD_BYTES / 1048576)} />
    </>
  );
}
