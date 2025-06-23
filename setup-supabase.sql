
-- Run this SQL in your Supabase SQL Editor to create all necessary tables and functions

-- Projects table (existing)
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT,
    assignee TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    remarks TEXT,
    projecttype TEXT,
    bu TEXT,
    stages JSONB,
    currentprojectstage TEXT,
    createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OTDR tracking table
CREATE TABLE IF NOT EXISTS otdr_data (
    id SERIAL PRIMARY KEY,
    stage_name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    due_date DATE,
    completed BOOLEAN DEFAULT FALSE,
    completed_date DATE,
    on_time BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(stage_name, project_id)
);

-- Email queue table for tracking sent emails
CREATE TABLE IF NOT EXISTS email_queue (
    id SERIAL PRIMARY KEY,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    project_id TEXT,
    stage_name TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'pending'
);

-- Employee authentication table
CREATE TABLE IF NOT EXISTS employees (
    employee_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert employee data
INSERT INTO employees (employee_id, name) VALUES
('M20052', 'ANIKET CHENDAGE'),
('M19003', 'MAHESH PATIL'),
('M19004', 'SANDIP KOKARE'),
('M19007', 'VIKAS CHAPANE'),
('M20040', 'NILESH GAIKWAD'),
('M19005', 'PRAKASH GOVILKAR'),
('M19010', 'SATISH BELGAONKAR'),
('M20048', 'RAJAS VINCHU'),
('M21082', 'SACHIN NANDODKAR'),
('M10323', 'VAIDEHI PAWAR'),
('M21084', 'MOMIN M. AZHARUDDIN'),
('M21085', 'AKASH KANASE'),
('M21104', 'AMRUTA BAHULIKAR'),
('M22111', 'NITIN PATIL'),
('M22105', 'PRAJAKTA KADAM'),
('M220124', 'AKASH W')
ON CONFLICT (employee_id) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE otdr_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed)
CREATE POLICY "Allow all operations for public" ON projects FOR ALL USING (true);
CREATE POLICY "Allow all operations for public" ON otdr_data FOR ALL USING (true);
CREATE POLICY "Allow all operations for public" ON email_queue FOR ALL USING (true);
CREATE POLICY "Allow all operations for public" ON employees FOR ALL USING (true);

-- Function to update OTDR data
CREATE OR REPLACE FUNCTION update_otdr_data(
    p_project_id TEXT,
    p_project_name TEXT,
    p_stage_name TEXT,
    p_due_date DATE,
    p_completed BOOLEAN,
    p_completed_date DATE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    -- Insert or update OTDR record
    INSERT INTO otdr_data (stage_name, project_id, project_name, due_date, completed, completed_date, on_time)
    VALUES (p_stage_name, p_project_id, p_project_name, p_due_date, p_completed, p_completed_date,
            CASE WHEN p_completed AND p_completed_date IS NOT NULL 
                 THEN p_completed_date <= p_due_date 
                 ELSE NULL END)
    ON CONFLICT (stage_name, project_id)
    DO UPDATE SET
        completed = p_completed,
        completed_date = p_completed_date,
        on_time = CASE WHEN p_completed AND p_completed_date IS NOT NULL 
                      THEN p_completed_date <= p_due_date 
                      ELSE NULL END,
        updated_at = NOW();

    -- Return updated OTDR statistics
    SELECT json_build_object(
        'stage_name', p_stage_name,
        'total_projects', COUNT(*),
        'on_time_projects', COUNT(*) FILTER (WHERE on_time = true),
        'otdr_percentage', ROUND(
            (COUNT(*) FILTER (WHERE on_time = true) * 100.0 / NULLIF(COUNT(*), 0)), 1
        )
    ) INTO result
    FROM otdr_data 
    WHERE stage_name = p_stage_name;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get OTDR statistics for all stages
CREATE OR REPLACE FUNCTION get_otdr_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'stage_name', stage_name,
            'total_projects', total_projects,
            'on_time_projects', on_time_projects,
            'otdr_percentage', otdr_percentage
        )
    ) INTO result
    FROM (
        SELECT 
            stage_name,
            COUNT(*) as total_projects,
            COUNT(*) FILTER (WHERE on_time = true) as on_time_projects,
            ROUND((COUNT(*) FILTER (WHERE on_time = true) * 100.0 / NULLIF(COUNT(*), 0)), 1) as otdr_percentage
        FROM otdr_data 
        GROUP BY stage_name
        ORDER BY stage_name
    ) stats;

    RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql;

