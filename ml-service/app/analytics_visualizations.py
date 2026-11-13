
import io
import math
from html import escape
import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import seaborn as sns

import pandas as pd

WIDTH = 800
HEIGHT = 650


def _number(value):
    try:
        if value is None:
            return None
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _svg_start(title):
    return f'''<svg xmlns="http://www.w3.org/2000/svg"
        width="{WIDTH}" height="{HEIGHT}"
        viewBox="0 0 {WIDTH} {HEIGHT}">
        <rect width="100%" height="100%" fill="white"/>
        <text x="400" y="38" text-anchor="middle"
            font-family="Arial" font-size="21" font-weight="bold">
            {escape(str(title))}
        </text>'''


def _svg_end():
    return "</svg>"


def _image(svg):
    return io.BytesIO(svg.encode("utf-8"))


def create_vulnerability_chart(records):
    counts = {}

    for row in records or []:
        label = str(row.get("vulnerability") or "Not Classified")
        counts[label] = counts.get(label, 0) + 1

    svg = _svg_start("Household Vulnerability Distribution")

    if not counts:
        svg += '''
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="18">
            No data available
        </text>
        '''
        return _image(svg + _svg_end())

    maximum = max(counts.values()) or 1
    chart_left = 210
    chart_width = 480
    bar_height = 42
    gap = 24

    for index, (label, count) in enumerate(sorted(counts.items())):
        y = 95 + index * (bar_height + gap)
        bar_width = count / maximum * chart_width

        svg += f'''
        <text x="190" y="{y + 27}" text-anchor="end"
              font-family="Arial" font-size="18">
            {escape(label)}
        </text>
        <rect x="{chart_left}" y="{y}" width="{bar_width:.2f}"
              height="{bar_height}" fill="#6E2430" rx="5"/>
        <text x="{chart_left + bar_width + 10}" y="{y + 27}"
              font-family="Arial" font-size="18">{count}</text>
        '''

    return _image(svg + _svg_end())



def create_income_chart(records):
    """
    Household Monthly Income Distribution
    Uses Seaborn histogram with KDE, similar to Google Colab.
    """

    values = []

    for row in records or []:
        value = _number(
            row.get("household_monthly_income")
        )

        if value is not None and value >= 0:
            values.append(value)

    # No data available
    if not values:
        svg = _svg_start(
            "Household Monthly Income Distribution"
        )

        svg += '''
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="18">
            No income data available
        </text>
        '''

        return _image(svg + _svg_end())

    # Create DataFrame
    df = pd.DataFrame({
        "household_monthly_income": values
    })

    # Create Seaborn histogram
    fig, ax = plt.subplots(figsize=(9, 5))

    sns.histplot(
        data=df,
        x="household_monthly_income",
        bins=20,
        kde=len(set(values)) > 1,
        ax=ax,
        color="#6E2430"
    )

    # Chart title and labels
    ax.set_title(
        "Household Monthly Income Distribution",
        fontsize=14,
        fontweight="bold"
    )

    ax.set_xlabel(
        "Monthly Income (₱)",
        fontsize=11
    )

    ax.set_ylabel(
        "Number of Households",
        fontsize=11
    )

    # Prevent scientific notation
    ax.ticklabel_format(
        style="plain",
        axis="x"
    )

    # Format income labels
    ax.get_xaxis().set_major_formatter(
        plt.FuncFormatter(
            lambda x, _: f"₱{x:,.0f}"
        )
    )

    ax.grid(
        axis="y",
        alpha=0.25
    )

    fig.tight_layout()

    # Save chart as PNG in memory
    image_buffer = io.BytesIO()

    fig.savefig(
        image_buffer,
        format="png",
        dpi=150,
        bbox_inches="tight"
    )

    plt.close(fig)

    image_buffer.seek(0)

    return image_buffer


