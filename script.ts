
interface Project {
    id: number;
    name: string;
    description: string;
    status: 'yet-to-start' | 'active' | 'completed' | 'on-hold';
    priority: 'design' | 'production' | 'controls' | 'ready-for-dispatch' | 'installation-and-commissioning';
    deadline: string;
    assignee: string;
    progress: number;
    remarks?: string;
    projectType: 'p-new' | 'p-repeat' | 's' | 'e';
    bu: 'ev' | 'lasers' | 'global' | 'ezcam' | 'leak-tester' | 'service' | 'all';
    createdAt: string;
}

interface FormData {
    name: string;
    description: string;
    status: string;
    priority: string;
    deadline: string;
    assignee: string;
    progress: number;
    remarks: string;
    projectType: string;
    bu: string;
}

declare const firebase: any;
declare const db: any;

let projects: Project[] = [];
let editingId: number | null = null;
let isAdminMode: boolean = false;

// Real-time Firestore listener for projects collection
function listenForProjects(): void {
    db.collection("projects").onSnapshot((snapshot: any) => {
        projects = snapshot.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
        renderProjects();
        updateStats();
    });
}

// Add or update a project in Firestore
async function upsertProject(project: Project): Promise<void> {
    try {
        await db.collection("projects").doc(String(project.id)).set(project);
    } catch (error) {
        console.error('Error saving project:', error);
        alert("Failed to save project: " + (error as Error).message);
    }
}

// Delete a project in Firestore
async function deleteProject(id: number): Promise<void> {
    if (confirm('Are you sure you want to delete this project?')) {
        try {
            await db.collection("projects").doc(String(id)).delete();
            // Local update will auto-happen via Firestore listener
        } catch (error) {
            console.error('Error deleting project:', error);
            alert("Failed to delete project: " + (error as Error).message);
        }
    }
}

