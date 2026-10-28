
"""Shared feature engineering for training and prediction."""

import numpy as np
import pandas as pd

SEX_MAP = {"male": 1, "female": 2}

CIVIL_MAP = {
    "Single": 1,
    "Married": 2,
    "Widowed": 3,
    "Separated": 4,
    "Divorced": 4,
    "Live-in": 5,
    "Common-law": 5,
}

EDU_MAP = {
    "None": 0,
    "Elementary": 1,
    "High School": 2,
    "Vocational": 3,
    "College": 4,
    "Post Graduate": 5,
}

OCCUPATION_MAP = {
    "None": 0,
    "Unemployed": 0,
    "Laborer": 1,
    "Farmer": 1,
    "Fisherfolk": 1,
    "Driver": 2,
    "Vendor": 2,
    "Self-employed": 3,
    "Government": 4,
    "Private": 4,
    "Professional": 5,
}

RESIDENCE_MAP = {
    "Owned": 1,
    "Rent": 2,
    "Living with relatives": 3,
}

NUMERIC_COLS = [
    "monthly_income",
    "family_number",
    "age",
    "length_residency",
]

CATEGORICAL_COLS = [
    "sex",
    "civil_status",
    "highest_education",
    "occupation",
    "residence",
]

FEATURE_NAMES = (
    NUMERIC_COLS
    + CATEGORICAL_COLS
    + ["disability"]
)


def to_boolean(value):
    """Normalize Boolean and legacy Yes/No values."""
    if isinstance(value, (bool, np.bool_)):
        return bool(value)

    if value is None:
        return False

    if isinstance(value, (int, float, np.number)):
        return value == 1

    return str(value).strip().lower() in {
        "true", "1", "yes", "y"
    }


def _map_ordinal(value, mapping):
    if value is None:
        return 0

    if isinstance(value, (float, np.floating)) and np.isnan(value):
        return 0

    value = str(value).strip()

    if value in mapping:
        return mapping[value]

    # Match longer category labels such as
    # "Government Employee" and "Private Employee".
    for key, code in sorted(
        mapping.items(),
        key=lambda item: len(item[0]),
        reverse=True,
    ):
        if value.lower().startswith(key.lower()):
            return code

    return 0


def encode_row(row: dict) -> list:
    """Encode one household in the exact training feature order."""

    def num(key):
        try:
            value = float(row.get(key) or 0)
            return value if np.isfinite(value) else 0
        except (TypeError, ValueError):
            return 0

    disability_value = row.get(
        "disability",
        row.get("disability_present", False),
    )

    return [
        num("monthly_income"),
        num("family_number"),
        num("age"),
        num("length_residency"),
        _map_ordinal(row.get("sex"), SEX_MAP),
        _map_ordinal(row.get("civil_status"), CIVIL_MAP),
        _map_ordinal(row.get("highest_education"), EDU_MAP),
        _map_ordinal(row.get("occupation"), OCCUPATION_MAP),
        _map_ordinal(row.get("residence"), RESIDENCE_MAP),
        int(to_boolean(disability_value)),
    ]


def build_dataframe(records: list[dict]) -> pd.DataFrame:
    """Build a consistently ordered feature dataframe."""
    return pd.DataFrame(
        [encode_row(record) for record in records],
        columns=FEATURE_NAMES,
    )
