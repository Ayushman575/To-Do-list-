/* =========================
   Glass To‑Do — script
   Vanilla JS (no frameworks)
   ========================= */

(() => {
  "use strict";

  // ---------- DOM helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  // ---------- Storage ----------
  const LS_KEYS = {
    tasks: "glass_todo_tasks_v1",
    theme: "glass_todo_theme_v1",
    daily: "glass_todo_daily_v1",
  };

  const uid = () => {
    try {
      if (crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch {}
    return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  };

  // ---------- Date helpers ----------
  const startOfLocalDay = (d = new Date()) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const todayKey = () => startOfLocalDay().toISOString().slice(0, 10);

  const isOverdue = (dueISO) => {
    if (!dueISO) return false;
    const due = new Date(dueISO);
    if (Number.isNaN(due.getTime())) return false;
    return due.getTime() < Date.now();
  };

  const formatRemaining = (dueISO) => {
    if (!dueISO) return "";
    const due = new Date(dueISO);
    if (Number.isNaN(due.getTime())) return "";

    const diffMs = due.getTime() - Date.now();
    const neg = diffMs < 0;
    const abs = Math.abs(diffMs);

    const minutes = Math.floor(abs / (60 * 1000));
    const hours = Math.floor(abs / (60 * 60 * 1000));
    const days = Math.floor(abs / (24 * 60 * 60 * 1000));

    let str;
    if (days >= 1) str = `${days}d ${hours % 24}h`;
    else if (hours >= 1) str = `${hours}h ${minutes % 60}m`;
    else str = `${minutes}m`;

    return neg ? `${str} overdue` : `Due in ${str}`;
  };

  // ---------- Safety ----------
 const escapeHtml = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  // ---------- DOM refs ----------
  const el = {
    search: $("#search"),
    filter: $("#filter"),
    categoryWrap: $("#categoryWrap"),
    category: $("#category"),
    themeToggle: $("#themeToggle"),

    countTotal: $("#countTotal"),
    countCompleted: $("#countCompleted"),
    countPending: $("#countPending"),
    progressBar: $("#progressBar"),
    progressLabel: $("#progressLabel"),

    taskForm: $("#taskForm"),
    title: $("#title"),
    taskCategory: $("#taskCategory"),
    customCategoryWrap: $("#customCategoryWrap"),
    customCategory: $("#customCategory"),
    priority: $("#priority"),
    dueDate: $("#dueDate"),
    clearCompletedBtn: $("#clearCompletedBtn"),

    tasksWrap: $("#tasks"),
    emptyState: $("#emptyState"),
    taskSub: $("#taskSub"),

    undoBar: $("#undoBar"),
    undoText: $("#undoBar .undo-text"),
    undoBtn: $("#undoBtn"),

    toastContainer: $("#toastContainer"),

    quote: $("#quote"),
    quoteBy: $("#quoteBy"),

    todayCompleted: $("#todayCompleted"),
    streak: $("#streak"),

    exportBtn: $("#exportBtn"),
    importBtn: $("#importBtn"),
    importModal: $("#importModal"),
    importClose: $("#importClose"),
    pickImport: $("#pickImport"),
    importHidden: $("#importHidden"),
    importStatus: $("#importStatus"),
  };

  // ---------- State ----------
  /** @type {Array<any>} */
  let tasks = [];
  let filterValue = el.filter.value || "all";
  let categoryFilter = el.category.value || "Personal";

  /** @type {null | {token:number,label:string,applyFn:Function}} */
  let undo = null;

  // ---------- Toast ----------
  const toast = (title, msg, kind = "info") => {
    const node = document.createElement("div");
    node.className = "toast";
    const icon = kind === "danger" ? "!" : kind === "success" ? "✓" : "✦";

    node.innerHTML = `
      <div class="t-ic" aria-hidden="true">${icon}</div>
      <div>
        <div class="t-title">${escapeHtml(title)}</div>
        <div class="t-msg">${escapeHtml(msg)}</div>
      </div>
    `;

    el.toastContainer.appendChild(node);
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(6px)";
    }, 2600);
    setTimeout(() => node.remove(), 2850);
  };

  // ---------- Undo ----------
  const clearUndo = () => {
    undo = null;
    el.undoBar.hidden = true;
    el.undoBtn.onclick = null;
  };

  const showUndo = (label, applyFn) => {
    const token = Date.now();
    undo = { token, label, applyFn };

    el.undoText.textContent = label;
    el.undoBar.hidden = false;

    el.undoBtn.onclick = () => {
      if (!undo || undo.token !== token) return;
      undo.applyFn();
      clearUndo();
      toast("Undo", "Action reverted.", "success");
    };

    setTimeout(() => {
      if (undo && undo.token === token) clearUndo();
    }, 8000);
  };

  // ---------- Theme ----------
  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    const iconEl = el.themeToggle.querySelector(".icon");
    if (iconEl) iconEl.textContent = theme === "light" ? "☀" : "☾";
  };

  const initTheme = () => {
    const stored = localStorage.getItem(LS_KEYS.theme);
    applyTheme(stored === "light" ? "light" : "dark");
  };

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(LS_KEYS.theme, next);
    applyTheme(next);
    toast("Theme updated", next === "light" ? "Light mode enabled." : "Dark mode enabled.", "success");
  };

  el.themeToggle.addEventListener("click", toggleTheme);

  // ---------- Quotes ----------
  const QUOTES = [
    { q: "Small steps every day add up to big results.", by: "— Anonymous" },
    { q: "Make it work, then make it right, then make it fast.", by: "— Kent Beck" },
    { q: "Action is the antidote to anxiety.", by: "— Unknown" },
    { q: "Focus on being productive instead of busy.", by: "— Tim Ferriss" },
    { q: "The best time to start was yesterday. The next best time is now.", by: "— Unknown" },
    { q: "Discipline is choosing what you want most over what you want now.", by: "— David Goggins" },
  ];

  const renderQuote = () => {
    const i = Math.floor(Math.random() * QUOTES.length);
    el.quote.textContent = `“${QUOTES[i].q}”`;
    el.quoteBy.textContent = QUOTES[i].by;
  };

  // ---------- Storage load/save ----------
  const loadTasks = () => {
    try {
      const raw = localStorage.getItem(LS_KEYS.tasks);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];

      return arr.filter(Boolean).map((t) => ({
        id: String(t.id ?? uid()),
        title: String(t.title ?? ""),
        category: String(t.category ?? "Personal"),
        priority: ["high", "medium", "low"].includes(t.priority) ? t.priority : "medium",
        dueDateISO: t.dueDateISO ? String(t.dueDateISO) : null,
        completed: Boolean(t.completed),
        createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
        completedAt: t.completedAt ? Number(t.completedAt) : null,
        order: Number.isFinite(t.order) ? t.order : 0,
      }));
    } catch {
      return [];
    }
  };

  const saveTasks = () => localStorage.setItem(LS_KEYS.tasks, JSON.stringify(tasks));

  const loadDaily = () => {
    try {
      const raw = localStorage.getItem(LS_KEYS.daily);
      if (!raw) return { lastCompletionDay: null, streak: 0 };
      const d = JSON.parse(raw);
      return {
        lastCompletionDay: d.lastCompletionDay ?? null,
        streak: Number.isFinite(d.streak) ? d.streak : 0,
      };
    } catch {
      return { lastCompletionDay: null, streak: 0 };
    }
  };

  const saveDaily = (d) => localStorage.setItem(LS_KEYS.daily, JSON.stringify(d));

  // ---------- Metrics ----------
  const renderDailySummary = () => {
    const key = todayKey();
    const completedToday = tasks.filter((t) => {
      if (!t.completedAt) return false;
      const day = startOfLocalDay(new Date(t.completedAt)).toISOString().slice(0, 10);
      return day === key;
    }).length;

    el.todayCompleted.textContent = String(completedToday);

    const daily = loadDaily();
    el.streak.textContent = String(daily.streak || 0);
  };

  const getCounts = () => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    return { total, completed, pending: total - completed };
  };

  const completionPct = () => {
    const { total, completed } = getCounts();
    if (!total) return 0;
    return Math.round((completed / total) * 100);
  };

  // ---------- Filtering/search ----------
  const updateCategoryVisibility = () => {
    const show = filterValue === "category";
    el.categoryWrap.hidden = !show;
    if (show) el.category.value = categoryFilter;
  };

  const matchesSearchAndFilter = (task) => {
    const q = (el.search.value || "").trim().toLowerCase();
    const bySearch = !q || task.title.toLowerCase().includes(q) || task.category.toLowerCase().includes(q);

    let byFilter = true;
    switch (filterValue) {
      case "all":
        byFilter = true;
        break;
      case "completed":
        byFilter = task.completed;
        break;
      case "pending":
        byFilter = !task.completed;
        break;
      case "high":
        byFilter = task.priority === "high";
        break;
      case "medium":
        byFilter = task.priority === "medium";
        break;
      case "low":
        byFilter = task.priority === "low";
        break;
      case "category":
        byFilter = task.category === categoryFilter;
        break;
    }

    return bySearch && byFilter;
  };

  el.filter.addEventListener("change", () => {
    filterValue = el.filter.value;
    if (filterValue === "category") categoryFilter = el.category.value;
    updateCategoryVisibility();
    render();
  });

  el.category.addEventListener("change", () => {
    categoryFilter = el.category.value;
    if (filterValue === "category") render();
  });

  el.search.addEventListener("input", () => render());

  el.taskCategory.addEventListener("change", () => {
    const v = el.taskCategory.value;
    el.customCategoryWrap.hidden = v !== "Custom";
    if (v !== "Custom") el.customCategory.value = "";
  });

  // ---------- Drag & drop ----------
  const normalizeOrders = () => {
    tasks = tasks.slice().sort((a, b) => a.order - b.order).map((t, i) => ({ ...t, order: i }));
  };

  const reorderTasks = (draggedId, targetId) => {
    const ordered = tasks.slice().sort((a, b) => a.order - b.order);
    const aIdx = ordered.findIndex((t) => t.id === draggedId);
    const bIdx = ordered.findIndex((t) => t.id === targetId);
    if (aIdx < 0 || bIdx < 0) return;

    const [moved] = ordered.splice(aIdx, 1);
    ordered.splice(bIdx, 0, moved);

    tasks = ordered.map((t, i) => ({ ...t, order: i }));
    saveTasks();
    render();
    toast("Reordered", "Task order updated.", "success");
  };

  // ---------- Render tasks ----------
  const priorityPillClass = (p) => (p === "high" ? "pr-high" : p === "medium" ? "pr-medium" : "pr-low");
  const priorityLabel = (p) => (p === "high" ? "High Priority" : p === "medium" ? "Medium Priority" : "Low Priority");

  const renderTaskNode = (task) => {
    const overdue = isOverdue(task.dueDateISO);
    const dueText = task.dueDateISO ? formatRemaining(task.dueDateISO) : "";

    const node = document.createElement("div");
    node.className = `task task-enter ${task.completed ? "completed" : ""}`;
    node.setAttribute("data-id", task.id);
    node.draggable = true;

    node.innerHTML = `
      <div class="handle" aria-hidden="true"></div>

      <div class="task-left">
        <div class="task-top">
          <button class="check" type="button" aria-label="Toggle complete">
            <input type="checkbox" ${task.completed ? "checked" : ""} />
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <div class="task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</div>
        </div>

        <div class="badges" style="margin-top:8px;">
          <span class="pill ${priorityPillClass(task.priority)}">${escapeHtml(priorityLabel(task.priority))}</span>
          <span class="pill category">${escapeHtml(task.category)}</span>
          ${task.dueDateISO ? `<span class="pill due ${overdue ? "overdue" : ""}">${escapeHtml(dueText)}</span>` : ""}
        </div>

        <div class="due" style="margin-top:8px;">
          ${task.dueDateISO ? `<span class="due ${overdue ? "overdue" : ""}">Deadline: ${escapeHtml(String(task.dueDateISO).slice(0, 10))}${overdue ? " • Overdue" : ""}</span>` : ""}
        </div>
      </div>

      <div class="task-actions">
        <button class="icon" type="button" data-action="edit" aria-label="Edit task">✎</button>
        <button class="icon task-rem" type="button" data-action="delete" aria-label="Delete task">⌫</button>
      </div>
    `;

    node.querySelector(".check").addEventListener("click", () => toggleComplete(task.id));
    node.querySelector('[data-action="delete"]').addEventListener("click", () => deleteTask(task.id));
    node.querySelector('[data-action="edit"]').addEventListener("click", () => openEditModal(task.id));

    node.addEventListener("dragstart", (e) => {
      node.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", task.id);
    });

    node.addEventListener("dragend", () => node.classList.remove("dragging"));
    node.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });

    node.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === task.id) return;
      reorderTasks(draggedId, task.id);
    });

    return node;
  };

  const render = () => {
    const ordered = tasks.slice().sort((a, b) => a.order - b.order);
    const visible = ordered.filter(matchesSearchAndFilter);

    const { total, completed, pending } = getCounts();
    el.countTotal.textContent = String(total);
    el.countCompleted.textContent = String(completed);
    el.countPending.textContent = String(pending);

    const pct = completionPct();
    el.progressBar.style.width = `${pct}%`;
    el.progressLabel.textContent = `${pct}%`;

    el.clearCompletedBtn.disabled = completed === 0;

    el.emptyState.hidden = visible.length !== 0;
    el.tasksWrap.innerHTML = "";

    if (visible.length === 0) {
      const q = (el.search.value || "").trim();
      const f = filterValue === "all" ? "all" : filterValue;
      el.taskSub.textContent = q ? `No matches for “${q}”.` : `No tasks found (${f}).`;
    }

    visible.forEach((t) => el.tasksWrap.appendChild(renderTaskNode(t)));

    renderDailySummary();
  };

  // ---------- CRUD ----------
  const normalizeCategoryFromAddForm = () => {
    const v = el.taskCategory.value;
    if (v === "Custom") {
      const custom = (el.customCategory.value || "").trim();
      return custom ? custom : "Custom";
    }
    return v;
  };

  el.taskForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = (el.title.value || "").trim();
    if (!title) return;

    const category = normalizeCategoryFromAddForm();
    const priority = el.priority.value;
    const dueDateISO = el.dueDate.value ? new Date(`${el.dueDate.value}T23:59:59`).toISOString() : null;

    const maxOrder = tasks.length ? Math.max(...tasks.map((t) => t.order ?? 0)) : -1;
    tasks.push({
      id: uid(),
      title,
      category,
      priority,
      dueDateISO,
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
      order: maxOrder + 1,
    });

    normalizeOrders();
    saveTasks();
    render();
    toast("Task added", "Added to your list.", "success");

    el.title.value = "";
    el.dueDate.value = "";
    el.priority.value = "medium";
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const active = document.activeElement;
    if (!active) return;
    if (active === el.title) return;

    const tag = active.tagName?.toLowerCase();
    if (tag === "select" || tag === "textarea" || tag === "input") return;

    if ((el.title.value || "").trim()) el.taskForm.requestSubmit();
  });

  const deleteTask = (id) => {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx < 0) return;

    const snapshot = { ...tasks[idx] };
    const before = tasks.map((t) => ({ ...t }));

    // quick remove
    const node = el.tasksWrap.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (node) node.classList.add("task-exit");

    tasks.splice(idx, 1);
    normalizeOrders();
    saveTasks();
    render();

    showUndo("Task deleted.", () => {
      tasks = before;
      saveTasks();
      render();
      toast("Undo", "Task restored.", "success");
    });

    toast("Task deleted", "You can undo this action.", "danger");
  };

  const toggleComplete = (id) => {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx < 0) return;

    const before = tasks.map((t) => ({ ...t }));
    const wasCompleted = tasks[idx].completed;

    tasks[idx].completed = !wasCompleted;
    tasks[idx].completedAt = tasks[idx].completed ? Date.now() : null;

    if (!wasCompleted) {
      const daily = loadDaily();
      const nowDay = todayKey();
      if (daily.lastCompletionDay !== nowDay) {
        if (!daily.lastCompletionDay) daily.streak = 1;
        else {
          const last = new Date(`${daily.lastCompletionDay}T00:00:00`);
          const yesterday = startOfLocalDay(new Date(Date.now() - 24 * 60 * 60 * 1000));
          daily.streak = startOfLocalDay(last).getTime() === yesterday.getTime() ? daily.streak + 1 : 1;
        }
        daily.lastCompletionDay = nowDay;
      }
      saveDaily(daily);
    }

    saveTasks();
    render();

    if (!wasCompleted) {
      showUndo("Marked as completed. You can undo.", () => {
        tasks = before;
        saveTasks();
        render();
      });
      toast("Completed", "Nice work! (Undo available)", "success");
    } else {
      toast("Reopened", "Task marked as pending.", "info");
    }
  };

  el.clearCompletedBtn.addEventListener("click", () => {
    const completed = tasks.filter((t) => t.completed);
    if (!completed.length) return;

    const before = tasks.map((t) => ({ ...t }));

    tasks = tasks.filter((t) => !t.completed);
    normalizeOrders();
    saveTasks();
    render();

    showUndo(`Cleared ${completed.length} completed task(s).`, () => {
      tasks = before;
      saveTasks();
      render();
    });

    toast("Cleared", "Completed tasks removed.", "danger");
  });

  // ---------- Edit modal ----------
  let editModalEl = null;

  const ensureEditModal = () => {
    if (editModalEl) return;

    editModalEl = document.createElement("div");
    editModalEl.id = "editModal";
    editModalEl.className = "modal";
    editModalEl.hidden = true;

    editModalEl.innerHTML = `
      <div class="modal-card glass" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h2>Edit task</h2>
          <button class="icon-btn" type="button" data-close aria-label="Close">✕</button>
        </div>

        <form id="editForm" class="form" autocomplete="off" style="margin-top:10px;">
          <div class="row">
            <div class="field full">
              <label for="editTitle">Task</label>
              <input id="editTitle" name="title" type="text" required />
            </div>
          </div>

          <div class="row">
            <div class="field">
              <label for="editCategory">Category</label>
              <select id="editCategory">
                <option value="Personal">Personal</option>
                <option value="Work">Work</option>
                <option value="Study">Study</option>
                <option value="Health">Health</option>
                <option value="Custom">Custom…</option>
              </select>
            </div>

            <div class="field" id="editCustomWrap" hidden>
              <label for="editCustomCategory">Custom category</label>
              <input id="editCustomCategory" type="text" />
            </div>

            <div class="field">
              <label for="editPriority">Priority</label>
              <select id="editPriority">
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
            </div>
          </div>

          <div class="row">
            <div class="field full">
              <label for="editDueDate">Due date</label>
              <input id="editDueDate" type="date" />
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn" type="submit">Save changes</button>
            <button class="btn ghost" type="button" data-cancel>Cancel</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(editModalEl);

    const close = () => {
      editModalEl.hidden = true;
      editModalEl.dataset.editingId = "";
    };

    editModalEl.addEventListener("click", (e) => {
      const t = e.target;
      if (t?.getAttribute?.("data-close") !== null) close();
      if (t?.getAttribute?.("data-cancel") !== null) close();
      if (t === editModalEl) close();
    });

    const editCat = $("#editCategory", editModalEl);
    const editCustomWrap = $("#editCustomWrap", editModalEl);
    const editCustom = $("#editCustomCategory", editModalEl);

    editCat.addEventListener("change", () => {
      editCustomWrap.hidden = editCat.value !== "Custom";
      if (editCat.value !== "Custom") editCustom.value = "";
    });

    $("#editForm", editModalEl).addEventListener("submit", (e) => {
      e.preventDefault();
      const id = editModalEl.dataset.editingId;
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx < 0) return;

      const title = ($("#editTitle", editModalEl).value || "").trim();
      const priority = $("#editPriority", editModalEl).value;
      const cat = editCat.value === "Custom"
        ? (((editCustom.value || "").trim() || "Custom"))
        : editCat.value;

      const dueDate = $("#editDueDate", editModalEl).value;
      const dueISO = dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null;

      tasks[idx] = { ...tasks[idx], title, priority, category: cat, dueDateISO: dueISO };
      saveTasks();
      render();
      toast("Saved", "Task updated.", "success");
      close();
    });
  };

  const openEditModal = (id) => {
    ensureEditModal();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx < 0) return;

    editModalEl.dataset.editingId = id;
    editModalEl.hidden = false;

    $("#editTitle", editModalEl).value = tasks[idx].title;
    $("#editPriority", editModalEl).value = tasks[idx].priority;

    const known = ["Personal", "Work", "Study", "Health"];
    const editCat = $("#editCategory", editModalEl);
    const editCustomWrap = $("#editCustomWrap", editModalEl);
    const editCustom = $("#editCustomCategory", editModalEl);

    if (known.includes(tasks[idx].category)) {
      editCat.value = tasks[idx].category;
      editCustomWrap.hidden = true;
      editCustom.value = "";
    } else {
      editCat.value = "Custom";
      editCustomWrap.hidden = false;
      editCustom.value = tasks[idx].category;
    }

    $("#editDueDate", editModalEl).value = tasks[idx].dueDateISO ? String(tasks[idx].dueDateISO).slice(0, 10) : "";
  };

  // ---------- Export / Import ----------
  const exportTasks = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: tasks.slice().sort((a, b) => a.order - b.order),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `glass-to-do-tasks-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    toast("Exported", "JSON file downloaded.", "success");
  };

  el.exportBtn.addEventListener("click", exportTasks);

  const closeImport = () => {
    el.importModal.hidden = true;
    el.importStatus.textContent = "";
    el.importHidden.value = "";
  };

  const openImport = () => {
    el.importStatus.textContent = "";
    // IMPORTANT: keep modal closed unless user explicitly clicks Import
    el.importModal.hidden = false;
  };

  el.importBtn.addEventListener("click", openImport);
  el.importClose.addEventListener("click", closeImport);
  el.pickImport.addEventListener("click", () => el.importHidden.click());
  el.importModal.addEventListener("click", (e) => {
    if (e.target === el.importModal) closeImport();
  });

  el.importHidden.addEventListener("change", async () => {
    const file = el.importHidden.files?.[0];
    if (!file) return;

    el.importStatus.textContent = "Importing…";

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = parsed?.tasks ? parsed.tasks : parsed;
      if (!Array.isArray(imported)) throw new Error("Invalid JSON structure");

      const byId = new Map(tasks.map((t) => [t.id, t]));
      let added = 0;

      imported.forEach((t) => {
        if (!t || typeof t !== "object") return;
        const incoming = {
          id: String(t.id ?? uid()),
          title: String(t.title ?? "Untitled"),
          category: String(t.category ?? "Personal"),
          priority: ["high", "medium", "low"].includes(t.priority) ? t.priority : "medium",
          dueDateISO: t.dueDateISO ? String(t.dueDateISO) : null,
          completed: Boolean(t.completed),
          createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
          completedAt: t.completedAt ? Number(t.completedAt) : (t.completed ? Date.now() : null),
          order: Number.isFinite(t.order) ? t.order : 999999,
        };

        if (byId.has(incoming.id)) {
          const existing = byId.get(incoming.id);
          byId.set(incoming.id, { ...existing, ...incoming, order: existing.order });
        } else {
          byId.set(incoming.id, incoming);
          added++;
        }
      });

      tasks = [...byId.values()].sort((a, b) => a.order - b.order).map((t, i) => ({ ...t, order: i }));
      saveTasks();
      render();

      el.importStatus.textContent = `Imported. Added ${added} task(s).`;
      toast("Imported", `Added ${added} task(s).`, "success");
      closeImport();
    } catch (err) {
      el.importStatus.textContent = `Import failed: ${String(err?.message || err)}`;
      toast("Import failed", "Invalid JSON file.", "danger");
    }
  });

  // ---------- Init ----------
  const init = () => {
    tasks = loadTasks();
    normalizeOrders();

    initTheme();
    renderQuote();

    filterValue = el.filter.value || "all";
    categoryFilter = el.category.value || "Personal";
    updateCategoryVisibility();

    render();
  };

  init();

  // Refresh overdue labels/remaining time
  setInterval(() => render(), 30000);
})();

