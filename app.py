from flask import Flask, render_template, jsonify, request
import pandas as pd
import math
from pathlib import Path

app = Flask(__name__)

EXCEL_FILE = Path(__file__).parent / "students.xlsx"

SUBJECTS = ["OT", "PYDS", "DWDM", "AI", "BCT", "ERM"]
REQUIRED_COLUMNS = ["RegNo", "Name", "DOB"] + SUBJECTS


def get_grade(average):
    if average >= 90:
        return "A+"
    elif average >= 80:
        return "A"
    elif average >= 70:
        return "B"
    elif average >= 60:
        return "C"
    elif average >= 50:
        return "D"
    return "F"


def clean_value(value):
    if pd.isna(value):
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def load_students():
    if not EXCEL_FILE.exists():
        raise FileNotFoundError("students.xlsx not found beside app.py")

    df = pd.read_excel(EXCEL_FILE)
    df.columns = df.columns.astype(str).str.strip()

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError("Missing Excel columns: " + ", ".join(missing))

    df = df.dropna(subset=["RegNo", "Name"]).copy()

    for subject in SUBJECTS:
        df[subject] = pd.to_numeric(df[subject], errors="coerce")

    # Ignore incomplete mark records to avoid incorrect totals.
    df = df.dropna(subset=SUBJECTS).copy()

    df["Total"] = df[SUBJECTS].sum(axis=1)
    df["Average"] = df["Total"] / len(SUBJECTS)
    df["Grade"] = df["Average"].apply(get_grade)

    df["Result"] = df[SUBJECTS].ge(35).all(axis=1).map({
        True: "PASS",
        False: "FAIL"
    })

    return df


def student_to_dict(row):
    data = {column: clean_value(row[column]) for column in REQUIRED_COLUMNS}
    data.update({
        "Total": round(float(row["Total"]), 2),
        "Average": round(float(row["Average"]), 2),
        "Grade": row["Grade"],
        "Result": row["Result"],
        "FailedSubjects": [
            subject for subject in SUBJECTS if row[subject] < 35
        ]
    })

    for subject in SUBJECTS:
        data[subject] = clean_value(row[subject])

    return data


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/dashboard")
def dashboard_data():
    try:
        df = load_students()

        if df.empty:
            return jsonify({"error": "No valid student records found."}), 400

        topper = df.loc[df["Total"].idxmax()]

        highest_marks = []
        for subject in SUBJECTS:
            row = df.loc[df[subject].idxmax()]
            highest_marks.append({
                "subject": subject,
                "name": str(row["Name"]),
                "regNo": clean_value(row["RegNo"]),
                "marks": clean_value(row[subject])
            })

        students = []
        for _, row in df.iterrows():
            students.append(student_to_dict(row))

        passed = int((df["Result"] == "PASS").sum())
        failed = int((df["Result"] == "FAIL").sum())

        return jsonify({
            "summary": {
                "totalStudents": len(df),
                "classAverage": round(float(df["Average"].mean()), 2),
                "passCount": passed,
                "failCount": failed,
                "passRate": round(passed / len(df) * 100, 1),
                "failRate": round(failed / len(df) * 100, 1),
                "topper": {
                    "name": str(topper["Name"]),
                    "regNo": clean_value(topper["RegNo"]),
                    "total": clean_value(topper["Total"]),
                    "average": round(float(topper["Average"]), 2)
                }
            },
            "subjects": SUBJECTS,
            "students": students,
            "highestMarks": highest_marks
        })

    except Exception as error:
        app.logger.exception("Unable to load dashboard")
        return jsonify({"error": str(error)}), 500


@app.route("/api/student")
def student_report():
    reg_no = request.args.get("reg_no", "").strip()

    if not reg_no:
        return jsonify({"error": "Enter a register number."}), 400

    try:
        df = load_students()
        matches = df[
            df["RegNo"].astype(str).str.strip() == reg_no
        ]

        if matches.empty:
            return jsonify({"error": "Student not found."}), 404

        return jsonify(student_to_dict(matches.iloc[0]))

    except Exception as error:
        app.logger.exception("Unable to find student")
        return jsonify({"error": str(error)}), 500


if __name__ == "__main__":
    app.run(debug=True)