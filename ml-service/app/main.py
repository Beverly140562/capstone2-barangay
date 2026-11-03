
import os

# Set these before importing Pandas, NumPy, or scikit-learn.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

import json
import sys
from pathlib import Path
from datetime import date, datetime, timedelta

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from joblib import load
from pydantic import BaseModel, Field

load_dotenv()

APP_DIR = Path(__file__).resolve().parent
BASE = APP_DIR.parent

if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from database import fetch_all
from analytics import calculate_analytics

from analytics_visualizations import (
    create_vulnerability_chart,
    create_income_chart,
    create_feature_relationship_chart,
)

MODEL_PATH = BASE / "model" / "luinab_household_rf_pipeline.joblib"


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="Barangay Luinab ML Service",
    version="1.0.0",
)


# ============================================================
# CORS
# ============================================================


# ============================================================
# CORS CONFIGURATION
# ============================================================

from fastapi.middleware.cors import CORSMiddleware

ALLOWED_ORIGINS = [
    "https://capstone2-barangay-j5ni.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["Content-Disposition"],
    max_age=600,
)


# ============================================================
# LOAD COLAB-TRAINED MODEL
# ============================================================

_model = None
_classes = []
_feature_names = []
_model_load_error = None


def load_model():
    global _model, _classes, _feature_names, _model_load_error

    try:
        if not MODEL_PATH.is_file():
            raise FileNotFoundError(
                f"Model artifact does not exist: {MODEL_PATH}"
            )

        payload = load(MODEL_PATH)

        if not isinstance(payload, dict) or "model" not in payload:
            raise RuntimeError(
                "Invalid model artifact. Expected a dictionary "
                "containing the trained pipeline under 'model'."
            )

        candidate_model = payload["model"]
        candidate_features = list(payload.get("feature_names", []))

        required_features = [
            "member_count",
            "head_education",
            "household_monthly_income",
            "family_size",
            "all_members_explicitly_unemployed",
            "provisional_disability_indicator",
            "illness_indicator",
        ]

        if candidate_features != required_features:
            raise RuntimeError(
                "Model feature names do not match. "
                f"Expected: {required_features}; "
                f"Found: {candidate_features}"
            )

        if not hasattr(candidate_model, "predict_proba"):
            raise RuntimeError(
                "Loaded model does not support predict_proba()."
            )

        if not hasattr(candidate_model, "classes_"):
            raise RuntimeError(
                "Loaded model does not expose classes_."
            )

        # Update globals only after validation succeeds.
        _model = candidate_model
        _classes = [str(value) for value in candidate_model.classes_]
        _feature_names = candidate_features
        _model_load_error = None

        print("Colab-trained model loaded successfully.")
        print("Model path:", MODEL_PATH)
        print("Features:", _feature_names)
        print("Classes:", _classes)

        return True

    except Exception as exc:
        _model = None
        _classes = []
        _feature_names = []
        _model_load_error = f"{type(exc).__name__}: {exc}"

        print("MODEL LOAD ERROR:", _model_load_error)
        return False


def ensure_model_loaded():
    if _model is None:
        if not load_model():
            raise RuntimeError(
                f"ML model is unavailable: {_model_load_error}"
            )


# Attempt to load the model when the application starts.
load_model()


# ============================================================
# DATA MODELS
# ============================================================



class Household(BaseModel):
    monthly_income: float | None = None
    family_number: int | None = None
    age: int | None = None
    length_residency: int | None = None

    sex: str | None = None
    civil_status: str | None = None
    highest_education: str | None = None
    occupation: str | None = None
    residence: str | None = None
    family_position: str | None = None

    disability_present: bool | None = None
    four_ps_member: str | None = None
    leading_illnesses: str | None = None

    member_count: int | None = None
    family_size: int | None = None
    head_education: str | None = None

    all_members_explicitly_unemployed: bool | None = None
    provisional_disability_indicator: bool | None = None
    illness_indicator: bool | None = None
    senior_citizen_present: bool | None = None

