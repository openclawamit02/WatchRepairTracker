import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCWUkUfOsrvkO1TkohrLp2YyAggvjNDD_U",
    authDomain: "chronos-repair-tracker.firebaseapp.com",
    projectId: "chronos-repair-tracker",
    storageBucket: "chronos-repair-tracker.firebasestorage.app",
    messagingSenderId: "460608490423",
    appId: "1:460608490423:web:39b5c5aa35a84deb3e3632"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

class RepairTracker {
    constructor() {
        this.repairs = [];
        this.filteredRepairs = [];
        this.currentPage = 1;
        this.pageSize = 10;
        this.currentUser = null;
        this.userRole = 'staff'; // default
        this.editingId = null; // Track record being edited
        this.statusOptions = {
            'received': 'Received',
            'diagnosing': 'Diagnosing',
            'parts': 'Waiting for Parts',
            'fixing': 'Fixing',
            'ready': 'Ready for Pickup',
            'delivered': 'Delivered'
        };

        this.initDOM();
        this.bindEvents();
        this.setupAuthListener();
    }

    initDOM() {
        this.stats = {
            total: document.getElementById('stat-total'),
            progress: document.getElementById('stat-progress'),
            ready: document.getElementById('stat-ready')
        };
        this.tableBody = document.getElementById('repairs-list');
        this.emptyState = document.getElementById('empty-state');
        this.table = document.getElementById('repairs-table');

        // Modal
        this.modal = document.getElementById('modal-overlay');
        this.modalTitle = this.modal.querySelector('h2');
        this.form = document.getElementById('form-repair');
        this.btnAdd = document.getElementById('btn-add-repair');
        this.btnExport = document.getElementById('btn-export');
        this.btnClose = document.getElementById('btn-close-modal');
        this.btnCancel = document.getElementById('btn-cancel');

        // Auth elements
        this.loginContainer = document.getElementById('login-container');
        this.appContainer = document.getElementById('app-container');
        this.loginForm = document.getElementById('form-login');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.btnLogout = document.getElementById('btn-logout');
        this.btnForgot = document.getElementById('btn-forgot-password');
        this.authError = document.getElementById('auth-error');
        this.userRoleDisplay = document.getElementById('user-role');
        
        // Theme Toggle
        this.themeToggleBtn = document.getElementById('btn-theme-toggle');
        this.currentTheme = localStorage.getItem('theme') || 'dark';
        this.initTheme();

        // Photo Upload elements
        this.photoInputBefore = document.getElementById('watchPhotoBefore');
        this.photoInputAfter = document.getElementById('watchPhotoAfter');
        this.previewBefore = document.getElementById('preview-before');
        this.previewAfter = document.getElementById('preview-after');
        this.previewBeforeContainer = document.getElementById('preview-before-container');
        this.previewAfterContainer = document.getElementById('preview-after-container');
        
        this.photoBeforeUrl = null;
        this.photoAfterUrl = null;
        this.existingPhotoUrl = '';

        // Filter elements
        this.searchInput = document.getElementById('search-input');
        this.dateStartInput = document.getElementById('date-start');
        this.dateEndInput = document.getElementById('date-end');
        this.btnClearFilters = document.getElementById('btn-clear-filters');

        // Pagination elements
        this.btnPrev = document.getElementById('btn-prev');
        this.btnNext = document.getElementById('btn-next');
        this.pageInfo = document.getElementById('page-info');
    }

