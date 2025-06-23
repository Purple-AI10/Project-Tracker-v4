/*
=================================================================
PROJECT TRACKER - MAIN JAVASCRIPT FILE
=================================================================

This file contains all client-side logic for the project tracking application.

MAIN COMPONENTS:
1. Supabase Integration - Real-time database operations
2. Employee Authentication - Simple ID-based login system
3. Project Management - CRUD operations for projects
4. Stage Tracking - Multi-stage project workflow management
5. OTDR (On-Time Delivery Rate) - Performance tracking
6. Email Notifications - Automated deadline reminders
7. Admin Authentication - Role-based access control

GLOBAL VARIABLES:
- projects: Array holding all project data from Supabase
- editingId: ID of project currently being edited (null when adding new)
- isAdminMode: Boolean flag for admin privileges
- currentUser: Current authenticated employee

DEBUGGING TIPS:
- Check browser console for Supabase connection errors
- Verify all required HTML elements exist with correct IDs
- Test admin login with password: 'mikro-admin'
- Check network tab for failed API calls
- Ensure Supabase config is correct and project exists
*/

// ===== GLOBAL STATE VARIABLES =====
let projects = [];          // Main projects array - holds all project data
let editingId = null;       // Currently editing project ID (null = new project)
let isAdminMode = false;    // Admin mode flag - controls edit/delete permissions
let currentUser = null;     // Current authenticated employee
let authData = {};          // Employee authentication data

// ===== EMPLOYEE AUTHENTICATION SYSTEM =====

/**
 * Load employee authentication data from Supabase or fallback to JSON
 * Sets up the employee ID to name mapping for login validation
 */
async function loadAuthData() {
    try {
        // Check if Supabase is available
        if (typeof supabase !== 'undefined') {
            const { data: employees, error } = await supabase
                .from('employees')
                .select('employee_id, name');

            if (!error && employees && employees.length > 0) {
                // Convert array to object for compatibility
                const employeeData = {};
                employees.forEach(emp => {
                    employeeData[emp.employee_id] = emp.name;
                });
                
                authData = employeeData;
                console.log('Employee authentication data loaded from Supabase');
                return employeeData;
            }
        }

        // Fallback to JSON file
        const response = await fetch('auth_ids.json');
        if (!response.ok) {
            throw new Error('Failed to load auth_ids.json');
        }
        
        const employeeData = await response.json();
        authData = employeeData;
        console.log('Employee authentication data loaded from JSON fallback');
        return employeeData;
    } catch (error) {
        console.error('Error loading employee data:', error);
        // Return empty object to prevent further errors
        authData = {};
        return {};
    }
}

/**
 * Validate employee login credentials
 * Checks if the entered employee ID exists in auth_ids.json
 * 
 * @param {string} employeeId - Employee ID entered by user
 * @returns {Object|null} Employee data if valid, null if invalid
 */
function validateEmployee(employeeId) {
    const normalizedId = employeeId.toUpperCase().trim();
    if (authData[normalizedId]) {
        return {
            id: normalizedId,
            name: authData[normalizedId]
        };
    }
    return null;
}

/**
 * Handle employee login form submission
 * Validates credentials and shows main app if successful
 */
function handleEmployeeLogin(event) {
    event.preventDefault();
    const employeeIdInput = document.getElementById('employeeId');
    const employeeId = employeeIdInput.value.trim();
    
    if (!employeeId) {
        showLoginError('Please enter your Employee ID.');
        return;
    }

    const employee = validateEmployee(employeeId);

    if (employee) {
        currentUser = employee;
        showMainApp();
        hideLoginError();
        // Clear the input
        employeeIdInput.value = '';
        // Update user info display
        document.getElementById('userInfo').textContent = `Welcome, ${employee.name}`;
        // Initialize app after successful authentication
        listenForProjects();
        checkUpcomingDeadlines();
    } else {
        showLoginError('Invalid Employee ID. Please check and try again.');
        employeeIdInput.focus();
    }
}

/**
 * Show the main application interface
 * Hides login screen and displays the project tracker
 */
function showMainApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
}

/**
 * Show the employee login screen
 * Displays login modal and hides main app
 */
function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('employeeId').value = '';
}

/**
 * Display login error message
 * @param {string} message - Error message to display
 */
function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

/**
 * Hide login error message
 */
function hideLoginError() {
    document.getElementById('loginError').style.display = 'none';
}

// ===== SUPABASE DATABASE OPERATIONS =====

/**
 * Real-time Supabase listener for projects table
 * Sets up live data synchronization with Supabase
 * Automatically updates UI when database changes occur
 * 
 * DEBUGGING: If projects don't load, check:
 * - Supabase config in index.html
 * - Network connectivity
 * - Supabase table permissions
 */
