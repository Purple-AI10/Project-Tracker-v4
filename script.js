
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
            const newProgress = calculateProgress(project.status, project.currentProjectStage);
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
        
        // Update progress based on status and current stage
        project.progress = calculateProgress(project.status, project.currentProjectStage);
        
        await upsertProject(project);
    }
}

// Determine current project stage based on completed toggles
function getCurrentProjectStage(project) {
    if (!project.stages) return 'design';
    
    const stages = ['design', 'production', 'controls', 'dispatch', 'installation'];
    
    // Find the last completed stage
    let currentStage = 'design';
    for (let i = 0; i < stages.length; i++) {
        const stage = project.stages[stages[i]];
        if (stage && stage.completed) {
            // If this stage is completed, move to next stage
            if (i < stages.length - 1) {
                currentStage = stages[i + 1];
            } else {
                // All stages completed
                currentStage = 'installation';
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
    
    const stageMapping = {
        'design': 'design',
        'production': 'production', 
        'controls': 'controls',
        'ready-for-dispatch': 'dispatch',
        'installation-and-commissioning': 'installation'
    };
    
    const stageName = stageMapping[project.currentProjectStage] || project.currentProjectStage;
    const stage = project.stages[stageName];
    
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
        
        const stages = ['design', 'production', 'controls', 'dispatch', 'installation'];
        return stages.some(stageName => {
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

function calculateProgress(status, currentProjectStage) {
    if (status === 'completed') return 100;
    if (status === 'yet-to-start') return 0;
    
    // For active or on-hold status, calculate based on current project stage
    if (status === 'active' || status === 'on-hold') {
        switch (currentProjectStage) {
            case 'design': return 5;
            case 'production': return 20;
            case 'controls': return 40;
            case 'ready-for-dispatch': return 60;
            case 'installation-and-commissioning': return 80;
            default: return 5;
        }
    }
    
    return 0;
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
            document.getElementById('designPerson').value = project.stages.design?.person || '';
            document.getElementById('designTime').value = project.stages.design?.dueDate || '';
            document.getElementById('productionPerson').value = project.stages.production?.person || '';
            document.getElementById('productionTime').value = project.stages.production?.dueDate || '';
            document.getElementById('controlsPerson').value = project.stages.controls?.person || '';
            document.getElementById('controlsTime').value = project.stages.controls?.dueDate || '';
            document.getElementById('dispatchPerson').value = project.stages.dispatch?.person || '';
            document.getElementById('dispatchTime').value = project.stages.dispatch?.dueDate || '';
            document.getElementById('installationPerson').value = project.stages.installation?.person || '';
            document.getElementById('installationTime').value = project.stages.installation?.dueDate || '';
        }
    }
    else {
        title.textContent = 'Add New Project';
        editingId = null;
        form.reset();
        document.getElementById('projectType').value = '';
        document.getElementById('projectBU').value = '';
        
        // Reset stage fields
        document.getElementById('designPerson').value = '';
        document.getElementById('designTime').value = '';
        document.getElementById('productionPerson').value = '';
        document.getElementById('productionTime').value = '';
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
            content.innerHTML = `
                <div class="project-timeline-header">
                    <h3>${project.name} - Timeline</h3>
                </div>
                <div class="timeline-stages">
                    ${generateStageHTML('design', 1, 'Design', project)}
                    ${generateStageHTML('production', 2, 'Production', project)}
                    ${generateStageHTML('controls', 3, 'Controls', project)}
                    ${generateStageHTML('dispatch', 4, 'Ready for Dispatch', project)}
                    ${generateStageHTML('installation', 5, 'Installation & Commissioning', project)}
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

    document.getElementById('projectForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        const status = document.getElementById('projectStatus').value;
        const progress = calculateProgress(status, 'design');

        const formData = {
            name: document.getElementById('projectName').value,
            description: document.getElementById('projectDescription').value,
            status: status,
            priority: 'design',
            assignee: document.getElementById('projectAssignee').value,
            progress: progress,
            remarks: document.getElementById('projectRemarks').value || '',
            projectType: document.getElementById('projectType').value,
            bu: document.getElementById('projectBU').value,
            currentProjectStage: 'design',
            stages: {
                design: {
                    person: document.getElementById('designPerson').value || '',
                    dueDate: document.getElementById('designTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                production: {
                    person: document.getElementById('productionPerson').value || '',
                    dueDate: document.getElementById('productionTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                controls: {
                    person: document.getElementById('controlsPerson').value || '',
                    dueDate: document.getElementById('controlsTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                dispatch: {
                    person: document.getElementById('dispatchPerson').value || '',
                    dueDate: document.getElementById('dispatchTime').value || '',
                    completed: false,
                    completedTimestamp: 'Yet to be completed'
                },
                installation: {
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
                // Ensure current project stage is set
                if (!project.currentProjectStage) {
                    project.currentProjectStage = getCurrentProjectStage(project);
                }
                // Recalculate progress based on new values
                project.progress = calculateProgress(project.status, project.currentProjectStage);
                projects[index] = project;
            }
        }
        else {
            project = {
                id: Date.now(),
                ...formData,
                createdAt: new Date().toISOString()
            };
            projects.push(project);
        }

        await upsertProject(project);
        closeModal();
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
});

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