class Program(BaseModel):
    program_id: str
    program_name: str
    description: str | None = None
    eligibility_rules: dict | str | None = None


class PredictionRequest(BaseModel):
    household: Household
    members: list[dict] = Field(default_factory=list)
    programs: list[Program] = Field(default_factory=list)


class BatchPredictionRequest(BaseModel):
    households: list[Household] = Field(default_factory=list)
    programs: list[Program] = Field(default_factory=list)



# ============================================================
# DISABILITY HELPER
# ============================================================
def has_illness(value) -> bool:
    if value is None:
        return False

    normalized = normalize_rule(value)

    return normalized not in {
        "",
        "none",
        "no",
        "n/a",
        "na",
        "null",
        "not specified",
    }



def has_disability(value) -> bool:
    if isinstance(value, bool):
        return value

    if value is None:
        return False

    if isinstance(value, (int, float)):
        return value != 0

    normalized = str(value).strip().lower()

    return normalized in {
        "yes",
        "true",
        "1",
        "y",
    }


# ============================================================
# ANALYTICS FILTER HELPERS
# ============================================================

# ============================================================
# ANALYTICS FILTER HELPERS
# ============================================================

def normalize(value):
    if value is None:
        return ""

    return str(value).strip()


def parse_date(value):
    """
    Convert database date/datetime/string values into date.
    """

    if value is None:
        return None

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    value = str(value).strip()

    if not value:
        return None

    # ISO datetime
    try:
        return datetime.fromisoformat(
            value.replace("Z", "+00:00")
        ).date()

    except ValueError:
        pass

    # YYYY-MM-DD
    try:
        return date.fromisoformat(value)

    except ValueError:
        return None


def filter_records(
    records,
    date_range="All Time",
    purok="All Puroks",
    start_date=None,
    end_date=None,
    date_field="created_at",
):
    """
    Filter records by Purok and date range.

    Date filtering uses an inclusive start date
    and an exclusive end date.
    """

    filtered = list(records)

    # ========================================================
    # PUROK FILTER
    # ========================================================

    if purok and purok != "All Puroks":

        selected_purok = normalize(
            purok
        ).lower()

        filtered = [
            record
            for record in filtered
            if normalize(
                record.get("purok")
            ).lower()
            == selected_purok
        ]

    # ========================================================
    # ALL TIME
    # ========================================================

    if date_range == "All Time":
        return filtered

    today = date.today()

    start = None
    end = None

    # ========================================================
    # THIS MONTH
    # ========================================================

    if date_range == "This Month":

        start = today.replace(
            day=1
        )

        if start.month == 12:

            end = date(
                start.year + 1,
                1,
                1,
            )

        else:

            end = date(
                start.year,
                start.month + 1,
                1,
            )

    # ========================================================
    # LAST MONTH
    # ========================================================

    elif date_range == "Last Month":

        current_month = today.replace(
            day=1
        )

        end = current_month

        start = (
            current_month
            - timedelta(days=1)
        ).replace(day=1)

    # ========================================================
    # THIS YEAR
    # ========================================================

    elif date_range == "This Year":

        start = date(
            today.year,
            1,
            1,
        )

        end = date(
            today.year + 1,
            1,
            1,
        )

    # ========================================================
    # CUSTOM
    # ========================================================

    elif date_range == "Custom":

        if start_date:
            start = parse_date(
                start_date
            )

        if end_date:

            parsed_end = parse_date(
                end_date
            )

            if parsed_end:
                end = (
                    parsed_end
                    + timedelta(days=1)
                )

    # ========================================================
    # INVALID / NO DATE FILTER
    # ========================================================

    if start is None and end is None:
        return filtered

    # ========================================================
    # APPLY DATE FILTER
    # ========================================================

    result = []

    for record in filtered:

        record_date = parse_date(
            record.get(date_field)
        )

        if record_date is None:
            continue

        if start and record_date < start:
            continue

        if end and record_date >= end:
            continue

        result.append(record)

    return result

