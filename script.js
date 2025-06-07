let projects = [];
let editingId = null;
let isAdminMode = false;

// Real-time Firestore listener for projects collection
function listenForProjects() {
    db.collection("projects").onSnapshot(snapshot => {
        projects = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        renderProjects();
        updateStats();
    });
}

// Add or update a project in Firestore
async function upsertProject(project) {
    try {
        await db.collection("projects").doc(String(project.id)).set(project);
    } catch (error) {
        console.error('Error saving project:', error);
        alert("Failed to save project: " + error.message);
    }
}

// Delete a project in Firestore
async function deleteProject(id) {
    if (confirm('Are you sure you want to delete this project?')) {
        try {
            await db.collection("projects").doc(String(id)).delete();
            // Local update will auto-happen via Firestore listener
        } catch (error) {
            console.error('Error deleting project:', error);
            alert("Failed to delete project: " + error.message);
        }
    }
}

function renderProjects() {
    
    const grid = document.getElementById('projectGrid');
    const filteredProjects = getFilteredProjects();

    // Sort projects by creation date (newest first)
    const sortedProjects = filteredProjects.sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    grid.innerHTML = '';

    sortedProjects.forEach(project => {
        const projectCard = createProjectCard(project);
        grid.appendChild(projectCard);
    });
}

function createProjectCard(project) {
    const card = document.createElement('div');
    card.className = `project-card priority-${project.priority} fade-in`;

    const isOverdue = new Date(project.deadline) < new Date() && project.status !== 'completed';
    const actualStatus = isOverdue ? 'overdue' : project.status;

    card.innerHTML = `
        <div class="project-header">
            <div>
                <div class="project-title">${project.name}</div>
                <div class="status-badge status-${actualStatus}">${actualStatus}</div>
            </div>
        </div>
        <div class="project-description">${project.description}</div>
        <div class="project-meta">
            <div class="meta-item">
                <span class="meta-icon">📅</span>
                <span>${formatDate(project.deadline)}</span>
            </div>
            <div class="meta-item">
                <span class="meta-icon">👤</span>
                <span>${project.assignee}</span>
            </div>
            <div class="meta-item">
                <span class="meta-icon">⚡</span>
                <span>${project.priority.replace(/-/g, ' ').toUpperCase()}</span>
            </div>
            <div class="meta-item">
                <span class="meta-icon">🏢</span>
                <span>${project.bu ? project.bu.toUpperCase() : 'N/A'}</span>
            </div>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${project.progress}%"></div>
        </div>
        ${project.remarks ? `<div class="project-remarks"><strong>Remarks:</strong> ${project.remarks}</div>` : ''}
        ${isAdminMode ? `<div class="project-actions">
            <button class="btn btn-small btn-secondary" onclick="editProject(${project.id})">Edit</button>
            <button class="btn btn-small btn-danger" onclick="deleteProject(${project.id})">Delete</button>
        </div>` : ''}
    `;

    return card;
}

function getFilteredProjects() {
    const statusFilter = document.getElementById('filterStatus').value;
    const priorityFilter = document.getElementById('filterPriority').value;
    const projectTypeFilter = document.getElementById('filterProjectType').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    return projects.filter(project => {
        const matchesStatus = !statusFilter || project.status === statusFilter;
        const matchesPriority = !priorityFilter || project.priority === priorityFilter;
        const matchesProjectType = !projectTypeFilter || project.projectType === projectTypeFilter;
        const matchesSearch = !searchTerm ||
            project.name.toLowerCase().includes(searchTerm) ||
            project.description.toLowerCase().includes(searchTerm) ||
            project.assignee.toLowerCase().includes(searchTerm);

        return matchesStatus && matchesPriority && matchesProjectType && matchesSearch;
    });
}

function updateStats() {
    const total = projects.length;
    const active = projects.filter(p => p.status === 'active').length;
    const completed = projects.filter(p => p.status === 'completed').length;
    const overdue = projects.filter(p => 
        new Date(p.deadline) < new Date() && p.status !== 'completed'
    ).length;

    document.getElementById('totalProjects').textContent = total;
    document.getElementById('activeProjects').textContent = active;
    document.getElementById('completedProjects').textContent = completed;
    document.getElementById('overdueProjects').textContent = overdue;
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
        document.getElementById('projectPriority').value = project.priority;
        document.getElementById('projectDeadline').value = project.deadline;
        document.getElementById('projectAssignee').value = project.assignee;
        document.getElementById('projectProgress').value = project.progress;
        document.getElementById('projectRemarks').value = project.remarks || '';
        document.getElementById('projectType').value = project.projectType || 'p-new';
        document.getElementById('projectBU').value = project.bu || 'ev';
    } else {
        title.textContent = 'Add New Project';
        editingId = null;
        form.reset();
    }

    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('projectModal').style.display = 'none';
    editingId = null;
}

function editProject(id) {
    const project = projects.find(p => p.id == id);
    if (project) {
        openModal(project);
    }
}

function filterProjects() {
    renderProjects();
}

