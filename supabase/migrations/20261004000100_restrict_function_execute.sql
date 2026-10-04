-- =============================================================================
-- Restrict EXECUTE on internal functions
-- =============================================================================
-- Supabase grants EXECUTE on new public functions to `authenticated` by default,
-- and `revoke ... from anon, public` in the initial migration does not remove it.
-- Without this, any signed-in user could call write_audit() (forging audit
-- entries), next_reference_number() (burning numbers) or
-- hook_password_verification_attempt() (locking other users' accounts) through
-- the REST API. Only the helpers listed in DATABASE_SCHEMA.md section 9 stay
-- callable by signed-in users; RLS policies need them.
-- =============================================================================

revoke execute on function
  public.write_audit(public.audit_event_type, uuid, text, text, jsonb),
  public.next_reference_number(smallint, public.document_direction, timestamptz),
  public.hook_password_verification_attempt(jsonb),
  public.tg_allow_only(),
  public.tg_audit_chain(),
  public.tg_audit_row(),
  public.tg_corrections_lock(),
  public.tg_details_lock(),
  public.tg_documents_before_insert(),
  public.tg_documents_before_update(),
  public.tg_documents_check_complete(),
  public.tg_handle_new_auth_user(),
  public.tg_limit_administrators(),
  public.tg_movements_lock(),
  public.tg_prevent_delete(),
  public.tg_prevent_update(),
  public.tg_set_updated_at()
from authenticated, anon, public;

-- the Auth hook must keep working
grant execute on function public.hook_password_verification_attempt(jsonb) to supabase_auth_admin;

-- fixed search_path on the three helpers that lacked one
alter function public.request_ip()                               set search_path = public;
alter function public.changed_columns(jsonb, jsonb, text[])      set search_path = public;
alter function public.in_correction_context()                    set search_path = public;
