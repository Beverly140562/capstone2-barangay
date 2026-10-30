
import io

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from sklearn.metrics import (
    ConfusionMatrixDisplay,
    classification_report,
)


# ---------------------------------------------------------
# COMMON PNG RENDERING
# ---------------------------------------------------------

def _png_buffer(fig):
    """Convert a Matplotlib figure into a PNG response buffer."""
    buffer = io.BytesIO()

    try:
        fig.savefig(
            buffer,
            format="png",
            dpi=100,
            bbox_inches="tight",
        )
        buffer.seek(0)
        return buffer
    finally:
        plt.close(fig)


# ---------------------------------------------------------
# VULNERABILITY CHART
# ---------------------------------------------------------

def create_vulnerability_chart(households: pd.DataFrame):
    """Compare household counts by vulnerability level."""

    fig, ax = plt.subplots(figsize=(8, 4))

    try:
        if households.empty or "vulnerability" not in households.columns:
            ax.text(
                0.5, 0.5,
                "No vulnerability data available",
                ha="center",
                va="center",
            )
            ax.set_axis_off()

        else:
            data = households["vulnerability"].fillna(
                "Unclassified"
            ).astype(str)

            counts = data.value_counts()

            ax.bar(
                counts.index,
                counts.values,
            )

            ax.set_title(
                "Household Vulnerability Levels",
                fontsize=16,
            )
            ax.set_xlabel("Vulnerability Level")
            ax.set_ylabel("Number of Households")
            ax.tick_params(axis="x", rotation=20)

            fig.tight_layout()

        return _png_buffer(fig)

    except Exception:
        plt.close(fig)
        raise


# ---------------------------------------------------------
# HOUSEHOLD INCOME CHART
# ---------------------------------------------------------

def create_income_chart(households: pd.DataFrame):
    """Explore the distribution of monthly household income."""

    fig, ax = plt.subplots(figsize=(8, 4))

    try:
        if households.empty or "monthly_income" not in households.columns:
            ax.text(
                0.5, 0.5,
                "No income data available",
                ha="center",
                va="center",
            )
            ax.set_axis_off()

        else:
            income = pd.to_numeric(
                households["monthly_income"],
                errors="coerce",
            ).dropna()

            income = income[income >= 0]

            if income.empty:
                ax.text(
                    0.5, 0.5,
                    "No valid income values",
                    ha="center",
                    va="center",
                )
                ax.set_axis_off()

            else:
                ax.hist(
                    income,
                    bins=10,
                    edgecolor="black",
                )

                ax.set_title(
                    "Monthly Household Income Distribution",
                    fontsize=16,
                )
                ax.set_xlabel("Monthly Income (PHP)")
                ax.set_ylabel("Number of Households")

            ax.tick_params(axis="both", labelsize=11)

        fig.tight_layout()
        return _png_buffer(fig)

    except Exception:
        plt.close(fig)
        raise


# ---------------------------------------------------------
# FEATURE RELATIONSHIP CHART
# ---------------------------------------------------------

def create_feature_relationship_chart(households: pd.DataFrame):
    """Show correlations between available numeric household features."""

    fig, ax = plt.subplots(figsize=(10, 8))

    try:
        numeric_columns = [
            col for col in [
                "monthly_income",
                "family_number",
                "age",
                "length_residency",
                "member_count",
                "family_size",
            ]
            if col in households.columns
        ]

        if households.empty or len(numeric_columns) < 2:
            ax.text(
                0.5, 0.5,
                "At least two numeric household features are required",
                ha="center",
                va="center",
                fontsize=14,
                wrap=True,
            )
            ax.set_axis_off()

        else:
            numeric_data = households[numeric_columns].apply(
                pd.to_numeric,
                errors="coerce",
            )

            numeric_data = numeric_data.dropna(
                axis=1,
                how="all",
            )

            if numeric_data.shape[1] < 2:
                ax.text(
                    0.5, 0.5,
                    "At least two numeric household features are required",
                    ha="center",
                    va="center",
                    fontsize=14,
                    wrap=True,
                )
                ax.set_axis_off()

            else:
                correlation = numeric_data.corr()

                values = correlation.to_numpy(dtype=float)

                image = ax.imshow(
                    values,
                    cmap="coolwarm",
                    vmin=-1,
                    vmax=1,
                    aspect="auto",
                )

                columns = correlation.columns.tolist()

                ax.set_xticks(range(len(columns)))
                ax.set_yticks(range(len(columns)))

                ax.set_xticklabels(
                    columns,
                    rotation=35,
                    ha="right",
                )

                ax.set_yticklabels(columns)

                # Display correlation values.
                for row in range(len(columns)):
                    for col in range(len(columns)):
                        value = values[row, col]

                        label = (
                            f"{value:.2f}"
                            if np.isfinite(value)
                            else "N/A"
                        )

                        ax.text(
                            col,
                            row,
                            label,
                            ha="center",
                            va="center",
                            fontsize=10,
                        )

                ax.set_title(
                    "Relationships Between Numeric Household Features",
                    fontsize=16,
                    fontweight="bold",
                    pad=15,
                )

                ax.set_xlabel("Household Features")
                ax.set_ylabel("Household Features")

                fig.colorbar(
                    image,
                    ax=ax,
                    fraction=0.046,
                    pad=0.04,
                )

        fig.tight_layout()
        return _png_buffer(fig)

    except Exception:
        plt.close(fig)
        raise


# ---------------------------------------------------------
# RANDOM FOREST MODEL PERFORMANCE CHART
# ---------------------------------------------------------

def create_model_performance_chart(y_true, y_pred, labels=None):
    """
    Visualize model performance using actual held-out labels
    and corresponding model predictions.
    """

    if len(y_true) == 0 or len(y_true) != len(y_pred):
        raise ValueError(
            "Actual labels and predictions must be non-empty "
            "and equal in length."
        )

    fig, ax = plt.subplots(figsize=(7, 6))

    try:
        ConfusionMatrixDisplay.from_predictions(
            y_true,
            y_pred,
            labels=labels,
            cmap="Blues",
            xticks_rotation=30,
            ax=ax,
            colorbar=False,
        )

        ax.set_title(
            "Random Forest Confusion Matrix",
            fontsize=16,
        )

        fig.tight_layout()
        return _png_buffer(fig)

    except Exception:
        plt.close(fig)
        raise


# ---------------------------------------------------------
# CLASSIFICATION REPORT
# ---------------------------------------------------------

def get_model_classification_report(y_true, y_pred):
    """Return precision, recall, F1-score, and support by class."""

    if len(y_true) == 0 or len(y_true) != len(y_pred):
        raise ValueError(
            "Actual labels and predictions must be non-empty "
            "and equal in length."
        )

    return classification_report(
        y_true,
        y_pred,
        output_dict=True,
        zero_division=0,
    )