async function listenForProjects() {
    // Initial load
    await loadProjects();

    // Set up real-time subscription
    supabase
        .channel('projects')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'projects' }, 
            (payload) => {
                console.log('Change received!', payload);
                loadProjects(); // Reload projects when changes occur
            }
        )
        .subscribe();
}

/**
 * Load all projects from Supabase database
 * Fetches project data and updates local projects array
 * Handles data normalization and progress calculation
 */
async function loadProjects() {
    try {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .order('createdat', { ascending: false });

        if (error) {
            console.error('Error loading projects:', error);
            return;
        }

        projects = data.map(project => {
            // Ensure current project stage is set for existing projects
            if (!project.currentprojectstage) {
                project.currentprojectstage = getCurrentProjectStage(project);
            }
            // Recalculate progress if needed
            const newProgress = calculateProgress(project.status, project);
            if (project.progress !== newProgress) {
                project.progress = newProgress;
            }
            return project;
        });

        renderProjects();
        updateStats();
    } catch (error) {
        console.error('Error in loadProjects:', error);
    }
}

/**
 * Add or update a project in Supabase database
 * Handles both new project creation and existing project updates
 * 
 * @param {Object} project - Project object with all required fields
 * 
 * DEBUGGING: If save fails, check:
 * - Project object has all required fields
 * - Supabase write permissions
 * - Network connectivity
 * - Project ID is valid string/number
 */
async function upsertProject(project) {
    try {
        // Convert camelCase to snake_case for Supabase
        const dbProject = {
            id: project.id,
            name: project.name,
            description: project.description,
            status: project.status,
            priority: project.priority,
            assignee: project.assignee,
            progress: project.progress,
            remarks: project.remarks,
            projecttype: project.projectType,
            bu: project.bu,
            stages: project.stages,
            currentprojectstage: project.currentProjectStage,
            createdat: project.createdAt || new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('projects')
            .upsert(dbProject, { onConflict: 'id' });

        if (error) {
            console.error('Error saving project:', error);
            alert("Failed to save project: " + error.message);
        } else {
            console.log('Project saved successfully');
        }
    }
    catch (error) {
        console.error('Error saving project:', error);
        alert("Failed to save project: " + error.message);
    }
}

/**
 * Delete a project from Supabase database
 * @param {string|number} id - Project ID to delete
 */
async function deleteProject(id) {
    if (confirm('Are you sure you want to delete this project?')) {
        try {
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('Error deleting project:', error);
                alert("Failed to delete project: " + error.message);
            }
        }
        catch (error) {
            console.error('Error deleting project:', error);
            alert("Failed to delete project: " + error.message);
        }
    }
}

/**
 * Update stage completion status and OTDR data immediately
 * Handles toggle switch changes in timeline view
 * Updates Supabase, recalculates progress, and syncs OTDR data
 * 
 * @param {string|number} projectId - Unique project identifier
 * @param {string} stage - Stage name (e.g., 'mechanical-design')
 * @param {boolean} isCompleted - New completion status
 * 
 * DEBUGGING: If toggle doesn't work, check:
 * - Admin mode is enabled for write access
 * - Project exists in database
 * - Stage name matches expected values
 * - Network connectivity for OTDR update
 */
async function updateStageCompletion(projectId, stage, isCompleted) {
    const project = projects.find(p => p.id == projectId);
    if (project) {
        if (!project.stages) {
            project.stages = {};
        }
        if (!project.stages[stage]) {
            project.stages[stage] = {};
        }

        project.stages[stage].completed = isCompleted;
        project.stages[stage].completedTimestamp = isCompleted ? new Date().toISOString() : 'Yet to be completed';

        // Update current project stage based on completed toggles
        project.currentProjectStage = getCurrentProjectStage(project);

        // Update progress based on status and completed stages
        project.progress = calculateProgress(project.status, project);

        // Update OTDR data in real-time via backend
        await updateOTDRDataViaBackend(projectId, stage, isCompleted, project);

        await upsertProject(project);

        // Refresh the timeline view immediately
        showTimeline(projectId);
    }
}

// Get in-use project stages (only those with person assigned)
function getInUseStages(project) {
    if (!project.stages) return [];

    const allStages = ['mechanical-design', 'electrical-design', 'manufacturing', 'wiring', 'assembly', 'controls', 'dispatch', 'installation'];
    const inUseStages = [];

    allStages.forEach(stageName => {
        const stage = project.stages[stageName];
        if (stage && stage.person && stage.person.trim() !== '') {
            inUseStages.push(stageName);
        }
    });

    return inUseStages;
}