-- Function to check upcoming deadlines and queue email reminders
CREATE OR REPLACE FUNCTION check_upcoming_deadlines()
RETURNS TEXT AS $$
DECLARE
    deadline_record RECORD;
    email_count INTEGER := 0;
BEGIN
    -- Find projects with stages due in the next 3 days that aren't completed
    FOR deadline_record IN
        SELECT DISTINCT
            p.id as project_id,
            p.name as project_name,
            p.assignee,
            stage_key as stage_name,
            (stage_value->>'dueDate')::DATE as due_date,
            stage_value->>'person' as person_assigned
        FROM projects p,
        LATERAL jsonb_each(p.stages) AS stage(stage_key, stage_value)
        WHERE (stage_value->>'dueDate')::DATE BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
        AND (stage_value->>'completed')::BOOLEAN = false
        AND stage_value->>'person' IS NOT NULL
        AND stage_value->>'person' != ''
    LOOP
        -- Queue email reminder
        INSERT INTO email_queue (recipient_email, subject, body, project_id, stage_name, status)
        VALUES (
            deadline_record.person_assigned || '@mikroindia.com',
            'Project Deadline Reminder: ' || deadline_record.project_name,
            'Dear ' || deadline_record.person_assigned || ',<br><br>' ||
            'This is a reminder that the ' || deadline_record.stage_name || ' stage for project "' || 
            deadline_record.project_name || '" is due on ' || deadline_record.due_date || '.<br><br>' ||
            'Please ensure completion by the due date.<br><br>' ||
            'Best regards,<br>Project Management System',
            deadline_record.project_id,
            deadline_record.stage_name,
            'queued'
        );
        
        email_count := email_count + 1;
    END LOOP;

    RETURN 'Queued ' || email_count || ' deadline reminder emails';
END;
$$ LANGUAGE plpgsql;

-- Create CRON job to check deadlines daily at 9 AM
SELECT cron.schedule('deadline-checker', '0 9 * * *', 'SELECT check_upcoming_deadlines();');

-- Function to trigger OTDR update when project stages change
CREATE OR REPLACE FUNCTION trigger_otdr_update()
RETURNS TRIGGER AS $$
DECLARE
    stage_record RECORD;
BEGIN
    -- Process each stage in the updated project
    FOR stage_record IN
        SELECT 
            stage_key as stage_name,
            stage_value->>'dueDate' as due_date,
            (stage_value->>'completed')::BOOLEAN as completed,
            stage_value->>'completedTimestamp' as completed_timestamp
        FROM jsonb_each(NEW.stages) AS stage(stage_key, stage_value)
        WHERE stage_value->>'dueDate' IS NOT NULL
    LOOP
        -- Update OTDR data
        PERFORM update_otdr_data(
            NEW.id,
            NEW.name,
            stage_record.stage_name,
            stage_record.due_date::DATE,
            stage_record.completed,
            CASE 
                WHEN stage_record.completed AND stage_record.completed_timestamp != 'Yet to be completed'
                THEN stage_record.completed_timestamp::DATE
                ELSE NULL
            END
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update OTDR when projects change
DROP TRIGGER IF EXISTS update_otdr_on_project_change ON projects;
CREATE TRIGGER update_otdr_on_project_change
    AFTER INSERT OR UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION trigger_otdr_update();