# ============================================================
# ANALYTICS
# ============================================================


@app.get("/analytics")
def analytics(
    dateRange: str = Query("All Time"),
    purok: str = Query("All Puroks"),
    startDate: str | None = Query(None),
    endDate: str | None = Query(None),
):
    try:
        print("=" * 60)
        print("ANALYTICS REQUEST")
        print({
            "dateRange": dateRange,
            "purok": purok,
            "startDate": startDate,
            "endDate": endDate,
        })
        print("=" * 60)

        # Fetch household masterlist
        households = fetch_all("""
            SELECT
                household_id,
                purok,
                vulnerability,
                created_at
            FROM households
        """)

        print("TOTAL HOUSEHOLDS:", len(households))

        # Fetch validation records
        validations = fetch_all("""
            SELECT
                bv.validation_id,
                bv.household_id,
                bv.program_id,
                bv.validation_status,
                bv.submitted_at,
                bv.submitted_by,
                bv.approved_at,
                bv.approved_by,
                bv.remarks
            FROM beneficiary_validation AS bv
            ORDER BY bv.submitted_at DESC
        """)

        print("TOTAL VALIDATION RECORDS:", len(validations))

        # Fetch assistance distribution records
        distributions = fetch_all("""
            SELECT
                d.distribution_id,
                d.household_id,
                d.program_id,
                p.program_name,
                d.status,
                d.release_status,
                d.amount_released,
                d.release_date,
                d.approved_at,
                d.created_at,
                d.approved_by
            FROM ml_assistance_distribution AS d
            LEFT JOIN assistance_programs AS p
                ON p.program_id = d.program_id
            ORDER BY d.created_at DESC
        """)

        print("TOTAL DISTRIBUTION RECORDS:", len(distributions))

        # Apply date and Purok filters to households
        filtered_households = filter_records(
            households,
            date_range=dateRange,
            purok=purok,
            start_date=startDate,
            end_date=endDate,
            date_field="created_at",
        )

        # Use the filtered household IDs to scope related records
        household_ids = {
            normalize(record.get("household_id"))
            for record in filtered_households
            if normalize(record.get("household_id"))
        }

        filtered_validations = [
            record
            for record in validations
            if normalize(record.get("household_id")) in household_ids
        ]

        filtered_distributions = [
            record
            for record in distributions
            if normalize(record.get("household_id")) in household_ids
        ]

        print("FILTERED HOUSEHOLDS:", len(filtered_households))
        print("FILTERED VALIDATIONS:", len(filtered_validations))
        print("FILTERED DISTRIBUTIONS:", len(filtered_distributions))

        # Calculate dashboard analytics
        result = calculate_analytics(
            filtered_households,
            filtered_validations,
            filtered_distributions,
        )

        if not isinstance(result, dict):
            raise TypeError(
                "calculate_analytics() must return a dictionary."
            )

        result["filters"] = {
            "dateRange": dateRange,
            "purok": purok,
            "startDate": startDate,
            "endDate": endDate,
        }

        print("ANALYTICS RESULT:", {
            "total_households": result.get("total_households"),
            "approved_household_count": result.get(
                "approved_household_count"
            ),
            "rejected_count": result.get("rejected_count"),
            "approval_rate": result.get("approval_rate"),
            "coverage": result.get("coverage"),
            "highly_vulnerable": result.get("highly_vulnerable"),
        })

        return result

    except Exception as e:
        import traceback

        print("=" * 60)
        print("ANALYTICS ERROR")
        traceback.print_exc()
        print("=" * 60)

        raise HTTPException(
            status_code=500,
            detail=f"Analytics failed: {type(e).__name__}: {e}",
        ) from e



# ============================================================
# ANALYTICS CHART ENDPOINTS
# ============================================================

