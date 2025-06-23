
-- Remove old CRON jobs
SELECT cron.unschedule('email-processor');
SELECT cron.unschedule('deadline-checker');

-- Create new CRON job to process emails every 15 minutes using Edge Functions
SELECT cron.schedule(
  'process-email-queue',
  '*/15 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://your-project-id.supabase.co/functions/v1/process-emails',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer your-service-role-key"}'::jsonb
    ) as request_id;
  $$
);

-- Update deadline checking to use the improved function
SELECT cron.schedule(
  'deadline-checker-v2', 
  '0 9 * * *', 
  'SELECT check_upcoming_deadlines();'
);