function renderProjects(): void {
    const grid = document.getElementById('projectGrid') as HTMLElement;
    const filteredProjects = getFilteredProjects();

    // Sort projects by creation date (newest first)
    const sortedProjects = filteredProjects.sort((a: Project, b: Project) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    grid.innerHTML = '';

    sortedProjects.forEach((project: Project) => {
        const projectCard = createProjectCard(project);
        grid.appendChild(projectCard);
    });
}

function createProjectCard(project: Project): HTMLElement {
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

function getFilteredProjects(): Project[] {
    const statusFilter = (document.getElementById('filterStatus') as HTMLSelectElement).value;
    const priorityFilter = (document.getElementById('filterPriority') as HTMLSelectElement).value;
    const projectTypeFilter = (document.getElementById('filterProjectType') as HTMLSelectElement).value;
    const buFilter = (document.getElementById('filterBU') as HTMLSelectElement).value;
    const searchTerm = (document.getElementById('searchInput') as HTMLInputElement).value.toLowerCase();

    return projects.filter((project: Project) => {
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

function updateStats(): void {
    const total = projects.length;
    const active = projects.filter((p: Project) => p.status === 'active').length;
    const completed = projects.filter((p: Project) => p.status === 'completed').length;
    const overdue = projects.filter((p: Project) => 
        new Date(p.deadline) < new Date() && p.status !== 'completed'
    ).length;

    (document.getElementById('totalProjects') as HTMLElement).textContent = total.toString();
    (document.getElementById('activeProjects') as HTMLElement).textContent = active.toString();
    (document.getElementById('completedProjects') as HTMLElement).textContent = completed.toString();
    (document.getElementById('overdueProjects') as HTMLElement).textContent = overdue.toString();
}

function calculateProgress(status: string, priority: string): number {
    if (status === 'completed') return 100;
    if (status === 'yet-to-start') return 0;
    
    // For active or on-hold status, calculate based on project stage
    switch (priority) {
        case 'design': return 5;
        case 'production': return 20;
        case 'controls': return 40;
        case 'ready-for-dispatch': return 60;
        case 'installation-and-commissioning': return 80;
        default: return 0;
    }
}

function openModal(project: Project | null = null): void {
    const modal = document.getElementById('projectModal') as HTMLElement;
    const title = document.getElementById('modalTitle') as HTMLElement;
    const form = document.getElementById('projectForm') as HTMLFormElement;

    if (project) {
        title.textContent = 'Edit Project';
        editingId = project.id;

        (document.getElementById('projectName') as HTMLInputElement).value = project.name;
        (document.getElementById('projectDescription') as HTMLTextAreaElement).value = project.description;
        (document.getElementById('projectStatus') as HTMLSelectElement).value = project.status;
        (document.getElementById('projectPriority') as HTMLSelectElement).value = project.priority;
        (document.getElementById('projectDeadline') as HTMLInputElement).value = project.deadline;
        (document.getElementById('projectAssignee') as HTMLInputElement).value = project.assignee;
        (document.getElementById('projectRemarks') as HTMLTextAreaElement).value = project.remarks || '';
        (document.getElementById('projectType') as HTMLSelectElement).value = project.projectType || '';
        (document.getElementById('projectBU') as HTMLSelectElement).value = project.bu || '';
    } else {
        title.textContent = 'Add New Project';
        editingId = null;
        form.reset();
        // Reset select fields to show placeholder options
        (document.getElementById('projectType') as HTMLSelectElement).value = '';
        (document.getElementById('projectBU') as HTMLSelectElement).value = '';
    }

    modal.style.display = 'flex';
}

function closeModal(): void {
    (document.getElementById('projectModal') as HTMLElement).style.display = 'none';
    editingId = null;
}

function editProject(id: number): void {
    const project = projects.find((p: Project) => p.id == id);
    if (project) {
        openModal(project);
    }
}

function filterProjects(): void {
    renderProjects();
}

function exportData(): void {
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
        ...projects.map((project: Project) => [
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

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showAdminLogin(): void {
    (document.getElementById('adminModal') as HTMLElement).style.display = 'flex';
    (document.getElementById('adminPassword') as HTMLInputElement).value = '';
}

function closeAdminModal(): void {
    (document.getElementById('adminModal') as HTMLElement).style.display = 'none';
}

function logoutAdmin(): void {
    isAdminMode = false;
    (document.getElementById('adminOnlyControls') as HTMLElement).style.display = 'none';
    const adminBtn = document.getElementById('adminLoginBtn') as HTMLButtonElement;
    adminBtn.textContent = 'Admin Login';
    adminBtn.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
    adminBtn.onclick = showAdminLogin;
    renderProjects(); // Re-render to hide action buttons
}

// Optional: load sample data if Firestore is empty (for demo only)
function loadSampleData(): void {
    if (projects.length === 0) {
        const sampleProjects: Project[] = [
            {
                id: Date.now() + 1,
                name: "E-commerce Platform Redesign",
                description: "Complete overhaul of the existing e-commerce platform with modern UI/UX",
                status: "active",
                priority: "production",
                deadline: "2025-07-15",
                assignee: "Sarah Johnson",
                progress: 20,
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
                progress: 0,
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
                progress: 40,
                remarks: "Waiting for infrastructure approval",
                projectType: "e",
                bu: "service",
                createdAt: new Date().toISOString()
            }
        ];
        sampleProjects.forEach(async (p: Project) => {
            await upsertProject(p);
        });
    }
}

// Form submission handler and modal logic
document.addEventListener('DOMContentLoaded', function(): void {
    // Listen for project changes from Firestore
    listenForProjects();

    (document.getElementById('projectForm') as HTMLFormElement).addEventListener('submit', async function(e: Event): Promise<void> {
        e.preventDefault();

        const status = (document.getElementById('projectStatus') as HTMLSelectElement).value;
        const priority = (document.getElementById('projectPriority') as HTMLSelectElement).value;
        const progress = calculateProgress(status, priority);

        const formData: FormData = {
            name: (document.getElementById('projectName') as HTMLInputElement).value,
            description: (document.getElementById('projectDescription') as HTMLTextAreaElement).value,
            status: status,
            priority: priority,
            deadline: (document.getElementById('projectDeadline') as HTMLInputElement).value,
            assignee: (document.getElementById('projectAssignee') as HTMLInputElement).value,
            progress: progress,
            remarks: (document.getElementById('projectRemarks') as HTMLTextAreaElement).value || '',
            projectType: (document.getElementById('projectType') as HTMLSelectElement).value,
            bu: (document.getElementById('projectBU') as HTMLSelectElement).value
        };

        let project: Project;
        if (editingId) {
            // Update existing project in array
            const index = projects.findIndex((p: Project) => p.id == editingId);
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
            } as Project;
            projects.push(project);
        }

        await upsertProject(project!);
        closeModal();
    });

    // Close modal when clicking outside
    (document.getElementById('projectModal') as HTMLElement).addEventListener('click', function(e: Event): void {
        if (e.target === this) {
            closeModal();
        }
    });

    // Admin form submission
    (document.getElementById('adminForm') as HTMLFormElement).addEventListener('submit', function(e: Event): void {
        e.preventDefault();
        const password = (document.getElementById('adminPassword') as HTMLInputElement).value;

        if (password === 'mikro-admin') {
            isAdminMode = true;
            (document.getElementById('adminOnlyControls') as HTMLElement).style.display = 'inline-block';
            const adminBtn = document.getElementById('adminLoginBtn') as HTMLButtonElement;
            adminBtn.textContent = 'Admin Mode';
            adminBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            adminBtn.onclick = logoutAdmin;
            closeAdminModal();
            renderProjects(); // Re-render to show action buttons
        } else {
            alert('Incorrect password');
        }
    });

    // Close admin modal when clicking outside
    (document.getElementById('adminModal') as HTMLElement).addEventListener('click', function(e: Event): void {
        if (e.target === this) {
            closeAdminModal();
        }
    });
});

// Make functions available globally for onclick handlers
(window as any).openModal = openModal;
(window as any).closeModal = closeModal;
(window as any).editProject = editProject;
(window as any).deleteProject = deleteProject;
(window as any).filterProjects = filterProjects;
(window as any).exportData = exportData;
(window as any).showAdminLogin = showAdminLogin;
(window as any).closeAdminModal = closeAdminModal;
(window as any).logoutAdmin = logoutAdmin;
