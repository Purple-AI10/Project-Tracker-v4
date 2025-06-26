
-- Drop existing functions first
DROP FUNCTION IF EXISTS validate_employee_login(TEXT);
DROP FUNCTION IF EXISTS get_all_employees();

-- Create a function to validate employee authentication
CREATE OR REPLACE FUNCTION validate_employee_login(employee_id_input TEXT)
RETURNS JSON AS $$
DECLARE
    employee_record RECORD;
    result JSON;
BEGIN
    -- Check if employee exists
    SELECT employee_id, name INTO employee_record
    FROM employees 
    WHERE employee_id = UPPER(TRIM(employee_id_input));

    IF FOUND THEN
        result := json_build_object(
            'success', true,
            'message', 'Employee authenticated successfully',
            'employee', json_build_object(
                'id', employee_record.employee_id,
                'name', employee_record.name
            )
        );
    ELSE
        result := json_build_object(
            'success', false,
            'message', 'Invalid employee ID',
            'employee', null
        );
    END IF;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get all employees (for fallback auth data loading)
CREATE OR REPLACE FUNCTION get_all_employees()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'employee_id', employee_id,
            'name', name
        )
    ) INTO result
    FROM employees
    ORDER BY employee_id;
    
    RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION validate_employee_login(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_all_employees() TO anon;