def get_chart_households():
    """
    Retrieve actual household-level data for charts.
    Income is calculated by summing household members'
    monthly income.
    """

    return fetch_all("""
        SELECT
            h.household_id,
            h.purok,
            h.vulnerability,
            h.created_at,
            COUNT(hm.household_id) AS member_count,
            COALESCE(
                SUM(COALESCE(hm.monthly_income, 0)),
                0
            ) AS household_monthly_income
        FROM households h
        LEFT JOIN household_members hm
            ON hm.household_id = h.household_id
        GROUP BY
            h.household_id,
            h.purok,
            h.vulnerability,
            h.created_at
        ORDER BY h.created_at DESC
    """)


def generate_chart_response(chart_function, records):
    """
    Generate a chart and return the correct image format.
    Supports PNG and SVG.
    """

    image_buffer = chart_function(records)

    if image_buffer is None:
        raise RuntimeError(
            "Chart function returned no image."
        )

    if hasattr(image_buffer, "seek"):
        image_buffer.seek(0)

    image_bytes = image_buffer.getvalue()

    if not image_bytes:
        raise RuntimeError(
            "Generated chart image is empty."
        )

    # Detect actual image format
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        media_type = "image/png"

    elif image_bytes.lstrip().startswith(b"<svg") or (
        image_bytes.lstrip().startswith(b"<?xml")
        and b"<svg" in image_bytes[:1000]
    ):
        media_type = "image/svg+xml"

    else:
        raise RuntimeError(
            "Unsupported chart image format. "
            f"First bytes: {image_bytes[:50]!r}"
        )

    return Response(
        content=image_bytes,
        media_type=media_type,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate"
        }
    )


def get_filtered_chart_records(
    dateRange="All Time",
    purok="All Puroks",
    startDate=None,
    endDate=None,
):
    records = get_chart_households()

    return filter_records(
        records,
        date_range=dateRange,
        purok=purok,
        start_date=startDate,
        end_date=endDate,
        date_field="created_at",
    )


@app.get("/analytics/charts/vulnerability")
def vulnerability_chart(
    dateRange: str = Query("All Time"),
    purok: str = Query("All Puroks"),
    startDate: str | None = Query(None),
    endDate: str | None = Query(None),
):
    try:
        records = get_filtered_chart_records(
            dateRange,
            purok,
            startDate,
            endDate,
        )

        return generate_chart_response(
            create_vulnerability_chart,
            records,
        )

    except Exception as exc:
        import traceback
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=f"Vulnerability chart failed: {type(exc).__name__}: {exc}",
        ) from exc


@app.get("/analytics/charts/income")
def income_chart(
    dateRange: str = Query("All Time"),
    purok: str = Query("All Puroks"),
    startDate: str | None = Query(None),
    endDate: str | None = Query(None),
):
    try:
        records = get_filtered_chart_records(
            dateRange,
            purok,
            startDate,
            endDate,
        )

        return generate_chart_response(
            create_income_chart,
            records,
        )

    except Exception as exc:
        import traceback
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=f"Income chart failed: {type(exc).__name__}: {exc}",
        ) from exc


@app.get("/analytics/charts/relationships")
def relationships_chart(
    dateRange: str = Query("All Time"),
    purok: str = Query("All Puroks"),
    startDate: str | None = Query(None),
    endDate: str | None = Query(None),
):
    try:
        records = get_filtered_chart_records(
            dateRange,
            purok,
            startDate,
            endDate,
        )

        return generate_chart_response(
            create_feature_relationship_chart,
            records,
        )

    except Exception as exc:
        import traceback
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=f"Relationships chart failed: {type(exc).__name__}: {exc}",
        ) from exc


# ============================================================
# PROGRAM MATCHING
# ============================================================


def normalize_rule(value: str | None) -> str:
    if not value:
        return ""

    return " ".join(str(value).strip().lower().split())



