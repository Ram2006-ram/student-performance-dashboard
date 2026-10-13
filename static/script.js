const SUBJECTS = ["OT", "PYDS", "DWDM", "AI", "BCT", "ERM"];

let dashboardData = null;
let marksChart = null;
let resultChart = null;
let subjectChart = null;

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function formatNumber(value, digits = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function showError(message) {
    $("errorBox").textContent = message;
    $("errorBox").classList.remove("hidden");
}

function clearError() {
    $("errorBox").textContent = "";
    $("errorBox").classList.add("hidden");
}

async function fetchJSON(url) {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Unable to load data.");
    }

    return data;
}

async function loadDashboard() {
    clearError();
    $("loading").classList.remove("hidden");

    try {
        dashboardData = await fetchJSON("/api/dashboard");
        renderDashboard();
        renderStudentTable();
        renderSubjectAnalysis();

        $("loading").classList.add("hidden");
        showPage("dashboard");
    } catch (error) {
        $("loading").classList.add("hidden");
        showError(error.message);
    }
}

function renderDashboard() {
    const { summary, students, highestMarks } = dashboardData;

    $("totalStudents").textContent = summary.totalStudents;
    $("classAverage").textContent =
        formatNumber(summary.classAverage, 2) + "%";

    $("passRate").textContent =
        formatNumber(summary.passRate, 1) + "%";

    $("passCount").textContent =
        `${summary.passCount} passed · ${summary.failCount} failed`;

    $("topperName").textContent = summary.topper.name;
    $("topperTotal").textContent =
        `${summary.topper.total} / 600 marks`;

    $("passLegend").textContent = summary.passCount;
    $("failLegend").textContent = summary.failCount;

    $("highestTable").innerHTML = highestMarks.map(item => `
        <tr>
            <td><strong>${escapeHTML(item.subject)}</strong></td>
            <td>${escapeHTML(item.name)}</td>
            <td>${escapeHTML(item.regNo)}</td>
            <td><strong>${formatNumber(item.marks)}</strong> / 100</td>
        </tr>
    `).join("");

    renderCharts(students, summary);
}

function renderCharts(students, summary) {
    if (typeof Chart === "undefined") {
        showError("Charts could not load. Check your internet connection.");
        return;
    }

    if (marksChart) marksChart.destroy();
    if (resultChart) resultChart.destroy();

    const sorted = [...students].sort((a, b) => b.Total - a.Total);

    marksChart = new Chart($("marksChart"), {
        type: "bar",
        data: {
            labels: sorted.map(s => s.Name),
            datasets: [{
                label: "Total Marks",
                data: sorted.map(s => s.Total),
                backgroundColor: "#16805d",
                borderRadius: 5,
                maxBarThickness: 35
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 600,
                    title: { display: true, text: "Marks / 600" }
                },
                x: {
                    ticks: {
                        maxRotation: 50,
                        minRotation: 0
                    }
                }
            }
        }
    });

    resultChart = new Chart($("resultChart"), {
        type: "doughnut",
        data: {
            labels: ["Pass", "Fail"],
            datasets: [{
                data: [summary.passCount, summary.failCount],
                backgroundColor: ["#16805d", "#dc6969"],
                borderWidth: 0,
                hoverOffset: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "68%",
            plugins: {
                legend: { display: false }
            }
        }
    });
}

const PAGE_TITLES = {
    dashboard: "Student Performance Dashboard",
    report: "Individual Student Report",
    subjects: "Subject Analysis",
    students: "All Students"
};

function showPage(page) {
    document.querySelectorAll(".page").forEach(section => {
        section.classList.add("hidden");
    });

    const target = $(page + "Page");
    if (target) target.classList.remove("hidden");

    document.querySelectorAll(".nav-link").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === page
        );
    });

    $("pageTitle").textContent = PAGE_TITLES[page] || "Dashboard";
    clearError();

    // Refresh charts when their container becomes visible.
    setTimeout(() => {
        if (marksChart) marksChart.resize();
        if (resultChart) resultChart.resize();
        if (subjectChart) subjectChart.resize();
    }, 50);
}

function renderStudentTable() {
    if (!dashboardData) return;

    const search = $("tableSearch").value.trim().toLowerCase();
    const resultFilter = $("resultFilter").value;

    const filtered = dashboardData.students.filter(student => {
        const matchesSearch =
            String(student.Name).toLowerCase().includes(search) ||
            String(student.RegNo).toLowerCase().includes(search);

        const matchesResult =
            resultFilter === "ALL" || student.Result === resultFilter;

        return matchesSearch && matchesResult;
    });

    $("studentsTable").innerHTML = filtered.map(student => `
        <tr>
            <td>${escapeHTML(student.RegNo)}</td>
            <td>${escapeHTML(student.Name)}</td>
            <td>${formatNumber(student.Total)} / 600</td>
            <td>${formatNumber(student.Average, 2)}%</td>
            <td>${escapeHTML(student.Grade)}</td>
            <td>
                <span class="result-badge ${student.Result}">
                    ${student.Result}
                </span>
            </td>
        </tr>
    `).join("");

    if (filtered.length === 0) {
        $("studentsTable").innerHTML =
            '<tr><td colspan="6">No matching students found.</td></tr>';
    }

    $("recordCount").textContent =
        `Showing ${filtered.length} of ${dashboardData.students.length} students`;
}

