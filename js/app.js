class RepairTracker {
    constructor() {
        this.repairs = JSON.parse(localStorage.getItem('chronos_repairs')) || [];
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
        this.render();
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
    }

    openModal() {
        this.modal.classList.remove('hidden');
        document.getElementById('customerName').focus();
    }

    closeModal() {
        this.modal.classList.add('hidden');
        this.form.reset();
    }

    generateId() {
        return 'REP-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    }

    handleFormSubmit(e) {
        e.preventDefault();

        const newRepair = {
            id: this.generateId(),
            customerName: document.getElementById('customerName').value,
            customerPhone: document.getElementById('customerPhone').value,
            watchModel: document.getElementById('watchModel').value,
            issueDesc: document.getElementById('issueDesc').value,
            estCost: parseFloat(document.getElementById('estCost').value),
            status: 'received',
            dateAdded: new Date().toISOString()
        };

        this.repairs.unshift(newRepair); // Add to top
        this.saveData();
        this.render();
        this.closeModal();
    }

    updateStatus(id, newStatus) {
        const index = this.repairs.findIndex(r => r.id === id);
        if (index > -1) {
            this.repairs[index].status = newStatus;
            this.saveData();
            this.render();
        }
    }

    deleteRepair(id) {
        if (confirm('Are you sure you want to delete this log?')) {
            this.repairs = this.repairs.filter(r => r.id !== id);
            this.saveData();
            this.render();
        }
    }

    saveData() {
        localStorage.setItem('chronos_repairs', JSON.stringify(this.repairs));
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
            const issueStr = `"${r.issueDesc.replace(/"/g, '""')}"`; // Escape quotes in case of commas
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
            let statusSelectHtml = `<select class="status-select" onchange="app.updateStatus('${repair.id}', this.value)">`;
            for (const [key, label] of Object.entries(this.statusOptions)) {
                const selected = repair.status === key ? 'selected' : '';
                statusSelectHtml += `<option value="${key}" ${selected}>${label}</option>`;
            }
            statusSelectHtml += `</select>`;

            // Formatting date
            const dateStr = new Date(repair.dateAdded).toLocaleDateString();

            tr.innerHTML = `
                <td>
                    <strong>${repair.id}</strong><br>
                    <span style="font-size: 0.75rem; color: var(--text-secondary)">${dateStr}</span>
                </td>
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
                <td>₹${repair.estCost.toFixed(2)}</td>
                <td>
                    <button class="btn-icon" onclick="app.deleteRepair('${repair.id}')" title="Delete">
                        <i class="fa-solid fa-trash" style="color: var(--danger)"></i>
                    </button>
                </td>
            `;
            this.tableBody.appendChild(tr);
        });
    }

    render() {
        this.renderStats();
        this.renderTable();
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    // Expose app instance to global scope to allow inline onclick handlers to access it
    window.app = new RepairTracker();
});