def match_programs(
    household: Household,
    vulnerability: str,
    programs: list[Program],
) -> list[dict]:

    matched_programs = []

    income = household.monthly_income

    family_size = (
        household.family_size
        if household.family_size is not None
        else household.family_number
    )

    disability = household.provisional_disability_indicator
    senior = household.senior_citizen_present

    normalized_vulnerability = normalize_rule(vulnerability)

    for program in programs:

        raw_rules = program.eligibility_rules

        if not raw_rules:
            continue

        # Read structured JSON rules or an existing dictionary.
        if isinstance(raw_rules, dict):
            rules = raw_rules

        else:
            try:
                rules = json.loads(raw_rules)

                if not isinstance(rules, dict):
                    continue

            except (json.JSONDecodeError, TypeError):

                # Backward compatibility for old comma-separated rules.
                legacy = [
                    normalize_rule(item)
                    for item in str(raw_rules).split(",")
                    if item.strip()
                ]

                rules = {
                    "vulnerability_levels": [
                        item.title()
                        for item in legacy
                        if item in [
                            "highly vulnerable",
                            "moderately vulnerable",
                            "low vulnerable",
                        ]
                    ],
                    "household_conditions": [],
                    "monthly_income_max": None,
                }

                if "senior citizen" in legacy:
                    rules["household_conditions"].append(
                        "senior_citizen"
                    )

                if "person with disability" in legacy:
                    rules["household_conditions"].append(
                        "person_with_disability"
                    )

                if "family size >= 6" in legacy:
                    rules["household_conditions"].append(
                        "family_size_gte_6"
                    )

                if "family size >= 5" in legacy:
                    rules["household_conditions"].append(
                        "family_size_gte_5"
                    )

                for item in legacy:
                    if item.startswith("monthly income <="):
                        try:
                            rules["monthly_income_max"] = float(
                                item.split("<=", 1)[1].strip()
                            )
                        except ValueError:
                            pass

        # VULNERABILITY GROUP
        vulnerability_levels = rules.get(
            "vulnerability_levels", []
        )

        vulnerability_match = (
            not vulnerability_levels
            or normalized_vulnerability in [
                normalize_rule(level)
                for level in vulnerability_levels
            ]
        )

        # HOUSEHOLD CONDITIONS GROUP
        conditions = rules.get(
            "household_conditions", []
        )

        condition_results = []

        for condition in conditions:

            condition = normalize_rule(condition)

            if condition == "senior_citizen":
                condition_results.append(senior is True)

            elif condition == "person_with_disability":
                condition_results.append(disability is True)

            elif condition == "family_size_gte_6":
                condition_results.append(
                    family_size is not None and family_size >= 6
                )

            elif condition == "family_size_gte_5":
                condition_results.append(
                    family_size is not None and family_size >= 5
                )

            else:
                # Unknown conditions must not qualify.
                condition_results.append(False)

        household_match = (
            not conditions or any(condition_results)
        )

        # MONTHLY INCOME GROUP
        income_limit = rules.get("monthly_income_max")

        income_match = (
            income_limit is None
            or (
                income is not None
                and income <= float(income_limit)
            )
        )

        # ALL CONFIGURED GROUPS MUST MATCH
        eligible = (
            vulnerability_match
            and household_match
            and income_match
        )

        if eligible:
            matched_programs.append({
                "program_id": program.program_id,
                "program_name": program.program_name,
                "description": program.description,
                "eligibility_rules": raw_rules,
            })

    return matched_programs

# ============================================================
# COLAB RANDOM FOREST PREDICTION
# ============================================================

def display_vulnerability(label: str) -> str:
    """
    Convert the Random Forest model class into
    the application's displayed vulnerability label.
    """

    mapping = {
        "High": "Highly Vulnerable",
        "Medium": "Moderately Vulnerable",
        "Low": "Low Vulnerable",
    }

    normalized_label = str(label).strip()

    if normalized_label not in mapping:
        raise ValueError(
            f"Unknown Random Forest vulnerability class: {normalized_label}"
        )

    return mapping[normalized_label]
 