async function searchStudent(event) {
    event.preventDefault();

    const regNo = $("regInput").value.trim();
    if (!regNo) return;

    $("studentReport").innerHTML = "<p>Searching...</p>";

    try {
        const student = await fetchJSON(
            "/api/student?reg_no=" + encodeURIComponent(regNo)
        );

        renderStudentReport(student);
    } catch (error) {
        $("studentReport").innerHTML =
            `<p class="alert">${escapeHTML(error.message)}</p>`;
    }
}

function renderStudentReport(student) {
    const subjectRows = SUBJECTS.map(subject => `
        <tr>
            <td>${escapeHTML(subject)}</td>
            <td>${formatNumber(student[subject])} / 100</td>
            <td>
                <span class="result-badge ${
                    student[subject] >= 35 ? "PASS" : "FAIL"
                }">${student[subject] >= 35 ? "PASS" : "FAIL"}</span>
            </td>
        </tr>
    `).join("");

    $("studentReport").innerHTML = `
        <div class="report-header">
            <h2>${escapeHTML(student.Name)}</h2>
            <p>Register Number: ${escapeHTML(student.RegNo)}</p>
            <p>Date of Birth: ${escapeHTML(student.DOB || "Not available")}</p>
        </div>

        <div class="report-metrics">
            <div class="report-stat">
                <span>Total Marks</span>
                <strong>${formatNumber(student.Total)} / 600</strong>
            </div>
            <div class="report-stat">
                <span>Average</span>
                <strong>${formatNumber(student.Average, 2)}%</strong>
            </div>
            <div class="report-stat">
                <span>Grade</span>
                <strong>${escapeHTML(student.Grade)}</strong>
            </div>
        </div>

        <p style="margin: 15px 0;">
            Final Result:
            <span class="result-badge ${student.Result}">
                ${student.Result}
            </span>
        </p>

        ${student.FailedSubjects.length
            ? `<p class="alert">Below pass mark: ${
                student.FailedSubjects.map(escapeHTML).join(", ")
              }</p>`
            : ""}

        <h3 style="margin: 22px 0 12px;">Subject-wise Marks</h3>
        <div class="table-wrap">
            <table>
                <thead><tr><th>Subject</th><th>Marks</th><th>Status</th></tr></thead>
                <tbody>${subjectRows}</tbody>
            </table>
        </div>
    `;
}

function renderSubjectAnalysis() {
    if (!dashboardData) return;

    const select = $("subjectSelect");
    const current = select.value;

    select.innerHTML = SUBJECTS.map(subject =>
        `<option value="${subject}">${subject}</option>`
    ).join("");

    if (SUBJECTS.includes(current)) select.value = current;

    drawSubjectChart();
}

function drawSubjectChart() {
    if (!dashboardData || typeof Chart === "undefined") return;

    const subject = $("subjectSelect").value;
    if (!subject) return;

    const students = dashboardData.students;
    const marks = students.map(student => Number(student[subject]));

    const average = marks.reduce((sum, mark) => sum + mark, 0) / marks.length;
    const highest = Math.max(...marks);
    const lowest = Math.min(...marks);
    const passed = marks.filter(mark => mark >= 35).length;

    $("subjectMetrics").innerHTML = `
        <div class="subject-stat">
            <span>Subject Average</span><strong>${formatNumber(average, 2)}</strong>
        </div>
        <div class="subject-stat">
            <span>Highest Mark</span><strong>${formatNumber(highest)}</strong>
        </div>
        <div class="subject-stat">
            <span>Students Passed</span><strong>${passed}/${marks.length}</strong>
        </div>
    `;

    if (subjectChart) subjectChart.destroy();

    subjectChart = new Chart($("subjectChart"), {
        type: "bar",
        data: {
            labels: students.map(student => student.Name),
            datasets: [{
                label: subject + " Marks",
                data: marks,
                backgroundColor: marks.map(mark =>
                    mark >= 35 ? "#16805d" : "#dc6969"
                ),
                borderRadius: 4,
                maxBarThickness: 35
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

function downloadCSV() {
    if (!dashboardData) return;

    const search = $("tableSearch").value.trim().toLowerCase();
    const resultFilter = $("resultFilter").value;

    const rows = dashboardData.students.filter(student => {
        const matchesSearch =
            String(student.Name).toLowerCase().includes(search) ||
            String(student.RegNo).toLowerCase().includes(search);

        return matchesSearch &&
            (resultFilter === "ALL" || student.Result === resultFilter);
    });

    const columns = [
        "RegNo", "Name", "DOB", ...SUBJECTS,
        "Total", "Average", "Grade", "Result"
    ];

    // Escape cells so commas, quotes and newlines don't break CSV.
    const csvCell = value =>
        '"' + String(value ?? "").replace(/"/g, '""') + '"';

    const csv = [
        columns.map(csvCell).join(","),
        ...rows.map(student =>
            columns.map(column => csvCell(student[column])).join(",")
        )
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "student_results.csv";
    link.click();
    URL.revokeObjectURL(url);
}

// Navigation
document.querySelectorAll(".nav-link").forEach(button => {
    button.addEventListener("click", () => showPage(button.dataset.page));
});

// Events
$("refreshBtn").addEventListener("click", loadDashboard);
$("searchForm").addEventListener("submit", searchStudent);
$("tableSearch").addEventListener("input", renderStudentTable);
$("resultFilter").addEventListener("change", renderStudentTable);
$("subjectSelect").addEventListener("change", drawSubjectChart);
$("downloadBtn").addEventListener("click", downloadCSV);

// Initial load
loadDashboard();