import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-storage.js";
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
const storage = getStorage(firebaseApp);
const auth = getAuth(firebaseApp);

class RepairTracker {
    constructor() {
        this.repairs = [];
        this.currentUser = null;
        this.userRole = 'staff'; // default
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
        this.form = document.getElementById('form-repair');
        this.btnAdd = document.getElementById('btn-add-repair');
        this.btnExport = document.getElementById('btn-export');
        this.btnClose = document.getElementById('btn-close-modal');
        this.btnCancel = document.getElementById('btn-cancel');

        // Auth elements
        this.loginContainer = document.getElementById('login-container');
        this.appContainer = document.getElementById('app-container');
        this.loginForm = document.getElementById('form-login');
        this.btnLogout = document.getElementById('btn-logout');
        this.btnForgot = document.getElementById('btn-forgot-password');
        this.authError = document.getElementById('auth-error');
        this.userRoleDisplay = document.getElementById('user-role');

        // Photo Upload elements
        this.fileInput = document.getElementById('watchPhoto');
        this.photoPreviewContainer = document.getElementById('photo-preview-container');
        this.photoPreviewImg = document.getElementById('photo-preview');
        this.btnRemovePhoto = document.getElementById('btn-remove-photo');
        this.selectedFile = null;
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
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.btnRemovePhoto.addEventListener('click', () => this.removeSelectedFile());
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
        
        if (this.userRole === 'staff') {
            this.btnExport.classList.add('hidden');
        } else {
            this.btnExport.classList.remove('hidden');
        }
        
        this.render();
    }

    showLogin() {
        this.appContainer.classList.add('hidden');
        this.loginContainer.classList.remove('hidden');
        this.loginForm.reset();
        this.authError.classList.add('hidden');
    }

    openModal() {
        this.modal.classList.remove('hidden');
        document.getElementById('customerName').focus();
    }

    closeModal() {
        this.modal.classList.add('hidden');
        this.form.reset();
        this.removeSelectedFile();
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        this.selectedFile = file;
        const reader = new FileReader();

        reader.onload = (event) => {
            this.photoPreviewImg.src = event.target.result;
            this.photoPreviewContainer.classList.remove('hidden');
        };

        reader.readAsDataURL(file);
    }

    removeSelectedFile() {
        this.selectedFile = null;
        this.fileInput.value = '';
        this.photoPreviewImg.src = '';
        this.photoPreviewContainer.classList.add('hidden');
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
        submitBtn.textContent = 'Saving...';
        submitBtn.disabled = true;

        const newRepair = {
            id: document.getElementById('repairId').value.trim(),
            customerName: document.getElementById('customerName').value,
            customerPhone: document.getElementById('customerPhone').value,
            watchModel: document.getElementById('watchModel').value,
            issueDesc: document.getElementById('issueDesc').value,
            estCost: parseFloat(document.getElementById('estCost').value),
            status: 'received',
            dateAdded: new Date().toISOString(),
            photoUrl: ''
        };

        try {
            // Upload photo if selected
            if (this.selectedFile) {
                submitBtn.textContent = 'Uploading Photo...';
                const fileExt = this.selectedFile.name.split('.').pop();
                const fileName = `watch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${fileExt}`;
                const storageRef = ref(storage, `watch_photos/${fileName}`);
                
                await uploadBytes(storageRef, this.selectedFile);
                newRepair.photoUrl = await getDownloadURL(storageRef);
            }

            submitBtn.textContent = 'Saving Data...';
            await addDoc(collection(db, "repairs"), newRepair);
            this.closeModal();
        } catch (error) {
            console.error("Error adding document: ", error);
            alert("Error saving repair to database: " + error.message);
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

        // CSV Rows
        this.repairs.forEach(r => {
            const dateStr = new Date(r.dateAdded).toLocaleDateString();
            const issueStr = `"${r.issueDesc.replace(/"/g, '""')}"`;
            const statusLabel = this.statusOptions[r.status];
            const row = `${r.id},${dateStr},${r.customerName},${r.customerPhone},${r.watchModel},${issueStr},${r.estCost},${statusLabel}`;
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
        if (this.repairs.length === 0) {
            this.table.classList.add('hidden');
            this.emptyState.classList.remove('hidden');
            return;
        }

        this.table.classList.remove('hidden');
        this.emptyState.classList.add('hidden');
        this.tableBody.innerHTML = '';

        this.repairs.forEach(repair => {
            const tr = document.createElement('tr');

            // Generate Status Dropdown
            let statusSelectHtml = `<select class="status-select" data-id="${repair.firebaseId}">`;
            for (const [key, label] of Object.entries(this.statusOptions)) {
                const selected = repair.status === key ? 'selected' : '';
                statusSelectHtml += `<option value="${key}" ${selected}>${label}</option>`;
            }
            statusSelectHtml += `</select>`;

            const dateStr = new Date(repair.dateAdded).toLocaleDateString();
            const photoHtml = repair.photoUrl 
                ? `<div class="table-photo" data-url="${repair.photoUrl}"><img src="${repair.photoUrl}" alt="Watch"></div>`
                : `<div class="table-photo empty"><i class="fa-solid fa-image"></i></div>`;

            tr.innerHTML = `
                <td>
                    <strong>${repair.id}</strong><br>
                    <span style="font-size: 0.75rem; color: var(--text-secondary)">${dateStr}</span>
                </td>
                <td>${photoHtml}</td>
                <td>
                    <span class="customer-name">${repair.customerName}</span>
                    <span class="customer-phone">${repair.customerPhone}</span>
                </td>
                <td>
                    <strong>${repair.watchModel}</strong><br>
                    <span style="font-size: 0.85rem; color: var(--text-secondary); display: inline-block; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${repair.issueDesc}">${repair.issueDesc}</span>
                </td>
                <td>
                    <span class="status-badge status-${repair.status}">${this.statusOptions[repair.status]}</span><br>
                    ${statusSelectHtml}
                </td>
                <td>\u20b9${repair.estCost.toFixed(2)}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem; justify-content: center;">
                        <button class="btn-icon whatsapp-btn" data-id="${repair.firebaseId}" title="Send WhatsApp Message">
                            <i class="fa-brands fa-whatsapp" style="color: #25D366; pointer-events: none;"></i>
                        </button>
                        ${this.userRole === 'admin' ? `
                        <button class="btn-icon delete-btn" data-id="${repair.firebaseId}" title="Delete">
                            <i class="fa-solid fa-trash" style="color: var(--danger); pointer-events: none;"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            `;
            this.tableBody.appendChild(tr);
        });

        // Attach event listeners (inline onclick doesn't work inside ES modules)
        document.querySelectorAll('.status-select').forEach(select => {
            select.addEventListener('change', (e) => {
                this.updateStatus(e.target.dataset.id, e.target.value);
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
        this.renderStats();
        this.renderTable();
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    window.appTracker = new RepairTracker();
});
