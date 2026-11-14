
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
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Type", "Content-Disposition"],
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
    household_monthly_income: float | None = None

    income_proof_images: list[str] | str | None = None

    family_number: int | None = None
    family_position: str | None = None

    age: int | None = None
    length_residency: int | None = None

    sex: str | None = None
    civil_status: str | None = None
    highest_education: str | None = None
    occupation: str | None = None
    residence: str | None = None

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
    Retrieve actual household-level data for analytics charts.

    The households record represents one person.
    household_members contains the additional members.
    Household income is the sum of all members' monthly income.
    """

    return fetch_all("""
        SELECT
            h.household_id,
            h.purok,
            h.vulnerability,
            h.created_at,

            -- Household record + additional members
            COUNT(hm.household_id) + 1 AS member_count,

            -- Total household size
            COUNT(hm.household_id) + 1 AS family_size,

            -- Include the household record's income
            -- and the additional members' income
            (
                COALESCE(h.monthly_income, 0)
                +
                COALESCE(
                    SUM(COALESCE(hm.monthly_income, 0)),
                    0
                )
            ) AS household_monthly_income

        FROM households h

        LEFT JOIN household_members hm
            ON hm.household_id = h.household_id

        GROUP BY
            h.household_id,
            h.purok,
            h.vulnerability,
            h.created_at,
            h.monthly_income

        ORDER BY h.created_at DESC
    """)



def generate_chart_response(chart_function, records):
    image_buffer = chart_function(records)

    if image_buffer is None:
        raise RuntimeError("Chart function returned no image.")

    image_buffer.seek(0)
    image_bytes = image_buffer.getvalue()

    if not image_bytes:
        raise RuntimeError("Generated chart image is empty.")

    if b"<svg" not in image_bytes[:1000]:
        raise RuntimeError("Chart did not generate a valid SVG image.")

    return Response(
        content=image_bytes,
        media_type="image/svg+xml",
        headers={
            "Cache-Control": "public, max-age=300",
            "Cross-Origin-Resource-Policy": "cross-origin",
        },
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
        print("[RELATIONSHIPS] 1. Request received", flush=True)

        records = get_filtered_chart_records(
            dateRange,
            purok,
            startDate,
            endDate,
        )

        print(
            f"[RELATIONSHIPS] 2. Records fetched: {len(records)}",
            flush=True,
        )

        print("[RELATIONSHIPS] 3. Starting SVG generation", flush=True)

        response = generate_chart_response(
            create_feature_relationship_chart,
            records,
        )

        print("[RELATIONSHIPS] 4. SVG generated successfully", flush=True)

        return response

    except Exception as exc:
        import traceback

        print("[RELATIONSHIPS] ERROR:", repr(exc), flush=True)
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=f"Relationships chart failed: {type(exc).__name__}: {exc}",
        ) from exc


def has_income_proof(value) -> bool:
    if value is None:
        return False

    if isinstance(value, list):
        return any(
            str(item).strip()
            for item in value
            if item is not None
        )

    if isinstance(value, dict):
        return bool(value)

    if isinstance(value, str):
        value = value.strip()

        if not value:
            return False

        try:
            parsed = json.loads(value)

            if isinstance(parsed, list):
                return has_income_proof(parsed)

            if isinstance(parsed, dict):
                return bool(parsed)

            return bool(parsed)

        except (json.JSONDecodeError, TypeError):
            return value.lower() not in {
                "null",
                "none",
                "[]",
                "{}",
                "false",
            }

    return False

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

        # Income proof is required before suggesting assistance.
    proof_available = has_income_proof(
        household.income_proof_images
    )

    if not proof_available:
        print(
            "[PROGRAM MATCHING] No income proof uploaded. "
            "Vulnerability classification is retained, "
            "but assistance suggestions are disabled."
        )
        return []

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
                            "high vulnerable",
                            "moderate vulnerable",
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
            elif condition == "family_size_gte_4":
                condition_results.append(
                    family_size is not None and family_size >= 4
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
        "High": "High Vulnerable",
        "Medium": "Moderate Vulnerable",
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

    # ========================================================
    # HOUSEHOLD COMPOSITION
    # ========================================================

    family_position = normalize_rule(row.family_position)

    is_solo = (
        family_position == "solo"
        or row.family_number == 1
        or row.family_size == 1
    )

    if members:
        member_count = len(members) + 1
        family_size = member_count
        composition = "Household with member records"

    elif is_solo:
        member_count = 1
        family_size = 1
        composition = "Solo household"

    else:
        raise HTTPException(
            status_code=422,
            detail=(
                "Household member records are missing. "
                "Only a confirmed solo household can be "
                "processed without separate member records."
            ),
        )

    # ========================================================
    # HOUSEHOLD MONTHLY INCOME
    # ========================================================

    if row.household_monthly_income is not None:

        household_income = float(
            row.household_monthly_income
        )

    else:

        individual_incomes = [
            row.monthly_income,
            *[
                member.get("monthly_income")
                for member in members
            ],
        ]

        # Do not silently convert missing income into zero.
        if any(
            value is None or value == ""
            for value in individual_incomes
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Complete monthly income records are required "
                    "to calculate household monthly income."
                ),
            )

        try:
            household_income = sum(
                float(value)
                for value in individual_incomes
            )
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=422,
                detail="Invalid household monthly income.",
            )

    # ========================================================
    # ALL MEMBERS EXPLICITLY UNEMPLOYED
    # ========================================================

    occupations = [
        row.occupation,
        *[
            member.get("occupation")
            for member in members
        ],
    ]

    all_unemployed = all(
        normalize_rule(occupation) in {
            "unemployed",
            "not employed",
            "currently unemployed",
        }
        for occupation in occupations
    )

    # ========================================================
    # DISABILITY
    # ========================================================

    disability = (
        has_disability(row.disability_present)
        or any(
            has_disability(
                member.get("disability_present")
            )
            for member in members
        )
    )

    # ========================================================
    # ILLNESS
    # ========================================================

    illness = (
        has_illness(row.leading_illnesses)
        or any(
            has_illness(member.get("leading_illnesses"))
            for member in members
        )
    )

    # ========================================================
    # SENIOR CITIZEN
    # ========================================================

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

    # ========================================================
    # HOUSEHOLD HEAD EDUCATION
    # ========================================================

    head_education = (
        row.head_education
        or row.highest_education
    )

    if not head_education:
        raise HTTPException(
            status_code=422,
            detail="Household head education is missing.",
        )

    # ========================================================
    # RANDOM FOREST INPUT
    # ========================================================

    input_df = pd.DataFrame(
        [{
            "member_count": member_count,
            "head_education": head_education,
            "household_monthly_income": household_income,
            "family_size": family_size,
            "all_members_explicitly_unemployed": all_unemployed,
            "provisional_disability_indicator": disability,
            "illness_indicator": illness,
        }],
        columns=_feature_names,
    )

    print("[ML] RANDOM FOREST INPUT:")
    print(input_df.to_dict(orient="records"))

   
    # ========================================================
    # RANDOM FOREST PREDICTION
    # ========================================================

    # Keep Random Forest prediction for reference.
    rf_prediction = str(_model.predict(input_df)[0])
    probabilities = _model.predict_proba(input_df)[0]
    classes = _model.classes_

    rf_vulnerability = display_vulnerability(rf_prediction)
    rf_probability = round(float(max(probabilities)), 4)

    probability_result = {
        str(label): round(float(prob), 4)
        for label, prob in zip(classes, probabilities)
    }

    # ========================================================
    # FINAL VULNERABILITY CLASSIFICATION BASED ON INCOME
    # ========================================================

    if household_income <= 10999:
        vulnerability = "High Vulnerable"

    elif household_income <= 24999:
        vulnerability = "Moderate Vulnerable"

    else:
        vulnerability = "Low Vulnerable"

    classification_source = "Household Income Classification"

    # ========================================================
    # PREPARE HOUSEHOLD FOR PROGRAM MATCHING
    # ========================================================

    updates = {
        "monthly_income": household_income,
        "household_monthly_income": household_income,
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

    # ========================================================
    # ASSISTANCE PROGRAM MATCHING
    # ========================================================

    suggested_programs = match_programs(
        matching_household,
        vulnerability,
        programs,
    )

    # ========================================================
    # RESPONSE
    # ========================================================

    return {
        "vulnerability": vulnerability,
        "vulnerability_prob": None,
        "rf_vulnerability": rf_vulnerability,
        "rf_vulnerability_prob": rf_probability,
        "classification_source": classification_source,
        "household_composition": composition,
        "member_count": member_count,
        "family_size": family_size,
        "household_monthly_income": household_income,
        "program_eligible": True if suggested_programs else None,
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
