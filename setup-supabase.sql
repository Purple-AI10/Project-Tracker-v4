
-- Run this SQL in your Supabase SQL Editor to create the projects table

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

-- Enable Row Level Security (optional)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON projects
    FOR ALL USING (auth.role() = 'authenticated');