def predict_one(
    row: Household,
    programs: list[Program] | None = None,
    members: list[dict] | None = None,
):
    ensure_model_loaded()

    programs = programs or []
    members = members or []

    # IDENTIFY HOUSEHOLD COMPOSITION
    family_position = normalize_rule(row.family_position)

    is_solo = (
        family_position == "solo"
        or row.family_number == 1
        or row.family_size == 1
    )

    if is_solo and not members:

        # SOLO HOUSEHOLD
        member_count = 1
        family_size = 1
        household_income = row.monthly_income

        all_unemployed = (
            normalize_rule(row.occupation) == "unemployed"
        )

        disability = has_disability(row.disability_present)
        illness = has_illness(row.leading_illnesses)

        senior_citizen = (
            row.age is not None and row.age >= 60
        )

        composition = "Solo household"

    elif members:

        # HOUSEHOLD RECORD + ADDITIONAL MEMBER RECORDS
        member_count = len(members) + 1
        family_size = member_count

        # TOTAL HOUSEHOLD MONTHLY INCOME
        household_income = (
            float(row.monthly_income or 0)
            + sum(
                float(member.get("monthly_income") or 0)
                for member in members
            )
        )

        # ALL MEMBERS MUST BE EXPLICITLY UNEMPLOYED
        all_unemployed = (
            normalize_rule(row.occupation) == "unemployed"
            and all(
                normalize_rule(member.get("occupation")) == "unemployed"
                for member in members
            )
        )

        # DISABILITY CHECK
        disability = (
            has_disability(row.disability_present)
            or any(
                has_disability(member.get("disability_present"))
                for member in members
            )
        )

        # ILLNESS CHECK
        illness = (
            has_illness(row.leading_illnesses)
            or any(
                has_illness(member.get("leading_illnesses"))
                for member in members
            )
        )

        # SENIOR CITIZEN CHECK
        def is_senior(member):
            member_age = member.get("age")

            if member_age is not None:
                try:
                    return int(member_age) >= 60
                except (ValueError, TypeError):
                    return False

            birthday = member.get("birthday")

            if birthday:
                try:
                    birth_date = datetime.fromisoformat(
                        str(birthday).replace("Z", "+00:00")
                    ).date()

                    today = date.today()

                    age = (
                        today.year
                        - birth_date.year
                        - (
                            (today.month, today.day)
                            < (birth_date.month, birth_date.day)
                        )
                    )

                    return age >= 60

                except (ValueError, TypeError):
                    return False

            return False

        senior_citizen = (
            (row.age is not None and row.age >= 60)
            or any(is_senior(member) for member in members)
        )

        composition = "Household with member records"

    else:

        raise HTTPException(
            status_code=422,
            detail=(
                "Household member records are missing. "
                "Only a confirmed solo household can be "
                "processed without separate member records."
            ),
        )

    # HEAD EDUCATION
    head_education = (
        row.head_education
        or row.highest_education
    )

    if not head_education:
        raise HTTPException(
            status_code=422,
            detail="Household head education is missing.",
        )

    # BUILD RANDOM FOREST INPUT
    input_df = pd.DataFrame([{
        "member_count": member_count,
        "head_education": head_education,
        "household_monthly_income": household_income,
        "family_size": family_size,
        "all_members_explicitly_unemployed": all_unemployed,
        "provisional_disability_indicator": disability,
        "illness_indicator": illness,
    }], columns=_feature_names)

    # RANDOM FOREST PREDICTION
    prediction = _model.predict(input_df)[0]
    probabilities = _model.predict_proba(input_df)[0]
    classes = _model.classes_

    probability_result = {
        str(label): round(float(prob), 4)
        for label, prob in zip(classes, probabilities)
    }

    rf_label = str(prediction)
    rf_vulnerability = display_vulnerability(rf_label)

    rf_probability = round(
        float(max(probabilities)),
        4,
    )

    vulnerability = rf_vulnerability
    classification_source = "Random Forest"

    # EXISTING INCOME CLASSIFICATION
    if household_income is not None:

        if household_income < 10000:
            vulnerability = "Highly Vulnerable"
            classification_source = "Income-based rule"

        elif 10000 <= household_income <= 24000:
            vulnerability = "Moderately Vulnerable"
            classification_source = "Income-based rule"

        elif household_income >= 25000:
            vulnerability = "Low Vulnerable"
            classification_source = "Income-based rule"

       # PREPARE HOUSEHOLD DATA FOR PROGRAM MATCHING

    updates = {
        "monthly_income": household_income,
        "family_size": family_size,
        "member_count": member_count,
        "provisional_disability_indicator": disability,
        "illness_indicator": illness,
        "senior_citizen_present": senior_citizen,
    }

    if hasattr(row, "model_copy"):
        matching_household = row.model_copy(update=updates)
    else:
        matching_household = row.copy(update=updates)

    suggested_programs = match_programs(
        matching_household,
        vulnerability,
        programs,
    )

    # RESPONSE
    return {
        "vulnerability": vulnerability,
        "vulnerability_prob": rf_probability,

        "rf_vulnerability": rf_vulnerability,
        "rf_vulnerability_prob": rf_probability,

        "classification_source": classification_source,

        "household_composition": composition,
        "member_count": member_count,
        "family_size": family_size,
        "household_monthly_income": household_income,

        "program_eligible": (
            True if suggested_programs else None
        ),

        "suggested_programs": suggested_programs,
        "probabilities": probability_result,
    }

