
import io

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from sklearn.metrics import (
    ConfusionMatrixDisplay,
    classification_report,
)

sns.set_theme(style="whitegrid")


def _png_buffer(fig):
    """Convert a Matplotlib figure into a PNG response buffer."""
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buffer.seek(0)
    return buffer


def create_vulnerability_chart(households: pd.DataFrame):
    """Compare household counts by vulnerability level."""
    fig, ax = plt.subplots(figsize=(8, 4))

    if households.empty or "vulnerability" not in households.columns:
        ax.text(0.5, 0.5, "No vulnerability data available",
                ha="center", va="center")
        ax.set_axis_off()
    else:
        data = households.copy()
        data["vulnerability"] = (
            data["vulnerability"].fillna("Unclassified").astype(str)
        )

        order = data["vulnerability"].value_counts().index.tolist()
        sns.countplot(
            data=data,
            x="vulnerability",
            order=order,
            ax=ax,
        )
        ax.set_title("Household Vulnerability Levels", fontsize=18)
        ax.set_xlabel("Vulnerability Level", fontsize=16)
        ax.set_ylabel("Number of Households", fontsize=16)
        ax.tick_params(axis="x", rotation=20)

    fig.tight_layout()
    return _png_buffer(fig)


def create_income_chart(households: pd.DataFrame):
    """Explore the distribution of monthly household income."""
    fig, ax = plt.subplots(figsize=(8, 4))

    if households.empty or "monthly_income" not in households.columns:
        ax.text(0.5, 0.5, "No income data available",
                ha="center", va="center")
        ax.set_axis_off()
    else:
        income = pd.to_numeric(
            households["monthly_income"], errors="coerce"
        ).dropna()
        income = income[income >= 0]

        if income.empty:
            ax.text(0.5, 0.5, "No valid income values",
                    ha="center", va="center")
            ax.set_axis_off()
        else:
            sns.histplot(
                x=income,
                bins=10,
                kde=len(income) > 1,
                ax=ax,
            )
            
            ax.set_title("Monthly Household Income Distribution", fontsize=18)
            ax.set_xlabel("Monthly Income (PHP)", fontsize=16)
            ax.set_ylabel("Number of Households", fontsize=16)
            ax.tick_params(axis="x", labelsize=12)
            ax.tick_params(axis="y", labelsize=12)

    fig.tight_layout()
    return _png_buffer(fig)



def create_feature_relationship_chart(households: pd.DataFrame):
    """Show correlations between available numeric household features."""
    fig, ax = plt.subplots(figsize=(14, 12))

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
            fontsize=24,
            wrap=True,
        )
        ax.set_axis_off()
    else:
        numeric_data = households[numeric_columns].apply(
            pd.to_numeric, errors="coerce"
        )

        # Remove columns that contain no valid numeric data
        numeric_data = numeric_data.dropna(axis=1, how="all")

        if numeric_data.shape[1] < 2:
            ax.text(
                0.5, 0.5,
                "At least two numeric household features are required",
                ha="center",
                va="center",
                fontsize=18,
                wrap=True,
            )
            ax.set_axis_off()
        else:
            correlation = numeric_data.corr()

            sns.heatmap(
                correlation,
                annot=True,
                fmt=".2f",
                vmin=-1,
                vmax=1,
                center=0,
                cmap="vlag",
                ax=ax,
                annot_kws={"fontsize": 24},
            )

            ax.set_title(
                "Relationships Between Numeric Household Features",
                fontsize=20,
                fontweight="bold",
                pad=20,
            )

            ax.set_xlabel(
                "Household Features",
                fontsize=20,
                labelpad=15,
            )

            ax.set_ylabel(
                "Household Features",
                fontsize=20,
                labelpad=15,
            )

            ax.tick_params(
                axis="both",
                labelsize=20,
            )

    fig.tight_layout()
    return _png_buffer(fig)


def create_model_performance_chart(y_true, y_pred, labels=None):
    """
    Visualize model performance using actual held-out labels and
    corresponding model predictions.
    """
    if len(y_true) == 0 or len(y_true) != len(y_pred):
        raise ValueError(
            "Actual labels and predictions must be non-empty and equal in length."
        )

    fig, ax = plt.subplots(figsize=(7, 6))

    ConfusionMatrixDisplay.from_predictions(
        y_true,
        y_pred,
        labels=labels,
        cmap="Blues",
        xticks_rotation=30,
        ax=ax,
        colorbar=False,
    )

    ax.set_title("Random Forest Confusion Matrix", fontsize=18)
    fig.tight_layout()
    return _png_buffer(fig)


def get_model_classification_report(y_true, y_pred):
    """Return precision, recall, F1-score, and support by class."""
    if len(y_true) == 0 or len(y_true) != len(y_pred):
        raise ValueError(
            "Actual labels and predictions must be non-empty and equal in length."
        )

    return classification_report(
        y_true,
        y_pred,
        output_dict=True,
        zero_division=0,
    )
