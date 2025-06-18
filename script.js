
let projects = [];
let editingId = null;
let isAdminMode = false;

// Real-time Firestore listener for projects collection
function listenForProjects() {
    db.collection("projects").onSnapshot((snapshot) => {
        projects = snapshot.docs.map((doc) => {
            const project = { ...doc.data(), id: doc.id };
            // Ensure current project stage is set for existing projects
            if (!project.currentProjectStage) {
                project.currentProjectStage = getCurrentProjectStage(project);
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
    });
}

// Add or update a project in Firestore
async function upsertProject(project) {
    try {
        await db.collection("projects").doc(String(project.id)).set(project);
    }
    catch (error) {
        console.error('Error saving project:', error);
        alert("Failed to save project: " + error.message);
    }
}

// Delete a project in Firestore
async function deleteProject(id) {
    if (confirm('Are you sure you want to delete this project?')) {
        try {
            await db.collection("projects").doc(String(id)).delete();
        }
        catch (error) {
            console.error('Error deleting project:', error);
            alert("Failed to delete project: " + error.message);
        }
    }
}

// Update stage completion status
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
        
        // Update OTDR data
        await updateOTDRData(projectId, stage, isCompleted);
        
        await upsertProject(project);
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
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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

    const currentStage = project.currentProjectStage || 'design';
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
        const matchesStatus = !statusFilter || project.status === statusFilter;
        const matchesPriority = !priorityFilter || project.priority === priorityFilter;
        const matchesProjectType = !projectTypeFilter || project.projectType === projectTypeFilter;
        const matchesBU = !buFilter || buFilter === 'all' || project.bu === buFilter;
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
        document.getElementById('projectType').value = project.projectType || '';
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
            project.projectType || '',
            project.bu || '',
            project.createdAt
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

function loadSampleData() {
    if (projects.length === 0) {
        const sampleProjects = [
            {
                id: Date.now() + 1,
                name: "E-commerce Platform Redesign",
                description: "Complete overhaul of the existing e-commerce platform with modern UI/UX",
                status: "active",
                priority: "production",
                assignee: "Sarah Johnson",
                progress: 20,
                remarks: "UI mockups completed, backend integration in progress",
                projectType: "p-new",
                bu: "global",
                createdAt: new Date().toISOString(),
                stages: {
                    design: { person: 'John Doe', dueDate: '2025-02-15', completed: false, completedTimestamp: 'Yet to be completed' },
                    production: { person: 'Jane Smith', dueDate: '2025-03-01', completed: false, completedTimestamp: 'Yet to be completed' }
                }
            }
        ];
        sampleProjects.forEach(async (p) => {
            await upsertProject(p);
        });
    }
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
                    <p>Showing only stages with assigned personnel</p>
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
    listenForProjects();
    checkUpcomingDeadlines(); // Check for upcoming deadlines on page load

    document.getElementById('projectForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        
        // Validate required fields
        const name = document.getElementById('projectName').value.trim();
        const description = document.getElementById('projectDescription').value.trim();
        const assignee = document.getElementById('projectAssignee').value.trim();
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
            remarks: document.getElementById('projectRemarks').value || '',
            projectType: projectType,
            bu: bu,
            stages: {
                'mechanical-design': {
                    person: document.getElementById('mechanicalDesignPerson').value || '',
                    dueDate: document.getElementById('mechanicalDesignTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'electrical-design': {
                    person: document.getElementById('electricalDesignPerson').value || '',
                    dueDate: document.getElementById('electricalDesignTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'manufacturing': {
                    person: document.getElementById('manufacturingPerson').value || '',
                    dueDate: document.getElementById('manufacturingTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'wiring': {
                    person: document.getElementById('wiringPerson').value || '',
                    dueDate: document.getElementById('wiringTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'assembly': {
                    person: document.getElementById('assemblyPerson').value || '',
                    dueDate: document.getElementById('assemblyTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'controls': {
                    person: document.getElementById('controlsPerson').value || '',
                    dueDate: document.getElementById('controlsTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'dispatch': {
                    person: document.getElementById('dispatchPerson').value || '',
                    dueDate: document.getElementById('dispatchTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                'installation': {
                    person: document.getElementById('installationPerson').value || '',
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
                project = { ...projects[index], ...formData };
                // Set current project stage based on completed toggles
                project.currentProjectStage = getCurrentProjectStage(project);
                // Recalculate progress based on new values
                project.progress = calculateProgress(project.status, project);
                projects[index] = project;
            }
        }
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

// OTDR tracking functions
async function updateOTDRData(projectId, stageName, isCompleted) {
    const project = projects.find(p => p.id == projectId);
    if (!project || !project.stages[stageName]) return;
    
    try {
        const response = await fetch(`otdr-data/${stageName}-otdr.json`);
        let otdrData;
        
        if (response.ok) {
            otdrData = await response.json();
        } else {
            otdrData = {
                stageName: stageName,
                projects: [],
                totalProjects: 0,
                onTimeProjects: 0,
                otdr: 0
            };
        }
        
        const stage = project.stages[stageName];
        const existingProject = otdrData.projects.find(p => p.projectId === projectId);
        
        if (!existingProject && stage.person && stage.person.trim() !== '') {
            // Add new project to OTDR tracking
            otdrData.projects.push({
                projectId: projectId,
                projectName: project.name,
                dueDate: stage.dueDate,
                completed: isCompleted,
                completedDate: isCompleted ? new Date().toISOString().split('T')[0] : null,
                onTime: null
            });
            otdrData.totalProjects++;
        } else if (existingProject) {
            // Update existing project
            existingProject.completed = isCompleted;
            if (isCompleted) {
                const completedDate = new Date().toISOString().split('T')[0];
                existingProject.completedDate = completedDate;
                existingProject.onTime = new Date(completedDate) <= new Date(existingProject.dueDate);
                
                if (existingProject.onTime) {
                    otdrData.onTimeProjects++;
                }
            }
        }
        
        // Recalculate OTDR
        const completedProjects = otdrData.projects.filter(p => p.completed);
        otdrData.onTimeProjects = completedProjects.filter(p => p.onTime).length;
        otdrData.otdr = otdrData.totalProjects > 0 ? (otdrData.onTimeProjects / otdrData.totalProjects * 100).toFixed(1) : 0;
        
        // Save updated OTDR data (this would require a backend in a real application)
        console.log(`Updated OTDR data for ${stageName}:`, otdrData);
        
    } catch (error) {
        console.error('Error updating OTDR data:', error);
    }
}

async function showOTDRModal() {
    const modal = document.getElementById('otdrModal');
    const content = document.getElementById('otdrContent');
    
    const stageNames = ['mechanical-design', 'electrical-design', 'manufacturing', 'wiring', 'assembly', 'controls', 'dispatch', 'installation'];
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
    
    for (const stageName of stageNames) {
        try {
            const response = await fetch(`otdr-data/${stageName}-otdr.json`);
            let otdrData;
            
            if (response.ok) {
                otdrData = await response.json();
            } else {
                otdrData = { otdr: 0, totalProjects: 0, onTimeProjects: 0 };
            }
            
            otdrHTML += `
                <div class="otdr-item">
                    <div class="otdr-stage-name">${stageLabels[stageName]}</div>
                    <div class="otdr-stats">
                        <span class="otdr-score">${otdrData.otdr}%</span>
                        <span class="otdr-details">(${otdrData.onTimeProjects}/${otdrData.totalProjects} projects on time)</span>
                    </div>
                </div>
            `;
        } catch (error) {
            otdrHTML += `
                <div class="otdr-item">
                    <div class="otdr-stage-name">${stageLabels[stageName]}</div>
                    <div class="otdr-stats">
                        <span class="otdr-score">0%</span>
                        <span class="otdr-details">(No data available)</span>
                    </div>
                </div>
            `;
        }
    }
    
    otdrHTML += '</div>';
    content.innerHTML = otdrHTML;
    modal.style.display = 'flex';
}

function closeOTDRModal() {
    document.getElementById('otdrModal').style.display = 'none';
}

// Check for upcoming deadlines and send email reminders (simulated)
function checkUpcomingDeadlines() {
    const today = new Date();
    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(today.getDate() + 5);
    
    projects.forEach(project => {
        if (!project.stages) return;
        
        const inUseStages = getInUseStages(project);
        inUseStages.forEach(stageName => {
            const stage = project.stages[stageName];
            if (stage && stage.dueDate && !stage.completed) {
                const dueDate = new Date(stage.dueDate);
                if (dueDate.toDateString() === fiveDaysFromNow.toDateString()) {
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

// Run deadline check on page load and every hour
setInterval(checkUpcomingDeadlines, 3600000); // Check every hour

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