# ============================================================
# ROOT
# ============================================================
@app.get("/")
def root():
    return {
        "service": "Barangay Luinab ML Service",
        "status": "running",
        "model_loaded": _model is not None,
        "classes": _classes,
        "features": _feature_names,
        "endpoints": [
            "/",
            "/health",
            "/analytics",
            "/analytics/charts/vulnerability",
            "/analytics/charts/income",
            "/analytics/charts/relationships",
            "/predict",
            "/predict-batch",
            "/retrain",
        ],
    }

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": _model is not None,
        "classes": _classes,
        "features": _feature_names,
        "model_error": _model_load_error,
        "model_path": str(MODEL_PATH),
        "model_file_exists": MODEL_PATH.is_file(),
    }




# ============================================================
# SINGLE PREDICTION
# ============================================================

@app.post("/predict")
def predict(request: PredictionRequest):
    try:
        print("[ML] Household composition:", request.household.family_position)
        print("[ML] Members received:", len(request.members))

        result = predict_one(
            request.household,
            request.programs,
            request.members,
        )

        print("[ML] Prediction:", result["vulnerability"])
        print("[ML] Household composition:", result["household_composition"])
        print("[ML] Suggested programs:", result["suggested_programs"])

        return result

    except HTTPException:
        raise

    except Exception as exc:
        import traceback
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {type(exc).__name__}: {exc}",
        ) from exc

# ============================================================
# BATCH PREDICTION
# ============================================================
# ============================================================
# BATCH PREDICTION
# ============================================================

@app.post("/predict-batch")
def predict_batch(request: BatchPredictionRequest):

    try:

        results = [
            predict_one(
                household,
                request.programs,
            )
            for household in request.households
        ]

        return {
            "results": results
        }

    except HTTPException:
        raise

    except Exception as exc:

        import traceback
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=f"Batch prediction failed: {type(exc).__name__}: {exc}",
        ) from exc
# ============================================================
# RETRAIN
# ============================================================


@app.post("/retrain")
def retrain():
    raise HTTPException(
        status_code=501,
        detail=(
            "Retraining is disabled. Train the model in Google Colab "
            "using the approved household dataset, export the pipeline, "
            "and deploy the updated model artifact."
        ),
    )
