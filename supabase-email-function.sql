
-- Email notification function to be used with Supabase Edge Functions
-- This function processes the email queue and can be called by CRON or manually

CREATE OR REPLACE FUNCTION process_email_queue()
RETURNS TEXT AS $$
DECLARE
    email_record RECORD;
    processed_count INTEGER := 0;
BEGIN
    -- Process queued emails (limit to 10 at a time to avoid timeouts)
    FOR email_record IN
        SELECT id, recipient_email, subject, body, project_id, stage_name
        FROM email_queue 
        WHERE status = 'queued'
        ORDER BY created_at
        LIMIT 10
    LOOP
        -- Mark as processing
        UPDATE email_queue 
        SET status = 'processing' 
        WHERE id = email_record.id;
        
        -- Here you would integrate with your email service
        -- For now, we'll just mark as sent
        -- In a real implementation, you'd call an external email service
        
        UPDATE email_queue 
        SET status = 'sent', 
            sent_at = NOW() 
        WHERE id = email_record.id;
        
        processed_count := processed_count + 1;
    END LOOP;
    
    RETURN 'Processed ' || processed_count || ' emails from queue';
END;
$$ LANGUAGE plpgsql;

-- Schedule email processing every 15 minutes
SELECT cron.schedule('email-processor', '*/15 * * * *', 'SELECT process_email_queue();');

-- Function to manually queue deadline reminder
CREATE OR REPLACE FUNCTION queue_deadline_reminder(
    p_recipient_email TEXT,
    p_project_name TEXT,
    p_stage_name TEXT,
    p_due_date DATE,
    p_person_name TEXT
)
RETURNS TEXT AS $$
BEGIN
    INSERT INTO email_queue (recipient_email, subject, body, status)
    VALUES (
        p_recipient_email,
        'Project Deadline Reminder: ' || p_project_name,
        'Dear ' || p_person_name || ',<br><br>' ||
        'This is a reminder that the ' || p_stage_name || ' stage for project "' || 
        p_project_name || '" is due on ' || p_due_date || '.<br><br>' ||
        'Please ensure completion by the due date.<br><br>' ||
        'Best regards,<br>Project Management System',
        'queued'
    );
    
    RETURN 'Email reminder queued successfully';
END;
$$ LANGUAGE plpgsql;