def create_feature_relationship_chart(records):
    """
    Pearson correlation heatmap using actual household data.

    Displays up to 10 available household features.
    Missing features are not assigned invented values.
    """

    numeric_columns = [
        "member_count",
        "household_monthly_income",
        "family_size",
        "income_points",
        "family_size_points",
        "employment_points",
        "education_points",
        "disability_points",
        "illness_points",
        "total_score",
    ]

    if not records:
        svg = _svg_start("Household Data Correlation Heatmap")
        svg += '''
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="18">
            No household data available
        </text>
        '''
        return _image(svg + _svg_end())

    # Convert available features to numeric values.
    df = pd.DataFrame(records)

    available_columns = [
        column for column in numeric_columns
        if column in df.columns
    ]

    missing_columns = [
        column for column in numeric_columns
        if column not in df.columns
    ]

    if len(available_columns) < 2:
        raise ValueError(
            "Not enough available numeric features for correlation."
        )

    for column in available_columns:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

    # Remove columns without usable numeric values.
    df = df[available_columns].dropna(axis=1, how="all")

    columns = list(df.columns)

    if len(columns) < 2:
        raise ValueError(
            "Not enough numeric household features."
        )

    # Calculate Pearson correlation.
    correlation = df.corr(method="pearson")

    # Heatmap dimensions.
    cell = 58
    left = 330
    top = 190

    chart_width = left + len(columns) * cell + 80
    chart_height = top + len(columns) * cell + 190

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg"
        width="{chart_width}" height="{chart_height}"
        viewBox="0 0 {chart_width} {chart_height}">
        <rect width="100%" height="100%" fill="white"/>

        <text x="{chart_width / 2}" y="40"
              text-anchor="middle"
              font-family="Arial"
              font-size="23"
              font-weight="bold">
            Household Data Correlation Heatmap
        </text>
    '''

    # Draw heatmap rows and columns.
    for row_index, row_name in enumerate(columns):

        y = top + row_index * cell

        # Y-axis labels.
        svg += f'''
        <text x="{left - 12}"
              y="{y + cell / 2 + 5}"
              text-anchor="end"
              font-family="Arial"
              font-size="12">
            {escape(row_name)}
        </text>
        '''

        for col_index, col_name in enumerate(columns):

            x = left + col_index * cell
            value = correlation.loc[row_name, col_name]

            if pd.isna(value):
                color = "rgb(225,225,225)"
                label = "N/A"

            else:
                value = max(-1.0, min(1.0, float(value)))
                intensity = int(abs(value) * 255)

                if value < 0:
                    color = (
                        f"rgb(255,{255-intensity},"
                        f"{255-intensity})"
                    )
                else:
                    color = (
                        f"rgb({255-intensity},"
                        f"{255-intensity},255)"
                    )

                label = f"{value:.2f}"

            svg += f'''
            <rect x="{x}" y="{y}"
                  width="{cell}" height="{cell}"
                  fill="{color}"
                  stroke="white"
                  stroke-width="2"/>

            <text x="{x + cell / 2}"
                  y="{y + cell / 2 + 4}"
                  text-anchor="middle"
                  font-family="Arial"
                  font-size="11">
                {label}
            </text>
            '''

    # X-axis labels.
    for col_index, col_name in enumerate(columns):

        x = left + col_index * cell + cell / 2
        y = top - 10

        svg += f'''
        <text x="{x}" y="{y}"
              text-anchor="end"
              transform="rotate(-45 {x} {y})"
              font-family="Arial"
              font-size="11">
            {escape(col_name)}
        </text>
        '''

    # Display missing features instead of silently inventing data.
    if missing_columns:
        missing_text = "Missing features: " + ", ".join(missing_columns)

        svg += f'''
        <text x="{chart_width / 2}"
              y="{chart_height - 65}"
              text-anchor="middle"
              font-family="Arial"
              font-size="11"
              fill="#A33">
            {escape(missing_text)}
        </text>
        '''

    svg += f'''
        <text x="{chart_width / 2}"
              y="{chart_height - 30}"
              text-anchor="middle"
              font-family="Arial"
              font-size="13">
            Pearson correlation | {len(df)} household records
        </text>
    '''

    return _image(svg + "</svg>")