// Determine current project stage based on completed toggles
function getCurrentProjectStage(project) {
    const inUseStages = getInUseStages(project);
    if (inUseStages.length === 0) return 'mechanical-design';

    // Find the last completed stage
    let currentStage = inUseStages[0];
    for (let i = 0; i < inUseStages.length; i++) {
        const stageName = inUseStages[i];
        const stage = project.stages[stageName];
        if (stage && stage.completed) {
            // If this stage is completed, move to next stage
            if (i < inUseStages.length - 1) {
                currentStage = inUseStages[i + 1];
            } else {
                // All stages completed
                currentStage = inUseStages[inUseStages.length - 1];
            }
        } else {
            // This stage is not completed, so this is the current stage
            break;
        }
    }

    return currentStage;
}

// Get current due date based on current project stage
function getCurrentDueDate(project) {
    if (!project.stages || !project.currentProjectStage) return 'Not set';

    const stage = project.stages[project.currentProjectStage];
    return stage && stage.dueDate ? stage.dueDate : 'Not set';
}

// Check if a stage is overdue
function isStageOverdue(stage) {
    if (!stage.dueDate || stage.completed) return false;
    return new Date(stage.dueDate) < new Date();
}

// Get all overdue projects based on stage deadlines
function getOverdueProjects() {
    return projects.filter(project => {
        if (!project.stages) return false;

        const inUseStages = getInUseStages(project);
        return inUseStages.some(stageName => {
            const stage = project.stages[stageName];
            return stage && isStageOverdue(stage);
        });
    });
}

function renderProjects() {
    const grid = document.getElementById('projectGrid');
    const filteredProjects = getFilteredProjects();

    // Sort projects by creation date (newest first)
    const sortedProjects = filteredProjects.sort((a, b) => {
        const dateA = new Date(a.createdat || a.createdAt);
        const dateB = new Date(b.createdat || b.createdAt);
        return dateB.getTime() - dateA.getTime();
    });

    grid.innerHTML = '';
    sortedProjects.forEach((project) => {
        const projectCard = createProjectCard(project);
        grid.appendChild(projectCard);
    });
}

function createProjectCard(project) {
    const card = document.createElement('div');
    card.className = `project-card priority-${project.priority} fade-in`;

    const currentStage = project.currentProjectStage || project.currentprojectstage || 'design';
    const currentDueDate = getCurrentDueDate(project);

    card.innerHTML = `
        <div class="project-header">
            <div>
                <div class="project-title">${project.name}</div>
                <div class="status-badge status-${project.status}">${project.status}</div>
            </div>
        </div>
        <div class="project-description">${project.description}</div>
        <div class="project-meta">
            <div class="meta-item">
                <span class="meta-icon">👤</span>
                <span>${project.assignee}</span>
            </div>
            <div class="meta-item">
                <span class="meta-icon">⚡</span>
                <span>${currentStage.replace(/-/g, ' ').toUpperCase()}</span>
            </div>
            <div class="meta-item">
                <span class="meta-icon">🏢</span>
                <span>${project.bu ? project.bu.toUpperCase() : 'N/A'}</span>
            </div>
            <div class="meta-item">
                <span class="meta-icon">📅</span>
                <span>Due: ${currentDueDate !== 'Not set' ? formatDate(currentDueDate) : 'Not set'}</span>
            </div>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${project.progress}%"></div>
        </div>
        ${project.remarks ? `<div class="project-remarks"><strong>Remarks:</strong> ${project.remarks}</div>` : ''}
        <div class="project-actions">
            <button class="btn btn-small btn-info" onclick="showTimeline(${project.id})">📅 Timeline</button>
            ${isAdminMode ? `
                <button class="btn btn-small btn-secondary" onclick="editProject(${project.id})">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteProject(${project.id})">Delete</button>
            ` : ''}
        </div>
    `;
    return card;
}

function getFilteredProjects() {
    const statusFilter = document.getElementById('filterStatus').value;
    const priorityFilter = document.getElementById('filterPriority').value;
    const projectTypeFilter = document.getElementById('filterProjectType').value;
    const buFilter = document.getElementById('filterBU').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    return projects.filter((project) => {
        const projectType = project.projecttype || project.projectType;
        const matchesStatus = !statusFilter || project.status === statusFilter;
        const matchesPriority = !priorityFilter || project.priority === priorityFilter;
        const matchesProjectType = !projectTypeFilter || projectType === projectTypeFilter;
        const matchesBU = !buFilter || buFilter === 'other' || project.bu === buFilter;
        const matchesSearch = !searchTerm ||
            project.name.toLowerCase().includes(searchTerm) ||
            project.description.toLowerCase().includes(searchTerm) ||
            project.assignee.toLowerCase().includes(searchTerm);

        return matchesStatus && matchesPriority && matchesProjectType && matchesBU && matchesSearch;
    });
}

