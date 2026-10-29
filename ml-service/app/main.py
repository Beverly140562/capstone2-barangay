
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
    "https://capstone2-barangay-j5ni-oojmui41f-beverlys-projects-fb926395.vercel.app",
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


def load_model():
    global _model, _classes, _feature_names

    if not MODEL_PATH.exists():
        raise RuntimeError(
            f"Trained Colab model not found: {MODEL_PATH}"
        )

    payload = load(MODEL_PATH)

    if not isinstance(payload, dict) or "model" not in payload:
        raise RuntimeError(
            "Invalid model artifact. Expected a dictionary "
            "containing the trained pipeline under 'model'."
        )

    candidate_model = payload["model"]
    candidate_features = payload.get("feature_names", [])

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
            "Model feature names do not match the expected "
            f"Colab features. Found: {candidate_features}"
        )

    if not hasattr(candidate_model, "predict_proba"):
        raise RuntimeError(
            "Loaded model does not support predict_proba()."
        )

    _model = candidate_model
    _classes = list(candidate_model.classes_)
    _feature_names = candidate_features

    print("Colab-trained model loaded successfully.")
    print("Model path:", MODEL_PATH)
    print("Features:", _feature_names)
    print("Classes:", _classes)

    return True


def ensure_model_loaded():
    if _model is None:
        load_model()


# ============================================================
# TRY LOADING MODEL WHEN SERVER STARTS
# ============================================================

try:
    load_model()

except Exception as e:
    print(
        f"WARNING: Could not load model: {e}"
    )


# ============================================================
# DATA MODELS
# ============================================================

class Program(BaseModel):

    program_id: str

    program_name: str

    description: str | None = None

    eligibility_rules: str | None = None



class Household(BaseModel):
    # Existing system fields
    monthly_income: float = 0
    family_number: int = 1
    age: int = 0
    length_residency: int = 0

    sex: str = "male"
    civil_status: str = "Single"
    highest_education: str = "None"
    occupation: str = "None"
    residence: str = "Owned"
    disability_present: bool = False

    # Fields expected by the Colab model
    member_count: int | None = None
    family_size: int | None = None
    head_education: str | None = None

    all_members_explicitly_unemployed: bool | None = None
    provisional_disability_indicator: bool | None = None
    illness_indicator: bool | None = None



class PredictionRequest(BaseModel):

    household: Household

    programs: list[Program] = Field(
        default_factory=list
    )


