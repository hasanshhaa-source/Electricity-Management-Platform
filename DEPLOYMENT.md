# Deployment Checklist

## 1. Environment Variables

Copy `.env.example` to `.env.local` and fill in all values:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# App
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Email (Resend or SMTP)
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@your-domain.com
```

## 2. Database Migrations

Run all migrations in order against your Supabase project:

```bash
supabase db push
# or manually via the Supabase dashboard SQL editor:
# supabase/migrations/001_*.sql through the latest migration
```

Verify RLS is enabled on all tables:

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' ORDER BY tablename;
```

## 3. Seed the Settings Singleton

The `system_settings` and `notification_settings` tables need exactly one row each. Run:

```sql
-- Already included in migration 010, but verify:
SELECT COUNT(*) FROM system_settings;   -- must be 1
SELECT COUNT(*) FROM notification_settings; -- must be 1
```

## 4. Create the First Admin Account

1. Go to `https://your-domain.com/register` and create an account.
2. In the Supabase dashboard → Table editor → `users`, set `role = 'admin'` for that user.
3. Disable self-registration in Settings → Registration if you don't want open sign-ups.

## 5. Configure Email

In the admin Settings → Notifications, enable the notification types you want.
Ensure the `RESEND_API_KEY` env var is set and the sending domain is verified in Resend.

Test by triggering a bill issuance for a test tenant.

## 6. Build & Start

```bash
npm run build
npm start
# or deploy to Vercel / Railway / Fly.io
```

On Vercel: connect the GitHub repo and add all environment variables in the project settings.

## 7. Post-Deployment Checks

- [ ] Admin can log in at `/login`
- [ ] Admin dashboard loads with no errors
- [ ] Can create a building, flat, meter
- [ ] Can register a tenant and approve their tenancy request
- [ ] Can enter meter readings and calculate bills
- [ ] Tenant can log in and see their bills
- [ ] PDF download works for a bill
- [ ] CSV export works from the Export page
- [ ] Email notification is received on bill issuance (check spam)

## 8. Backup

Supabase projects on paid plans have daily automatic backups.

For self-hosted or extra safety, schedule a pg_dump:

```bash
pg_dump $DATABASE_URL --no-owner -Fc -f backup-$(date +%Y%m%d).dump
```

Store backups in an off-site bucket (S3, R2, etc.).

## 9. Monitoring

- Enable Supabase Logs → API logs for slow queries.
- Set up an uptime monitor (e.g., BetterUptime) on the `/api/health` endpoint.
- Add Sentry or similar for frontend error tracking (optional).
