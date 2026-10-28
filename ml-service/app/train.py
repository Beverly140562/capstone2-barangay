
"""
Generate synthetic household data and train the Random Forest classifier.

The synthetic data is labelled using a transparent vulnerability
scoring rule so the Random Forest learns patterns consistent with
the household vulnerability logic.

Run:
    python app/train.py

Output:
    model.joblib
"""

import random
from pathlib import Path

import pandas as pd
from joblib import dump
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

from features import FEATURE_NAMES, build_dataframe


# ============================================================
# CONFIGURATION
# ============================================================

RNG = random.Random(42)
SEED = 42

BASE = Path(__file__).resolve().parent.parent
OUTPUT = BASE / "model" / "luinab_household_rf_pipeline.joblib"

# ============================================================
# SYNTHETIC DATA OPTIONS
# ============================================================

EDU = [
    "None",
    "Elementary",
    "High School",
    "Vocational",
    "College",
    "Post Graduate",
]

OCC = [
    "None",
    "Unemployed",
    "Laborer",
    "Farmer",
    "Fisherfolk",
    "Driver",
    "Vendor",
    "Self-employed",
    "Government Employee",
    "Private Employee",
    "Professional",
]

RES = [
    "Owned",
    "Rent",
    "Living with relatives",
]

CIV = [
    "Single",
    "Married",
    "Widowed",
    "Separated",
    "Live-in",
]


# ============================================================
# VULNERABILITY SCORING
# ============================================================

def vulnerability_label(row):
    """
    Generate the training label using a transparent
    vulnerability scoring system.

    Higher score = greater vulnerability.

    Score:
        Monthly income
        Family size
        Disability
        Age
        Occupation
        Education

    Classification:
        >= 6  -> Highly Vulnerable
        >= 3  -> Moderately Vulnerable
        < 3   -> Low Vulnerable
    """

    score = 0

    # --------------------------------------------------------
    # MONTHLY INCOME
    # --------------------------------------------------------

    income = float(row["monthly_income"])

    if income < 10000:
        score += 3
    elif income < 24000:
        score += 2
    elif income < 25000:
        score += 1

    # --------------------------------------------------------
    # FAMILY SIZE
    # --------------------------------------------------------

    family_number = int(row["family_number"])

    if family_number >= 6:
        score += 2
    elif family_number >= 4:
        score += 1

    # --------------------------------------------------------
    # DISABILITY
    # --------------------------------------------------------

    if bool(row["disability"]):
        score += 3

    # --------------------------------------------------------
    # AGE
    # --------------------------------------------------------

    age = int(row["age"])

    if age >= 60:
        score += 2

    # --------------------------------------------------------
    # OCCUPATION
    # --------------------------------------------------------

    if row["occupation"] in ("None", "Unemployed"):
        score += 2

    # --------------------------------------------------------
    # EDUCATION
    # --------------------------------------------------------

    if row["highest_education"] in (
        "None",
        "Elementary",
    ):
        score += 1

    # --------------------------------------------------------
    # SMALL RANDOM NOISE
    # --------------------------------------------------------
    #
    # This makes the synthetic dataset less perfectly
    # deterministic, allowing the Random Forest to learn
    # patterns instead of simply memorizing the exact rule.

    score += RNG.gauss(0, 0.8)

    # --------------------------------------------------------
    # FINAL CLASSIFICATION
    # --------------------------------------------------------

    if score >= 6:
        return "Highly Vulnerable"

    elif score >= 3:
        return "Moderately Vulnerable"

    else:
        return "Low Vulnerable"


# ============================================================
# GENERATE SYNTHETIC HOUSEHOLDS
# ============================================================

def generate_samples(n=1200):
    records = []

    for _ in range(n):

        records.append({
            "monthly_income": round(
                RNG.uniform(1500, 35000),
                2
            ),

            "family_number": RNG.randint(
                1,
                10
            ),

            "age": RNG.randint(
                18,
                85
            ),

            "length_residency": RNG.randint(
                0,
                50
            ),

            "sex": RNG.choice([
                "male",
                "female",
            ]),

            "civil_status": RNG.choice(
                CIV
            ),

            "highest_education": RNG.choice(
                EDU
            ),

            "occupation": RNG.choice(
                OCC
            ),

            "residence": RNG.choice(
                RES
            ),

            "disability": RNG.random() < 0.08,
        })

    return records


