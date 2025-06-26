
-- Create a function to validate employee authentication
CREATE OR REPLACE FUNCTION validate_employee_login(employee_id_input TEXT)
RETURNS JSON AS $$
DECLARE
    employee_record employees%ROWTYPE;
    result JSON;
BEGIN
    -- Normalize the input (convert to uppercase and trim)
    employee_id_input := UPPER(TRIM(employee_id_input));
    
    -- Try to find the employee
    SELECT * INTO employee_record 
    FROM employees 
    WHERE employee_id = employee_id_input;
    
    -- Check if employee was found
    IF FOUND THEN
        -- Return success with employee data
        SELECT json_build_object(
            'success', true,
            'employee', json_build_object(
                'id', employee_record.employee_id,
                'name', employee_record.name,
                'email', employee_record.email
            ),
            'message', 'Employee authenticated successfully'
        ) INTO result;
    ELSE
        -- Return failure
        SELECT json_build_object(
            'success', false,
            'employee', null,
            'message', 'Invalid Employee ID'
        ) INTO result;
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get all employees for client-side validation
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