function updateStats() {
    const total = projects.length;
    const active = projects.filter((p) => p.status === 'active').length;
    const completed = projects.filter((p) => p.status === 'completed').length;
    const overdue = getOverdueProjects().length;

    document.getElementById('totalProjects').textContent = total.toString();
    document.getElementById('activeProjects').textContent = active.toString();
    document.getElementById('completedProjects').textContent = completed.toString();
    document.getElementById('overdueProjects').textContent = overdue.toString();
}

function calculateProgress(status, project) {
    if (status === 'completed') return 100;
    if (status === 'yet-to-start') return 0;

    const inUseStages = getInUseStages(project);
    if (inUseStages.length === 0) return 0;

    // Count completed stages
    let completedStages = 0;
    inUseStages.forEach(stageName => {
        const stage = project.stages[stageName];
        if (stage && stage.completed) {
            completedStages++;
        }
    });

    // Calculate progress up to 90% based on completed stages, 100% only when status is completed
    const progressPerStage = 90 / inUseStages.length;
    return Math.min(90, completedStages * progressPerStage);
}

function openModal(project = null) {
    const modal = document.getElementById('projectModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('projectForm');

    if (project) {
        title.textContent = 'Edit Project';
        editingId = project.id;
        document.getElementById('projectName').value = project.name;
        document.getElementById('projectDescription').value = project.description;
        document.getElementById('projectStatus').value = project.status;
        document.getElementById('projectAssignee').value = project.assignee;
        document.getElementById('projectRemarks').value = project.remarks || '';
        document.getElementById('projectType').value = project.projecttype || project.projectType || '';
        document.getElementById('projectBU').value = project.bu || '';

        // Populate stage fields if they exist
        if (project.stages) {
            document.getElementById('mechanicalDesignPerson').value = project.stages['mechanical-design']?.person || '';
            document.getElementById('mechanicalDesignTime').value = project.stages['mechanical-design']?.dueDate || '';
            document.getElementById('electricalDesignPerson').value = project.stages['electrical-design']?.person || '';
            document.getElementById('electricalDesignTime').value = project.stages['electrical-design']?.dueDate || '';
            document.getElementById('manufacturingPerson').value = project.stages['manufacturing']?.person || '';
            document.getElementById('manufacturingTime').value = project.stages['manufacturing']?.dueDate || '';
            document.getElementById('wiringPerson').value = project.stages['wiring']?.person || '';
            document.getElementById('wiringTime').value = project.stages['wiring']?.dueDate || '';
            document.getElementById('assemblyPerson').value = project.stages['assembly']?.person || '';
            document.getElementById('assemblyTime').value = project.stages['assembly']?.dueDate || '';
            document.getElementById('controlsPerson').value = project.stages['controls']?.person || '';
            document.getElementById('controlsTime').value = project.stages['controls']?.dueDate || '';
            document.getElementById('dispatchPerson').value = project.stages['dispatch']?.person || '';
            document.getElementById('dispatchTime').value = project.stages['dispatch']?.dueDate || '';
            document.getElementById('installationPerson').value = project.stages['installation']?.person || '';
            document.getElementById('installationTime').value = project.stages['installation']?.dueDate || '';
        }
    }
    else {
        title.textContent = 'Add New Project';
        editingId = null;
        form.reset();
        document.getElementById('projectType').value = '';
        document.getElementById('projectBU').value = '';

        // Reset stage fields
        document.getElementById('mechanicalDesignPerson').value = '';
        document.getElementById('mechanicalDesignTime').value = '';
        document.getElementById('electricalDesignPerson').value = '';
        document.getElementById('electricalDesignTime').value = '';
        document.getElementById('manufacturingPerson').value = '';
        document.getElementById('manufacturingTime').value = '';
        document.getElementById('wiringPerson').value = '';
        document.getElementById('wiringTime').value = '';
        document.getElementById('assemblyPerson').value = '';
        document.getElementById('assemblyTime').value = '';
        document.getElementById('controlsPerson').value = '';
        document.getElementById('controlsTime').value = '';
        document.getElementById('dispatchPerson').value = '';
        document.getElementById('dispatchTime').value = '';
        document.getElementById('installationPerson').value = '';
        document.getElementById('installationTime').value = '';
    }
    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('projectModal').style.display = 'none';
    editingId = null;
}

function editProject(id) {
    const project = projects.find((p) => p.id == id);
    if (project) {
        openModal(project);
    }
}

function filterProjects() {
    renderProjects();
}

function filterByStatus(status) {
    document.getElementById('filterStatus').value = status;
    filterProjects();
}

function filterByOverdue() {
    // Reset other filters and show only overdue projects
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterPriority').value = '';
    document.getElementById('filterProjectType').value = '';
    document.getElementById('filterBU').value = '';
    document.getElementById('searchInput').value = '';

    // Filter to show only overdue projects
    const grid = document.getElementById('projectGrid');
    const overdueProjects = getOverdueProjects();

    grid.innerHTML = '';
    overdueProjects.forEach((project) => {
        const projectCard = createProjectCard(project);
        grid.appendChild(projectCard);
    });
}

function clearAllFilters() {
    // Reset all filters to show all projects
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterPriority').value = '';
    document.getElementById('filterProjectType').value = '';
    document.getElementById('filterBU').value = '';
    document.getElementById('searchInput').value = '';

    // Re-render all projects
    renderProjects();
}

function exportData() {
    if (projects.length === 0) {
        alert('No projects to export');
        return;
    }

    const headers = ['ID', 'Name', 'Description', 'Status', 'Project Stage', 'Project Manager', 'Progress (%)', 'Remarks', 'Project Type', 'BU', 'Created At'];

    const csvRows = [
        headers.join(','),
        ...projects.map((project) => [
            project.id,
            `"${project.name.replace(/"/g, '""')}"`,
            `"${project.description.replace(/"/g, '""')}"`,
            project.status,
            project.priority,
            `"${project.assignee.replace(/"/g, '""')}"`,
            project.progress,
            `"${(project.remarks || '').replace(/"/g, '""')}"`,
            project.projecttype || project.projectType || '',
            project.bu || '',
            project.createdat || project.createdAt
        ].join(','))
    ];

    const csvContent = csvRows.join('\n');
    const dataBlob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'projects_export.csv';
    link.click();
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showAdminLogin() {
    document.getElementById('adminModal').style.display = 'flex';
    document.getElementById('adminPassword').value = '';
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
}

function logoutAdmin() {
    isAdminMode = false;
    document.getElementById('adminOnlyControls').style.display = 'none';
    const adminBtn = document.getElementById('adminLoginBtn');
    adminBtn.textContent = 'Admin Login';
    adminBtn.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
    adminBtn.onclick = showAdminLogin;
    renderProjects();
}

function showTimeline(projectId = null) {
    const modal = document.getElementById('timelineModal');
    const content = document.getElementById('timelineContent');

    if (projectId) {
        const project = projects.find(p => p.id == projectId);
        if (project && project.stages) {
            const inUseStages = getInUseStages(project);
            const stageLabels = {
                'mechanical-design': 'Mechanical Design',
                'electrical-design': 'Electrical Design', 
                'manufacturing': 'Manufacturing',
                'wiring': 'Wiring',
                'assembly': 'Assembly',
                'controls': 'Controls',
                'dispatch': 'Ready for Dispatch',
                'installation': 'Installation & Commissioning'
            };

            let stagesHTML = '';
            inUseStages.forEach((stageName, index) => {
                stagesHTML += generateStageHTML(stageName, index + 1, stageLabels[stageName], project);
            });

            content.innerHTML = `
                <div class="project-timeline-header">
                    <h3>${project.name} - Timeline</h3>
                </div>
                <div class="timeline-stages">
                    ${stagesHTML}
                </div>
            `;
        }
    } else {
        content.innerHTML = `
            <div class="timeline-stages">
                <div class="timeline-stage">
                    <div class="stage-number">1</div>
                    <div class="stage-info">
                        <h3>Design</h3>
                        <p>Initial design and planning phase</p>
                    </div>
                </div>
                <div class="timeline-stage">
                    <div class="stage-number">2</div>
                    <div class="stage-info">
                        <h3>Production</h3>
                        <p>Manufacturing and production phase</p>
                    </div>
                </div>
                <div class="timeline-stage">
                    <div class="stage-number">3</div>
                    <div class="stage-info">
                        <h3>Controls</h3>
                        <p>Control systems integration</p>
                    </div>
                </div>
                <div class="timeline-stage">
                    <div class="stage-number">4</div>
                    <div class="stage-info">
                        <h3>Ready for Dispatch</h3>
                        <p>Final preparation and dispatch</p>
                    </div>
                </div>
                <div class="timeline-stage">
                    <div class="stage-number">5</div>
                    <div class="stage-info">
                        <h3>Installation & Commissioning</h3>
                        <p>On-site installation and commissioning</p>
                    </div>
                </div>
            </div>
        `;
    }

    modal.style.display = 'flex';
}

function generateStageHTML(stageName, number, title, project) {
    const stage = project.stages[stageName] || {};
    const isCompleted = stage.completed || false;
    const isOverdue = isStageOverdue(stage);
    const toggleDisabled = !isAdminMode ? 'disabled' : '';

    return `
        <div class="timeline-stage">
            <div class="stage-number">${number}</div>
            <div class="stage-info">
                <div class="stage-completion">
                    <h3>${title}</h3>
                    <label class="toggle-switch ${toggleDisabled}">
                        <input type="checkbox" ${isCompleted ? 'checked' : ''} 
                               onchange="updateStageCompletion(${project.id}, '${stageName}', this.checked)"
                               ${!isAdminMode ? 'disabled' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <p>Person: ${stage.person || 'Not assigned'}</p>
                <p>Due Date: ${stage.dueDate ? formatDate(stage.dueDate) : 'Not set'}</p>
                ${isCompleted ? `<p class="completion-status">✅ Completed: ${stage.completedTimestamp ? formatDate(stage.completedTimestamp) : 'N/A'}</p>` : 
                  isOverdue ? `<p class="completion-status">⚠️ Overdue</p>` : 
                  `<p class="completion-status">⏳ In Progress</p>`}
            </div>
        </div>
    `;
}

function closeTimelineModal() {
    document.getElementById('timelineModal').style.display = 'none';
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');

    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('sidebar-collapsed');
}

// Form submission handler and modal logic
document.addEventListener('DOMContentLoaded', function () {
    // Load authentication data and show login screen
    loadAuthData().then(() => {
        showLoginScreen();
    });

    // Employee login form submission
    document.getElementById('employeeLoginForm').addEventListener('submit', handleEmployeeLogin);

    document.getElementById('projectForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        // Validate required fields and convert to uppercase
        const name = document.getElementById('projectName').value.trim().toUpperCase();
        const description = document.getElementById('projectDescription').value.trim().toUpperCase();
        const assignee = document.getElementById('projectAssignee').value.trim().toUpperCase();
        const projectType = document.getElementById('projectType').value;
        const bu = document.getElementById('projectBU').value;

        if (!name || !description || !assignee || !projectType || !bu) {
            alert('Please fill in all required fields');
            return;
        }

        const status = document.getElementById('projectStatus').value;
        const progress = calculateProgress(status, { stages: {} });

        const formData = {
            name: name,
            description: description,
            status: status,
            priority: 'design',
            assignee: assignee,
            progress: progress,
            remarks: document.getElementById('projectRemarks').value.toUpperCase() || '',
            projectType: projectType,
            bu: bu,
            stages: {
                'mechanical-design': {
                    person: document.getElementById('mechanicalDesignPerson').value.toUpperCase() || '',
                    dueDate: document.getElementById('mechanicalDesignTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'electrical-design': {
                    person: document.getElementById('electricalDesignPerson').value.toUpperCase() || '',
                    dueDate: document.getElementById('electricalDesignTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'manufacturing': {
                    person: document.getElementById('manufacturingPerson').value.toUpperCase() || '',
                    dueDate: document.getElementById('manufacturingTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'wiring': {
                    person: document.getElementById('wiringPerson').value.toUpperCase() || '',
                    dueDate: document.getElementById('wiringTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'assembly': {
                    person: document.getElementById('assemblyPerson').value.toUpperCase() || '',
                    dueDate: document.getElementById('assemblyTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'controls': {
                    person: document.getElementById('controlsPerson').value.toUpperCase() || '',
                    dueDate: document.getElementById('controlsTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'dispatch': {
                    person: document.getElementById('dispatchPerson').value.toUpperCase() || '',
                    dueDate: document.getElementById('dispatchTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'installation': {
                    person: document.getElementById('installationPerson').value.toUpperCase() || '',
                    dueDate: document.getElementById('installationTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                }
            }
        };

        let project;
        if (editingId) {
            const index = projects.findIndex((p) => p.id == editingId);
            if (index !== -1) {
                const existingProject = projects[index];
                project = { ...existingProject, ...formData };

                // Preserve existing stage completion status and timestamps
                if (existingProject.stages) {
                    Object.keys(project.stages).forEach(stageName => {
                        if (existingProject.stages[stageName]) {
                            project.stages[stageName].completed = existingProject.stages[stageName].completed;
                            project.stages[stageName].completedTimestamp = existingProject.stages[stageName].completedTimestamp;
                        }
                    });
                }

                // Set current project stage based on completed toggles
                project.currentProjectStage = getCurrentProjectStage(project);
                // Recalculate progress based on new values
                project.progress = calculateProgress(project.status, project);
                projects[index] = project;
            }
        }
```text

        else {
            project = {
                id: Date.now(),
                ...formData,
                createdAt: new Date().toISOString()
            };
            // Set initial current project stage and progress
            project.currentProjectStage = getCurrentProjectStage(project);
            project.progress = calculateProgress(project.status, project);
            projects.push(project);
        }

        try {
            await upsertProject(project);
            closeModal();
            // Force a refresh of the projects list
            renderProjects();
            updateStats();
        } catch (error) {
            console.error('Error saving project:', error);
            alert('Failed to save project. Please try again.');
        }
    });

    // Modal click outside to close
    document.getElementById('projectModal').addEventListener('click', function (e) {
        if (e.target === this) {
            closeModal();
        }
    });

    // Admin form submission
    document.getElementById('adminForm').addEventListener('submit', function (e) {
        e.preventDefault();
        const password = document.getElementById('adminPassword').value;
        if (password === 'mikro-admin') {
            isAdminMode = true;
            document.getElementById('adminOnlyControls').style.display = 'inline-block';
            const adminBtn = document.getElementById('adminLoginBtn');
            adminBtn.textContent = 'Admin Mode';
            adminBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            adminBtn.onclick = logoutAdmin;
            closeAdminModal();
            renderProjects();
        }
        else {
            alert('Incorrect password');
        }
    });

    // Close admin modal when clicking outside
    document.getElementById('adminModal').addEventListener('click', function (e) {
        if (e.target === this) {
            closeAdminModal();
        }
    });

    // Close timeline modal when clicking outside
    document.getElementById('timelineModal').addEventListener('click', function (e) {
        if (e.target === this) {
            closeTimelineModal();
        }
    });

    // Close OTDR modal when clicking outside
    document.getElementById('otdrModal').addEventListener('click', function (e) {
        if (e.target === this) {
            closeOTDRModal();
        }
    });
});

// Real-time OTDR update via backend
async function updateOTDRDataViaBackend(projectId, stageName, isCompleted, project) {
    const stage = project.stages[stageName];
    if (!stage || !stage.person || stage.person.trim() === '') return;

    try {
        const response = await fetch('/update-otdr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectId: projectId,
                projectName: project.name,
                stageName: stageName,
                dueDate: stage.dueDate,
                completed: isCompleted,
                completedDate: isCompleted ? new Date().toISOString().split('T')[0] : null
            })
        });

        if (response.ok) {
            console.log(`OTDR data updated for ${stageName}`);
        } else {
            console.error('Failed to update OTDR data');
        }
    } catch (error) {
        console.error('Error updating OTDR data:', error);
    }
}

async function showOTDRModal() {
    const modal = document.getElementById('otdrModal');
    const content = document.getElementById('otdrContent');

    try {
        // Fetch OTDR stats from Supabase
        const response = await fetch('/api/otdr-stats');
        let otdrData = [];

        if (response.ok) {
            const result = await response.json();
            otdrData = result.data || [];
        }

        const stageLabels = {
            'mechanical-design': 'Mechanical Design',
            'electrical-design': 'Electrical Design',
            'manufacturing': 'Manufacturing', 
            'wiring': 'Wiring',
            'assembly': 'Assembly',
            'controls': 'Controls',
            'dispatch': 'Ready for Dispatch',
            'installation': 'Installation & Commissioning'
        };

        let otdrHTML = '<div class="otdr-list">';

        if (otdrData.length === 0) {
            otdrHTML += '<div class="otdr-item"><div class="otdr-stage-name">No OTDR data available</div></div>';
        } else {
            otdrData.forEach(stage => {
                const stageName = stage.stage_name;
                const displayName = stageLabels[stageName] || stageName;
                
                otdrHTML += `
                    <div class="otdr-item">
                        <div class="otdr-stage-name">${displayName}</div>
                        <div class="otdr-stats">
                            <span class="otdr-score">${stage.otdr_percentage || 0}%</span>
                            <span class="otdr-details">(${stage.on_time_projects || 0}/${stage.total_projects || 0} projects on time)</span>
                        </div>
                    </div>
                `;
            });
        }

        otdrHTML += '</div>';
        content.innerHTML = otdrHTML;
        modal.style.display = 'flex';
    } catch (error) {
        console.error('Error loading OTDR data:', error);
        content.innerHTML = '<div class="otdr-list"><div class="otdr-item"><div class="otdr-stage-name">Error loading OTDR data</div></div></div>';
        modal.style.display = 'flex';
    }
}

function closeOTDRModal() {
    document.getElementById('otdrModal').style.display = 'none';
}

// Check for upcoming deadlines and send email reminders - runs daily 1-3 PM Indian time
function checkUpcomingDeadlines() {
    const now = new Date();
    const currentHour = now.getHours();

    // Check if it's March 31st and reset OTDR data
    if (now.getMonth() === 2 && now.getDate() === 31) { // March is month 2 (0-indexed)
        resetOTDRAnnually();
    }

    // Only send emails between 1 PM and 3 PM Indian time to avoid spam
    if (currentHour < 13 || currentHour >= 15 ) {
        console.log('Email check skipped - outside business hours (1-3 PM Indian time)');
        return;
    }

    const today = new Date();
    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(today.getDate() + 5);

    console.log(`Checking deadlines at ${now.toLocaleString()} for due date: ${fiveDaysFromNow.toDateString()}`);

    projects.forEach(project => {
        if (!project.stages) return;

        const inUseStages = getInUseStages(project);
        inUseStages.forEach(stageName => {
            const stage = project.stages[stageName];
            if (stage && stage.dueDate && !stage.completed && stage.person && stage.person.trim() !== '') {
                const dueDate = new Date(stage.dueDate);
                const timeDiff = dueDate.getTime() - today.getTime();
                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

                // Send email if exactly 5 days before due date
                if (daysDiff === 5) {
                    console.log(`Sending reminder for project: ${project.name}, stage: ${stageName}, due: ${stage.dueDate}`);
                    sendEmailReminder(project, stageName, stage);
                }
            }
        });
    });
}

async function sendEmailReminder(project, stageName, stage) {
    try {
        const emailResponse = await fetch('email-database.json');
        const emails = await emailResponse.json();

        const recipientEmail = emails[stageName];

        // Skip sending email for dispatch stage as there's no email configured
        if (stageName === 'dispatch') {
            console.log(`Skipping email for dispatch stage - no email configured`);
            return;
        }

        if (recipientEmail) {
            const emailData = {
                to: recipientEmail,
                subject: `Project Deadline Reminder - ${project.name}`,
                text: `Dear Team,

This is a reminder that the ${stageName.replace(/-/g, ' ')} stage for project "${project.name}" is due in 5 days.

Project Details:
- Project Name: ${project.name}
- Description: ${project.description}
- Stage: ${stageName.replace(/-/g, ' ').toUpperCase()}
- Due Date: ${stage.dueDate}
- Person in Charge: ${stage.person}

Please ensure timely completion.

Best regards,
Projects Team`,
                html: `
                <h3>Project Deadline Reminder</h3>
                <p>Dear Team,</p>
                <p>This is a reminder that the <strong>${stageName.replace(/-/g, ' ')}</strong> stage for project "<strong>${project.name}</strong>" is due in 5 days.</p>

                <h4>Project Details:</h4>
                <ul>
                    <li><strong>Project Name:</strong> ${project.name}</li>
                    <li><strong>Description:</strong> ${project.description}</li>
                    <li><strong>Stage:</strong> ${stageName.replace(/-/g, ' ').toUpperCase()}</li>
                    <li><strong>Due Date:</strong> ${stage.dueDate}</li>
                    <li><strong>Person in Charge:</strong> ${stage.person}</li>
                </ul>

                <p>Please ensure timely completion.</p>
                <p>Best regards,<br>Projects Team</p>
                `
            };

            const response = await fetch('/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(emailData)
            });

            const result = await response.json();
            if (result.success) {
                console.log(`Email reminder sent successfully to ${recipientEmail}`);
            } else {
                console.error('Failed to send email:', result.error);
            }
        }
    } catch (error) {
        console.error('Error sending email reminder:', error);
    }
}

// Reset OTDR data annually on March 31st
async function resetOTDRAnnually() {
    const stageNames = ['mechanical-design', 'electrical-design', 'manufacturing', 'wiring', 'assembly', 'controls', 'dispatch', 'installation'];

    console.log('Resetting OTDR data for new fiscal year...');

    for (const stageName of stageNames) {
        try {
            const resetData = {
                stageName: stageName,
                projects: [],
                totalProjects: 0,
                onTimeProjects: 0,
                otdr: 0
            };

            const response = await fetch('/reset-otdr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    stageName: stageName,
                    data: resetData
                })
            });

            if (response.ok) {
                console.log(`OTDR data reset for ${stageName}`);
            } else {
                console.error(`Failed to reset OTDR data for ${stageName}`);
            }
        } catch (error) {
            console.error(`Error resetting OTDR data for ${stageName}:`, error);
        }
    }
}

// Run deadline check on page load and every hour (will only send emails at 1-3 PM)
setInterval(checkUpcomingDeadlines, 3600000); // Check every hour, but emails only sent 1-3 PM

// Make functions available globally for onclick handlers
window.openModal = openModal;
window.closeModal = closeModal;
window.editProject = editProject;
window.deleteProject = deleteProject;
window.filterProjects = filterProjects;
window.filterByStatus = filterByStatus;
window.filterByOverdue = filterByOverdue;
window.clearAllFilters = clearAllFilters;
window.exportData = exportData;
window.showAdminLogin = showAdminLogin;
window.closeAdminModal = closeAdminModal;
window.logoutAdmin = logoutAdmin;
window.toggleSidebar = toggleSidebar;
window.showTimeline = showTimeline;
window.closeTimelineModal = closeTimelineModal;
window.updateStageCompletion = updateStageCompletion;
window.showOTDRModal = showOTDRModal;
window.closeOTDRModal = closeOTDRModal;