    bindEvents() {
        this.btnAdd.addEventListener('click', () => this.openModal());
        this.btnExport.addEventListener('click', () => this.exportToExcel());
        this.btnClose.addEventListener('click', () => this.closeModal());
        this.btnCancel.addEventListener('click', () => this.closeModal());

        // Close modal on outside click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
        });

        this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));

        // Auth Events
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.btnLogout.addEventListener('click', () => this.handleLogout());
        this.btnForgot.addEventListener('click', () => this.handleForgotPassword());

        // Photo Upload Events
        this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        this.photoInputBefore.addEventListener('change', (e) => this.handlePhotoUpload(e, 'before'));
        this.photoInputAfter.addEventListener('change', (e) => this.handlePhotoUpload(e, 'after'));
        
        // Delegate photo removal
        document.querySelectorAll('.btn-remove-photo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                this.removePhoto(target);
            });
        });

        // Filter Events
        this.searchInput.addEventListener('input', () => this.applyFilters());
        this.dateStartInput.addEventListener('change', () => this.applyFilters());
        this.dateEndInput.addEventListener('change', () => this.applyFilters());
        this.btnClearFilters.addEventListener('click', () => this.clearFilters());

        // Pagination Events
        this.btnPrev.addEventListener('click', () => this.changePage(-1));
        this.btnNext.addEventListener('click', () => this.changePage(1));
    }

    // Real-time listener for Firestore
    setupRealtimeListener() {
        if (!this.currentUser) return;
        
        const q = query(collection(db, "repairs"), orderBy("dateAdded", "desc"));

        onSnapshot(q, (snapshot) => {
            this.repairs = [];
            snapshot.forEach((docSnap) => {
                this.repairs.push({ firebaseId: docSnap.id, ...docSnap.data() });
            });
            this.render();
        });
    }

    // Auth Listener
    setupAuthListener() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.currentUser = user;
                // Simple role logic: email containing 'admin' is Admin, else Staff
                this.userRole = user.email.toLowerCase().includes('admin') ? 'admin' : 'staff';
                this.showApp();
                this.setupRealtimeListener();
            } else {
                this.currentUser = null;
                this.userRole = 'staff';
                this.showLogin();
            }
        });
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const submitBtn = this.loginForm.querySelector('button[type="submit"]');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';
        this.authError.classList.add('hidden');

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            console.error("Login error:", error);
            this.authError.textContent = "Invalid email or password.";
            this.authError.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Login';
        }
    }

    async handleLogout() {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout error:", error);
        }
    }

    async handleForgotPassword() {
        if (this.userRole === 'staff') {
            alert("Staff members cannot reset passwords themselves. Please contact the shop owner (Admin) to reset your password.");
            return;
        }

        const email = prompt("Enter your admin email to receive a password reset link:");
        if (!email) return;

        try {
            await sendPasswordResetEmail(auth, email);
            alert("Password reset email sent! Please check your inbox.");
        } catch (error) {
            console.error("Reset error:", error);
            alert("Error: " + error.message);
        }
    }

    showApp() {
        this.loginContainer.classList.add('hidden');
        this.appContainer.classList.remove('hidden');
        this.userRoleDisplay.textContent = this.userRole.charAt(0).toUpperCase() + this.userRole.slice(1);
        
        // Export is now available for everyone as per request
        this.btnExport.classList.remove('hidden');
        
        this.render();
    }

    initTheme() {
        if (this.currentTheme === 'light') {
            document.body.classList.add('light-theme');
            this.themeToggleBtn.querySelector('i').className = 'fa-solid fa-sun';
        } else {
            document.body.classList.remove('light-theme');
            this.themeToggleBtn.querySelector('i').className = 'fa-solid fa-moon';
        }
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', this.currentTheme);
        this.initTheme();
    }

    showLogin() {
        this.appContainer.classList.add('hidden');
        this.loginContainer.classList.remove('hidden');
        this.loginForm.reset();
        this.authError.classList.add('hidden');
    }

    openModal() {
        this.editingId = null;
        this.modalTitle.textContent = "New Repair Log";
        
        // Set default dates
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('repairDate').value = today;
        
        // Default due date: today + 3 days
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 3);
        document.getElementById('dueDate').value = dueDate.toISOString().split('T')[0];
        
        this.closeModal(); // Reset form and photo previews
        this.modal.classList.remove('hidden');
        document.getElementById('repairId').focus();
    }

    openEditModal(firebaseId) {
        const repair = this.repairs.find(r => r.firebaseId === firebaseId);
        if (!repair) return;

        this.editingId = firebaseId;
        this.modalTitle.textContent = "Edit Repair Log";
        
        // Populate fields
        document.getElementById('repairDate').value = repair.dateAdded ? new Date(repair.dateAdded).toISOString().split('T')[0] : '';
        document.getElementById('dueDate').value = repair.dueDate ? new Date(repair.dueDate).toISOString().split('T')[0] : '';
        document.getElementById('repairId').value = repair.id || '';
        document.getElementById('priority').value = repair.priority || 'medium';
        document.getElementById('receivedBy').value = repair.receivedBy || '';
        document.getElementById('customerName').value = repair.customerName || '';
        
        // Remove +91 prefix for editing if present
        let phone = repair.customerPhone || '';
        if (phone.startsWith('+91')) {
            phone = phone.replace('+91', '');
        }
        document.getElementById('customerPhone').value = phone.trim();
        
        document.getElementById('watchModel').value = repair.watchModel || '';
        document.getElementById('issueDesc').value = repair.issueDesc || '';
        document.getElementById('estCost').value = repair.estCost || 0;
        document.getElementById('advancePaid').value = repair.advancePaid || 0;

        // Photos
        this.photoBeforeUrl = repair.photoBeforeUrl || null;
        this.photoAfterUrl = repair.photoAfterUrl || null;

        if (this.photoBeforeUrl) {
            this.previewBefore.src = this.photoBeforeUrl;
            this.previewBeforeContainer.classList.remove('hidden');
        } else {
            this.previewBeforeContainer.classList.add('hidden');
        }

        if (this.photoAfterUrl) {
            this.previewAfter.src = this.photoAfterUrl;
            this.previewAfterContainer.classList.remove('hidden');
        } else {
            this.previewAfterContainer.classList.add('hidden');
        }
        
        this.modal.classList.remove('hidden');
    }

    closeModal() {
        this.modal.classList.add('hidden');
        this.form.reset();
        this.editingId = null;
        this.photoBeforeUrl = null;
        this.photoAfterUrl = null;
        this.photoInputBefore.value = '';
        this.photoInputAfter.value = '';
        this.previewBeforeContainer.classList.add('hidden');
        this.previewAfterContainer.classList.add('hidden');
    }

    async handlePhotoUpload(e, type) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const base64 = await this.compressImage(file);
            if (type === 'before') {
                this.photoBeforeUrl = base64;
                this.previewBefore.src = base64;
                this.previewBeforeContainer.classList.remove('hidden');
            } else {
                this.photoAfterUrl = base64;
                this.previewAfter.src = base64;
                this.previewAfterContainer.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error uploading photo:', error);
            alert('Failed to process image');
        }
    }

    removePhoto(targetId) {
        if (targetId === 'watchPhotoBefore') {
            this.photoBeforeUrl = null;
            this.photoInputBefore.value = '';
            this.previewBeforeContainer.classList.add('hidden');
        } else {
            this.photoAfterUrl = null;
            this.photoInputAfter.value = '';
            this.previewAfterContainer.classList.add('hidden');
        }
    }

    applyFilters() {
        const searchTerm = this.searchInput.value.toLowerCase().trim();
        const startDate = this.dateStartInput.value;
        const endDate = this.dateEndInput.value;

        this.filteredRepairs = this.repairs.filter(repair => {
            // Search filter (Receipt #, Name, Mobile Number)
            // Normalize mobile number for searching (remove spaces, etc. and ignore +91)
            const normalizedSearch = searchTerm.replace(/\D/g, '');
            const normalizedPhone = repair.customerPhone.replace(/\D/g, '');
            
            const matchesSearch = !searchTerm || 
                repair.customerName.toLowerCase().includes(searchTerm) || 
                repair.id.toLowerCase().includes(searchTerm) ||
                (normalizedSearch && normalizedPhone.includes(normalizedSearch));

            // Date filter
            let matchesDate = true;
            if (startDate || endDate) {
                const repairDate = new Date(repair.dateAdded).toISOString().split('T')[0];
                if (startDate && repairDate < startDate) matchesDate = false;
                if (endDate && repairDate > endDate) matchesDate = false;
            }

            return matchesSearch && matchesDate;
        });

        // Reset to page 1 when filters change
        this.currentPage = 1;
        this.renderTable();
        this.renderStats();
    }

    clearFilters() {
        this.searchInput.value = '';
        this.dateStartInput.value = '';
        this.dateEndInput.value = '';
        this.applyFilters();
    }

    changePage(offset) {
        const totalPages = Math.ceil(this.filteredRepairs.length / this.pageSize);
        const newPage = this.currentPage + offset;
        
        if (newPage >= 1 && newPage <= totalPages) {
            this.currentPage = newPage;
            this.renderTable();
        }
    }

    async compressImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 600;
                    const MAX_HEIGHT = 600;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Compress to JPEG with 0.6 quality (more aggressive)
                    resolve(canvas.toDataURL('image/jpeg', 0.6));
                };
            };
        });
    }

    generateId() {
        // ID is now provided manually by the shop owner - keeping as fallback only
        return 'REP-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        // Change button state to indicate loading
        const submitBtn = this.form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = this.editingId ? 'Updating...' : 'Saving...';
        submitBtn.disabled = true;

        const repairDateValue = document.getElementById('repairDate').value;
        const dueDateValue = document.getElementById('dueDate').value;
        const phoneValue = document.getElementById('customerPhone').value.trim();
        
        const repairData = {
            id: document.getElementById('repairId').value.trim(),
            priority: document.getElementById('priority').value,
            receivedBy: document.getElementById('receivedBy').value.trim(),
            customerName: document.getElementById('customerName').value,
            customerPhone: phoneValue.includes('+') ? phoneValue : '+91' + phoneValue,
            watchModel: document.getElementById('watchModel').value,
            issueDesc: document.getElementById('issueDesc').value,
            estCost: parseFloat(document.getElementById('estCost').value),
            advancePaid: parseFloat(document.getElementById('advancePaid').value || 0),
            dateAdded: repairDateValue ? new Date(repairDateValue).toISOString() : new Date().toISOString(),
            dueDate: dueDateValue ? new Date(dueDateValue).toISOString() : null,
            photoBeforeUrl: this.photoBeforeUrl,
            photoAfterUrl: this.photoAfterUrl,
            status: this.editingId ? (this.repairs.find(r => r.firebaseId === this.editingId).status) : 'received'
        };

        try {
            submitBtn.textContent = 'Saving Data...';
            
            if (this.editingId) {
                const repairRef = doc(db, "repairs", this.editingId);
                await updateDoc(repairRef, repairData);
            } else {
                await addDoc(collection(db, "repairs"), repairData);
            }

            this.closeModal();
        } catch (error) {
            console.error("Error saving document: ", error);
            alert("Error saving repair: " + error.message);
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    async updateStatus(firebaseId, newStatus) {
        try {
            const repairRef = doc(db, "repairs", firebaseId);
            await updateDoc(repairRef, { status: newStatus });
        } catch (error) {
            console.error("Error updating document: ", error);
            alert("Error updating status in database.");
        }
    }

    async deleteRepair(firebaseId) {
        if (confirm('Are you sure you want to delete this log?')) {
            try {
                await deleteDoc(doc(db, "repairs", firebaseId));
            } catch (error) {
                console.error("Error deleting document: ", error);
                alert("Error deleting repair from database.");
            }
        }
    }

    sendWhatsAppMessage(firebaseId) {
        const repair = this.repairs.find(r => r.firebaseId === firebaseId);
        if (!repair) return;

        // Clean the phone number (remove spaces, dashes, parentheses but keep + for country code)
        let phone = repair.customerPhone.replace(/[^\d+]/g, '');

        // Construct the message
        let statusString = this.statusOptions[repair.status].toLowerCase();
        let message = `Hello ${repair.customerName}, this is Dhiraj Watch Vision. Just an update that your ${repair.watchModel} (Repair ID: ${repair.id}) is currently ${statusString}.`;

        if (repair.status === 'ready') {
            message += ` Your total comes to \u20b9${repair.estCost.toFixed(2)}. You can come pick it up anytime!`;
        }

        // Encode message for URL and open WhatsApp
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
    }

    exportToExcel() {
        if (this.repairs.length === 0) {
            alert("No repairs to export.");
            return;
        }

        // CSV Header
        let csvContent = "ID,Date Added,Customer Name,Phone,Watch Details,Issue,Est. Cost (INR),Status\n";

        // CSV Rows - Always export everything as requested
        this.repairs.forEach(r => {
            const dateStr = new Date(r.dateAdded).toLocaleDateString();
            const customerNameCSV = `"${r.customerName.replace(/"/g, '""')}"`;
            const watchModelCSV = `"${r.watchModel.replace(/"/g, '""')}"`;
            const issueStr = `"${r.issueDesc.replace(/"/g, '""')}"`;
            const statusLabel = this.statusOptions[r.status];
            const row = `${r.id},${dateStr},${customerNameCSV},${r.customerPhone},${watchModelCSV},${issueStr},${r.estCost},${statusLabel}`;
            csvContent += row + "\n";
        });

        // Trigger Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Chronos_Repairs_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    renderStats() {
        const total = this.repairs.length;
        const progress = this.repairs.filter(r => ['received', 'diagnosing', 'parts', 'fixing'].includes(r.status)).length;
        const ready = this.repairs.filter(r => r.status === 'ready').length;

        this.stats.total.textContent = total;
        this.stats.progress.textContent = progress;
        this.stats.ready.textContent = ready;
    }

    renderTable() {
        const totalFiltered = this.filteredRepairs.length;
        const totalPages = Math.ceil(totalFiltered / this.pageSize) || 1;

        if (totalFiltered === 0) {
            this.table.classList.add('hidden');
            this.emptyState.classList.remove('hidden');
            this.pageInfo.textContent = `Page 1 of 1`;
            return;
        }

        this.table.classList.remove('hidden');
        this.emptyState.classList.add('hidden');
        this.tableBody.innerHTML = '';

        // Pagination slice
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const pageData = this.filteredRepairs.slice(startIndex, startIndex + this.pageSize);

        pageData.forEach(repair => {
            const tr = document.createElement('tr');

            // Generate Status Dropdown
            let statusSelectHtml = `<select class="status-select" data-id="${repair.firebaseId}">`;
            for (const [key, label] of Object.entries(this.statusOptions)) {
                const selected = repair.status === key ? 'selected' : '';
                statusSelectHtml += `<option value="${key}" ${selected}>${label}</option>`;
            }
            statusSelectHtml += `</select>`;

            const dateStr = new Date(repair.dateAdded).toLocaleDateString();
            const photoBeforeHtml = repair.photoBeforeUrl 
                ? `<div class="table-photo" onclick="window.open('${repair.photoBeforeUrl}', '_blank')"><img src="${repair.photoBeforeUrl}" alt="Before"></div>`
                : `<div class="table-photo empty" title="No Before Photo"><i class="fa-solid fa-camera"></i></div>`;
            
            const photoAfterHtml = repair.photoAfterUrl 
                ? `<div class="table-photo" onclick="window.open('${repair.photoAfterUrl}', '_blank')"><img src="${repair.photoAfterUrl}" alt="After"></div>`
                : `<div class="table-photo empty" title="No After Photo"><i class="fa-solid fa-camera-rotate"></i></div>`;

            const priorityClass = `priority-${repair.priority || 'medium'}`;
            const priorityLabel = (repair.priority || 'medium').toUpperCase();

            const total = repair.estCost || 0;
            const advance = repair.advancePaid || 0;
            const balance = total - advance;

            tr.innerHTML = `
                <td><strong>${repair.id}</strong></td>
                <td>
                    <span style="font-size: 0.85rem; color: var(--text-secondary)">${dateStr}</span><br>
                    <span style="font-size: 0.7rem; color: var(--text-secondary)">By: ${repair.receivedBy || 'N/A'}</span>
                </td>
                <td>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <div style="display: flex; gap: 4px;">
                            ${photoBeforeHtml}
                            ${photoAfterHtml}
                        </div>
                        <div style="margin-left: 4px;">
                            <span class="customer-name">${repair.customerName}</span><br>
                            <span style="font-size: 0.85rem; color: var(--text-primary); font-weight: 500;">${repair.watchModel}</span><br>
                            <span style="font-size: 0.75rem; color: var(--text-secondary); display: block; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${repair.issueDesc}">${repair.issueDesc}</span>
                        </div>
                    </div>
                </td>
                <td><span class="priority-badge ${priorityClass}">${priorityLabel}</span></td>
                <td>
                    ${statusSelectHtml}
                </td>
                <td>
                    <div class="finance-info">
                        Total: ₹${total.toLocaleString()}<br>
                        Adv: ₹${advance.toLocaleString()}<br>
                        <span class="${balance <= 0 ? 'paid-full' : 'balance-due'}">
                            ${balance <= 0 ? 'PAID' : 'Bal: ₹' + balance.toLocaleString()}
                        </span>
                    </div>
                </td>
                <td>
                    <div class="table-actions" style="display: flex; gap: 4px;">
                        <button class="btn-icon edit-btn" data-id="${repair.firebaseId}" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="btn-icon whatsapp-btn" data-id="${repair.firebaseId}" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
                        ${this.userRole === 'admin' ? `
                        <button class="btn-icon delete-btn" data-id="${repair.firebaseId}" title="Delete"><i class="fa-solid fa-trash"></i></button>
                        ` : ''}
                    </div>
                </td>
            `;
            this.tableBody.appendChild(tr);
        });

        // Update Pagination Info
        this.pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;
        this.btnPrev.disabled = this.currentPage === 1;
        this.btnNext.disabled = this.currentPage === totalPages;

        // Attach event listeners (inline onclick doesn't work inside ES modules)
        document.querySelectorAll('.status-select').forEach(select => {
            select.addEventListener('change', (e) => {
                this.updateStatus(e.target.dataset.id, e.target.value);
            });
        });

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.openEditModal(e.target.dataset.id);
            });
        });

        document.querySelectorAll('.whatsapp-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.sendWhatsAppMessage(e.target.dataset.id);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.deleteRepair(e.target.dataset.id);
            });
        });

        document.querySelectorAll('.table-photo img').forEach(img => {
            img.addEventListener('click', (e) => {
                const url = e.target.closest('.table-photo').dataset.url;
                if (url) window.open(url, '_blank');
            });
        });
    }

    render() {
        this.applyFilters(); // This calls renderTable and renderStats
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    window.appTracker = new RepairTracker();
});