# ============================================================
# TRAIN RANDOM FOREST
# ============================================================

def main():

    print("=" * 60)
    print("Barangay Luinab - Random Forest Training")
    print("=" * 60)

    print()
    print("Generating synthetic household data...")

    records = generate_samples(
        n=1200
    )

    # --------------------------------------------------------
    # CREATE RAW DATAFRAME
    # --------------------------------------------------------

    df_raw = pd.DataFrame(
        records
    )

    # Generate vulnerability labels
    df_raw["label"] = df_raw.apply(
        vulnerability_label,
        axis=1
    )

    # --------------------------------------------------------
    # SHOW CLASS DISTRIBUTION
    # --------------------------------------------------------

    print()
    print("Class distribution:")

    print(
        df_raw["label"]
        .value_counts()
        .to_string()
    )

    # --------------------------------------------------------
    # BUILD FEATURES
    # --------------------------------------------------------
    #
    # IMPORTANT:
    # build_dataframe() must use the same feature encoding
    # used by features.py during prediction.

    X = build_dataframe(
        records
    )

    y = df_raw["label"].values

    # --------------------------------------------------------
    # TRAIN / TEST SPLIT
    # --------------------------------------------------------

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=SEED,
        stratify=y,
    )

    print()
    print(f"Training samples: {len(X_train)}")
    print(f"Testing samples:  {len(X_test)}")
    print(f"Features:         {len(FEATURE_NAMES)}")

    # --------------------------------------------------------
    # RANDOM FOREST
    # --------------------------------------------------------

    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_leaf=3,
        random_state=SEED,
        class_weight="balanced",
        n_jobs=-1,
    )

    print()
    print("Training Random Forest...")

    model.fit(
        X_train,
        y_train
    )

    # --------------------------------------------------------
    # EVALUATION
    # --------------------------------------------------------

    train_predictions = model.predict(
        X_train
    )

    test_predictions = model.predict(
        X_test
    )

    train_accuracy = accuracy_score(
        y_train,
        train_predictions
    )

    test_accuracy = accuracy_score(
        y_test,
        test_predictions
    )

    print()
    print(
        f"Train accuracy: {train_accuracy:.3f}"
    )

    print(
        f"Test  accuracy: {test_accuracy:.3f}"
    )

    print()
    print(
        "Classes:"
    )

    print(
        model.classes_.tolist()
    )

    # --------------------------------------------------------
    # VERIFY REQUIRED CLASSES
    # --------------------------------------------------------

    required_classes = {
        "Highly Vulnerable",
        "Moderately Vulnerable",
        "Low Vulnerable",
    }

    actual_classes = set(
        model.classes_.tolist()
    )

    missing_classes = (
        required_classes - actual_classes
    )

    if missing_classes:
        raise RuntimeError(
            "Training failed because these required "
            f"classes are missing: {missing_classes}"
        )

    # Make sure the old class is not present
    if "Not Vulnerable" in actual_classes:
        raise RuntimeError(
            "ERROR: 'Not Vulnerable' is still present. "
            "The system must use 'Low Vulnerable'."
        )

    # --------------------------------------------------------
    # SAVE MODEL
    # --------------------------------------------------------

    payload = {
        "model": model,

        "feature_names": FEATURE_NAMES,

        "classes": model.classes_.tolist(),

        "version": "1.0",

        "seed": SEED,

        "training_samples": len(records),

        "train_accuracy": round(
            float(train_accuracy),
            4
        ),

        "test_accuracy": round(
            float(test_accuracy),
            4
        ),
    }

    dump(
        payload,
        OUTPUT
    )

    print()
    print(
        f"Saved model to:"
    )

    print(
        OUTPUT
    )

    print()
    print("=" * 60)
    print("Training complete.")
    print("=" * 60)


if __name__ == "__main__":
    main()