function exportData() {
    // Convert JSON to CSV
    if (projects.length === 0) {
        alert('No projects to export');
        return;
    }

    // Define CSV headers - include all data fields
    const headers = ['ID', 'Name', 'Description', 'Status', 'Project Stage', 'Deadline', 'Project Manager', 'Progress (%)', 'Remarks', 'Project Type', 'BU', 'Created At'];

    // Convert projects to CSV rows
    const csvRows = [
        headers.join(','), // Header row
        ...projects.map(project => [
            project.id,
            `"${project.name.replace(/"/g, '""')}"`, // Escape quotes in name
            `"${project.description.replace(/"/g, '""')}"`, // Escape quotes in description
            project.status,
            project.priority,
            project.deadline,
            `"${project.assignee.replace(/"/g, '""')}"`, // Escape quotes in assignee
            project.progress,
            `"${(project.remarks || '').replace(/"/g, '""')}"`, // Escape quotes in remarks
            project.projectType || '',
            project.bu || '',
            project.createdAt
        ].join(','))
    ];

    const csvContent = csvRows.join('\n');
    const dataBlob = new Blob([csvContent], {type: 'text/csv'});
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

// Form submission handler and modal logic
document.addEventListener('DOMContentLoaded', function() {
    // Listen for project changes from Firestore
    listenForProjects();

    document.getElementById('projectForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const formData = {
            name: document.getElementById('projectName').value,
            description: document.getElementById('projectDescription').value,
            status: document.getElementById('projectStatus').value,
            priority: document.getElementById('projectPriority').value,
            deadline: document.getElementById('projectDeadline').value,
            assignee: document.getElementById('projectAssignee').value,
            progress: parseInt(document.getElementById('projectProgress').value),
            remarks: document.getElementById('projectRemarks').value || '',
            projectType: document.getElementById('projectType').value,
            bu: document.getElementById('projectBU').value
        };

        let project;
        if (editingId) {
            // Update existing project in array
            const index = projects.findIndex(p => p.id == editingId);
            if (index !== -1) {
                project = { ...projects[index], ...formData };
                projects[index] = project;
            }
        } else {
            // Add new project
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

    // Close modal when clicking outside
    document.getElementById('projectModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });

    // Admin form submission
    document.getElementById('adminForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const password = document.getElementById('adminPassword').value;

        if (password === 'mikro-admin') {
            isAdminMode = true;
            document.getElementById('adminOnlyControls').style.display = 'inline-block';
            document.getElementById('adminLoginBtn').textContent = 'Admin Mode';
            document.getElementById('adminLoginBtn').style.background = 'linear-gradient(135deg, #10b981, #059669)';
            document.getElementById('adminLoginBtn').onclick = logoutAdmin;
            closeAdminModal();
            renderProjects(); // Re-render to show action buttons
        } else {
            alert('Incorrect password');
        }
    });

    // Close admin modal when clicking outside
    document.getElementById('adminModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeAdminModal();
        }
    });
});

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
    document.getElementById('adminLoginBtn').textContent = 'Admin Login';
    document.getElementById('adminLoginBtn').style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
    document.getElementById('adminLoginBtn').onclick = showAdminLogin;
    renderProjects(); // Re-render to hide action buttons
}

// Optional: load sample data if Firestore is empty (for demo only)
function loadSampleData() {
    if (projects.length === 0) {
        const sampleProjects = [
            {
                id: Date.now() + 1,
                name: "E-commerce Platform Redesign",
                description: "Complete overhaul of the existing e-commerce platform with modern UI/UX",
                status: "active",
                priority: "production",
                deadline: "2025-07-15",
                assignee: "Sarah Johnson",
                progress: 65,
                remarks: "UI mockups completed, backend integration in progress",
                projectType: "p-new",
                bu: "global",
                createdAt: new Date().toISOString()
            },
            {
                id: Date.now() + 2,
                name: "Mobile App Development",
                description: "Native mobile app for iOS and Android platforms",
                status: "yet-to-start",
                priority: "design",
                deadline: "2025-08-30",
                assignee: "Mike Chen",
                progress: 15,
                remarks: "Waiting for design approval",
                projectType: "p-repeat",
                bu: "ev",
                createdAt: new Date().toISOString()
            },
            {
                id: Date.now() + 3,
                name: "API Documentation",
                description: "Comprehensive API documentation for all endpoints",
                status: "completed",
                priority: "installation-and-commissioning",
                deadline: "2025-05-20",
                assignee: "Alex Rodriguez",
                progress: 100,
                remarks: "Documentation deployed successfully",
                projectType: "s",
                bu: "lasers",
                createdAt: new Date().toISOString()
            },
            {
                id: Date.now() + 4,
                name: "Database Migration",
                description: "Migrate legacy database to new cloud infrastructure",
                status: "on-hold",
                priority: "controls",
                deadline: "2025-05-01",
                assignee: "Lisa Wang",
                progress: 80,
                remarks: "Waiting for infrastructure approval",
                projectType: "e",
                bu: "service",
                createdAt: new Date().toISOString()
            }
        ];
        sampleProjects.forEach(async (p) => {
            await upsertProject(p);
        });
    }
}