class BatchPredictionRequest(BaseModel):

    households: list[Household] = Field(
        default_factory=list
    )

    programs: list[Program] = Field(
        default_factory=list
    )


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
    Match a household with assistance programs.

    IMPORTANT:
    Households with monthly income of ₱25,000 or higher
    are NOT eligible for any assistance program.

    This rule is checked BEFORE all other program rules.
    """

    # ========================================================
    # INCOME ELIGIBILITY CHECK
    # ========================================================

    if household.monthly_income >= 25000:

        print(
            "PROGRAM MATCHING: NOT ELIGIBLE"
        )

        print(
            f"Income: ₱{household.monthly_income:,.2f}"
        )

        print(
            "Reason: Monthly income is ₱25,000 or higher."
        )

        return []

    # ========================================================
    # INITIALIZE
    # ========================================================

    matched = []

    vulnerability_text = (
        str(vulnerability)
        .strip()
        .lower()
    )

    # ========================================================
    # CHECK EACH PROGRAM
    # ========================================================

    for program in programs:

        rules = (
            program.eligibility_rules
            or ""
        ).strip().lower()

        print(
            f"PROGRAM CHECK: "
            f"{program.program_name} | "
            f"RULES: {rules} | "
            f"VULNERABILITY: {vulnerability} | "
            f"INCOME: {household.monthly_income} | "
            f"AGE: {household.age} | "
            f"FAMILY: {household.family_number} | "
            f"DISABILITY: {household.disability_present}"
        )

        # No eligibility rules
        if not rules:
            continue

        matched_program = False

        # ====================================================
        # 1. HIGHLY VULNERABLE
        # ====================================================

        if vulnerability_text == "highly vulnerable":

            if (
                "highly vulnerable" in rules
                or "high vulnerability" in rules
                or "high risk" in rules
            ):
                matched_program = True

        # ====================================================
        # 2. MODERATELY VULNERABLE
        # ====================================================

        if (
            not matched_program
            and vulnerability_text
            == "moderately vulnerable"
        ):

            if (
                "moderately vulnerable" in rules
                or "moderate vulnerability" in rules
                or "moderate risk" in rules
            ):
                matched_program = True

        # ====================================================
        # 3. LOW / NOT VULNERABLE
        # ====================================================

        if (
            not matched_program
            and vulnerability_text in (
                "low vulnerable",
                "low",
                "not vulnerable",
            )
        ):

            if (
                "low vulnerable" in rules
                or "low vulnerability" in rules
                or "low risk" in rules
                or "not vulnerable" in rules
            ):
                matched_program = True

        # ====================================================
        # 4. SENIOR CITIZEN
        # ====================================================

        if not matched_program:

            if household.age >= 60:

                if (
                    "senior citizen" in rules
                    or "senior citizens" in rules
                    or "senior" in rules
                    or "elderly" in rules
                    or "age >= 60" in rules
                    or "age 60" in rules
                    or "60 years old" in rules
                    or "60+" in rules
                ):
                    matched_program = True 

        # ====================================================
        # 5. PERSON WITH DISABILITY
        # ====================================================

        if not matched_program:

            if has_disability(
                household.disability_present
            ):

                if (
                    "disabled member" in rules
                    or "person with disability" in rules
                    or "persons with disability" in rules
                    or "disability" in rules
                    or "pwd" in rules
                ):
                    matched_program = True

        # ====================================================
        # 6. FAMILY SIZE >= 6
        # ====================================================

        if not matched_program:

            if household.family_number >= 6:

                if (
                    "family size >= 6" in rules
                    or "family_number >= 6" in rules
                    or "6 or more family members" in rules
                    or "6 or more members" in rules
                    or "large family" in rules
                    or "large families" in rules
                ):
                    matched_program = True

        # ====================================================
        # 7. FAMILY SIZE >= 5
        # ====================================================

        if not matched_program:

            if household.family_number >= 5:

                if (
                    "family size >= 5" in rules
                    or "family_number >= 5" in rules
                    or "5 or more family members" in rules
                    or "5 or more members" in rules
                ):
                    matched_program = True

        # ====================================================
        # 8. INCOME <= 5000
        # ====================================================

        if not matched_program:

            if household.monthly_income <= 5000:

                if (
                    "monthly_income <= 5000" in rules
                    or "income <= 5000" in rules
                    or "income below 5000" in rules
                    or "income below ₱5000" in rules
                    or "income up to 5000" in rules
                    or "5000 or below" in rules
                ):
                    matched_program = True

        # ====================================================
        # 9. INCOME <= 8000
        # ====================================================

        if not matched_program:

            if household.monthly_income <= 8000:

                if (
                    "monthly income below 8,000" in rules
                    or "monthly income below 8000" in rules
                    or "income below 8,000" in rules
                    or "income below 8000" in rules
                    or "income <= 8000" in rules
                    or "monthly_income <= 8000" in rules
                    or "8000 or below" in rules
                ):
                    matched_program = True

        # ====================================================
        # 10. INCOME <= 10000
        # ====================================================

        if not matched_program:

            if household.monthly_income <= 10000:

                if (
                    "monthly_income <= 10000" in rules
                    or "income <= 10000" in rules
                    or "income below 10000" in rules
                    or "income below ₱10000" in rules
                    or "income up to 10000" in rules
                    or "10000 or below" in rules
                ):
                    matched_program = True

        # ====================================================
        # 11. INCOME <= 12000
        # ====================================================

        if not matched_program:

            if household.monthly_income <= 12000:

                if (
                    "monthly_income <= 12000" in rules
                    or "income <= 12000" in rules
                    or "income below 12000" in rules
                    or "income below ₱12000" in rules
                    or "income up to 12000" in rules
                    or "12000 or below" in rules
                ):
                    matched_program = True

        # ====================================================
        # 12. LOW INCOME
        # ====================================================

        if not matched_program:

            if household.monthly_income <= 12000:

                if (
                    "low income" in rules
                    or "low-income" in rules
                    or "low income household" in rules
                    or "low income households" in rules
                ):
                    matched_program = True

        # ====================================================
        # ADD MATCHED PROGRAM
        # ====================================================

        if matched_program:

            matched.append(
                program.program_name
            )

    return matched



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


def predict_one(
    row: Household,
    programs: list[Program],
) -> dict:

    ensure_model_loaded()

    # Use explicit model fields when supplied.
    # Otherwise, fall back only where a reasonable mapping exists.
    member_count = (
        row.member_count
        if row.member_count is not None
        else row.family_number
    )

    family_size = (
        row.family_size
        if row.family_size is not None
        else row.family_number
    )

    education = (
        row.head_education
        if row.head_education is not None
        else row.highest_education
    )

    disability = (
        row.provisional_disability_indicator
        if row.provisional_disability_indicator is not None
        else row.disability_present
    )

    # Unknown illness status stays missing so the saved pipeline's
    # imputer can handle it. Do not assume illness is absent.
    illness = row.illness_indicator

    # The current household form stores the head's occupation,
    # not the employment status of every household member.
    # Do not infer that all members are unemployed from that field.
    all_unemployed = row.all_members_explicitly_unemployed

    def yes_no(value):
        if value is None:
            return None

        return "Yes" if has_disability(value) else "No"

    # These names and data types must match the Colab pipeline.
    model_input = pd.DataFrame([{
        "member_count": member_count,
        "head_education": education,
        "household_monthly_income": row.monthly_income,
        "family_size": family_size,
        "all_members_explicitly_unemployed": yes_no(all_unemployed),
        "provisional_disability_indicator": yes_no(disability),
        "illness_indicator": yes_no(illness),
    }], columns=_feature_names)

    # Predict vulnerability using the saved Colab pipeline.
    raw_prediction = str(_model.predict(model_input)[0])

    vulnerability = display_vulnerability(raw_prediction)

    raw_probabilities = _model.predict_proba(model_input)[0]

    probabilities = {
        display_vulnerability(str(class_name)): round(
            float(probability), 4
        )
        for class_name, probability in zip(
            _classes,
            raw_probabilities,
        )
    }

    confidence = probabilities.get(vulnerability, 0.0)

    # Existing program-matching function
    suggested_programs = match_programs(
        row,
        vulnerability,
        programs,
    )

    # This is your current income rule, not an official eligibility
    # determination by the ML model.
    program_eligible = row.monthly_income < 25000

    return {
        "vulnerability": vulnerability,
        "vulnerability_prob": round(float(confidence), 4),
        "program_eligible": program_eligible,
        "suggested_programs": suggested_programs,
        "probabilities": probabilities,
    }

# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {

        "service":
            "Barangay Luinab ML Service",

        "status":
            "running",

        "model_loaded":
            _model is not None,

        "classes":
            _classes,

        "program_income_limit":
            25000,

        "endpoints": [
            "/",
            "/health",
            "/analytics",
            "/predict",
            "/predict-batch",
            "/retrain",
        ],
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():

    return {

        "status":
            "ok",

        "model_loaded":
            _model is not None,

        "classes":
            _classes,

        "program_income_limit":
            25000,
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
        return predict_one(
            request.household,
            request.programs,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {type(e).__name__}: {e}",
        ) from e




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
