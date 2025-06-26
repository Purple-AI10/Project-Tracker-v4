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
RETURNS TABLE(employee_id TEXT, name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT e.employee_id, e.name
    FROM employees e
    ORDER BY e.employee_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION validate_employee_login(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_all_employees() TO anon;