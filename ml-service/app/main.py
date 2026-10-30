
import os
import sys
import io
from pathlib import Path
from datetime import date, datetime, timedelta

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from joblib import load
from pydantic import BaseModel, Field

load_dotenv()

APP_DIR = Path(__file__).resolve().parent
BASE = APP_DIR.parent

# Make modules inside the app directory importable.
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from analytics_visualizations import (
    create_vulnerability_chart,
    create_income_chart,
    create_feature_relationship_chart,
    create_model_performance_chart,
    get_model_classification_report,
)

from database import fetch_all
from analytics import calculate_analytics

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


VERCEL_ORIGINS = [
    "https://capstone2-barangay-j5ni.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=VERCEL_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    # Original household fields
    monthly_income: float | None = None
    family_number: int | None = None
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

    # Seven Random Forest features
    member_count: int | None = None
    family_size: int | None = None
    head_education: str | None = None

    all_members_explicitly_unemployed: bool | None = None
    provisional_disability_indicator: bool | None = None
    illness_indicator: bool | None = None


class Program(BaseModel):
    program_id: str
    program_name: str
    description: str | None = None
    eligibility_rules: str | None = None


class PredictionRequest(BaseModel):
    household: Household
    programs: list[Program] = Field(default_factory=list)


class BatchPredictionRequest(BaseModel):
    households: list[Household] = Field(default_factory=list)
    programs: list[Program] = Field(default_factory=list)



# ============================================================
# DISABILITY HELPER
# ============================================================


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

# ============================================================
# ANALYTICS
# ============================================================


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
# PROGRAM MATCHING
# ============================================================

def match_programs(
    household: Household,
    vulnerability: str,
    programs: list[Program],
) -> list[str]:
    """
    Program recommendations are disabled until official,
    approved eligibility rules are available.

    Random Forest vulnerability predictions do not independently
    establish assistance-program eligibility.
    """
    return []


 # ============================================================
# COLAB RANDOM FOREST PREDICTION
# ============================================================

def display_vulnerability(label: str) -> str:
    mapping = {
        "High": "Highly Vulnerable",
        "Medium": "Moderately Vulnerable",
        "Low": "Low Vulnerable",
    }

    return mapping.get(label, label)

def predict_one(row: Household):
    global _model, _feature_names

    if _model is None:
        raise HTTPException(
            status_code=503,
            detail="ML model is not loaded."
        )

    # Validate required information.
    if row.member_count is None or row.member_count <= 0:
        raise HTTPException(
            status_code=422,
            detail="Prediction requires at least one recorded household member."
        )

    if row.head_education is None:
        raise HTTPException(
            status_code=422,
            detail="Household head education is missing."
        )

    if row.monthly_income is None:
        raise HTTPException(
            status_code=422,
            detail="Household monthly income is missing."
        )

    if row.family_size is None or row.family_size <= 0:
        raise HTTPException(
            status_code=422,
            detail="Valid household family size is required."
        )

    # Use the exact seven features and their trained order.
    model_input = pd.DataFrame([{
        "member_count": row.member_count,
        "head_education": row.head_education,
        "household_monthly_income": row.monthly_income,
        "family_size": row.family_size,
        "all_members_explicitly_unemployed":
            row.all_members_explicitly_unemployed,
        "provisional_disability_indicator":
            row.provisional_disability_indicator,
        "illness_indicator": row.illness_indicator,
    }])

    model_input = model_input[_feature_names]

    try:
        prediction = _model.predict(model_input)[0]
        probabilities = _model.predict_proba(model_input)[0]

        classes = _model.classes_

        probability_result = {
            str(label): round(float(probability), 4)
            for label, probability in zip(classes, probabilities)
        }

        vulnerability = display_vulnerability(prediction)

        return {
            "vulnerability": vulnerability,
            "vulnerability_prob": round(
                float(max(probabilities)), 4
            ),
            "program_eligible": None,
            "suggested_programs": [],
            "probabilities": probability_result,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(exc)}"
        )
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

def get_chart_households(
    dateRange="All Time",
    purok="All Puroks",
    startDate=None,
    endDate=None,
):
    records = fetch_all("""
    SELECT
        household_id,
        purok,
        vulnerability,
        monthly_income,
        family_number,
        age,
        length_residency,
        created_at
    FROM households
""")

    return filter_records(
        records,
        date_range=dateRange,
        purok=purok,
        start_date=startDate,
        end_date=endDate,
        date_field="created_at",
    )



@app.get("/analytics/charts/vulnerability")
def get_vulnerability_chart(
    dateRange: str = Query("All Time"),
    purok: str = Query("All Puroks"),
    startDate: str | None = Query(None),
    endDate: str | None = Query(None),
):
    try:
        records = get_chart_households(
            dateRange, purok, startDate, endDate
        )

        df = pd.DataFrame(records)

        if "vulnerability" not in df.columns:
            raise ValueError(
                "The household query did not return vulnerability."
            )

        image = create_vulnerability_chart(df)

        return StreamingResponse(
            image,
            media_type="image/png",
        )

    except Exception as exc:
        import traceback
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=(
                f"Vulnerability chart failed: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc




@app.get("/analytics/charts/income")
def get_income_chart(
    dateRange: str = Query("All Time"),
    purok: str = Query("All Puroks"),
    startDate: str | None = Query(None),
    endDate: str | None = Query(None),
):
    try:
        records = get_chart_households(
            dateRange, purok, startDate, endDate
        )

        print("Income chart: fetched records =", len(records))
        print(
            "Income chart: sample record =",
            records[0] if records else "No records"
        )

        df = pd.DataFrame(records)

        print("Income chart: columns =", df.columns.tolist())

        if "monthly_income" not in df.columns:
            raise ValueError(
                "The household query did not return monthly_income."
            )

        image = create_income_chart(df)

        return StreamingResponse(
            image,
            media_type="image/png",
        )

    except Exception as exc:
        import traceback
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=f"Income chart failed: {type(exc).__name__}: {exc}",
        )


@app.get("/analytics/charts/relationships")
def get_relationship_chart(
    dateRange: str = Query("All Time"),
    purok: str = Query("All Puroks"),
    startDate: str | None = Query(None),
    endDate: str | None = Query(None),
):
    try:
        records = get_chart_households(
            dateRange, purok, startDate, endDate
        )

        image = create_feature_relationship_chart(
            pd.DataFrame(records)
        )

        return StreamingResponse(image, media_type="image/png")

    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Relationship chart failed: {exc}",
        )


# ============================================================
# SINGLE PREDICTION
# ============================================================


@app.post("/predict")
def predict(request: PredictionRequest):
    try:
        print("[ML] Programs received:", len(request.programs))
        print(
            "[ML] Program names:",
            [p.program_name for p in request.programs],
        )

        result = predict_one(
            request.household,
            request.programs,
        )

        print("[ML] Prediction:", result["vulnerability"])
        print(
            "[ML] Suggested programs:",
            result["suggested_programs"],
        )

        return result

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

@app.post("/predict-batch")
def predict_batch(
    request: BatchPredictionRequest
):

    try:

        results = [

            predict_one(
                household,
                request.programs,
            )

            for household
            in request.households

        ]

        return {
            "results": results
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Batch prediction failed: {e}",
        )



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
