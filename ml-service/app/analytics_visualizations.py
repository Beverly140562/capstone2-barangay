import io
import math
from html import escape

import pandas as pd
import matplotlib

# Use a non-interactive backend for the Render server.
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import seaborn as sns

WIDTH = 800
HEIGHT = 550


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

    for row in records:
        label = str(row.get("vulnerability") or "Not Classified")
        counts[label] = counts.get(label, 0) + 1

    svg = _svg_start("Household Vulnerability Distribution")

    if not counts:
        svg += '<text x="400" y="220" text-anchor="middle">No data available</text>'
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
            font-family="Arial" font-size="18">{escape(label)}</text>
        <rect x="{chart_left}" y="{y}" width="{bar_width:.2f}"
            height="{bar_height}" fill="#6E2430" rx="5"/>
        <text x="{chart_left + bar_width + 10}" y="{y + 27}"
            font-family="Arial" font-size="18">{count}</text>
        '''

    return _image(svg + _svg_end())



def create_income_chart(records):
    values = []

    for row in records or []:
        value = _number(row.get("household_monthly_income"))

        if value is not None and value >= 0:
            values.append(value)

    title = "Household Monthly Income Distribution"
    svg = _svg_start(title)

    if not values:
        svg += '''
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="18">
            No income data available
        </text>
        '''
        return _image(svg + _svg_end())

    chart_left = 100
    chart_top = 100
    chart_width = 620
    chart_height = 320

    minimum = min(values)
    maximum = max(values)

    # Give identical values a visible plotting range.
    if minimum == maximum:
        padding = max(minimum * 0.10, 1000)
        minimum = max(0, minimum - padding)
        maximum = maximum + padding

    bin_count = min(10, max(1, len(values)))
    bin_width = (maximum - minimum) / bin_count

    counts = [0] * bin_count

    for value in values:
        index = int((value - minimum) / bin_width)
        index = min(index, bin_count - 1)
        counts[index] += 1

    maximum_count = max(counts) or 1
    bar_width = chart_width / bin_count

    svg += f'''
    <line x1="{chart_left}" y1="{chart_top + chart_height}"
          x2="{chart_left + chart_width}"
          y2="{chart_top + chart_height}"
          stroke="#333" stroke-width="2"/>
    <line x1="{chart_left}" y1="{chart_top}"
          x2="{chart_left}" y2="{chart_top + chart_height}"
          stroke="#333" stroke-width="2"/>
    '''

    for index, count in enumerate(counts):
        bar_height = count / maximum_count * chart_height
        x = chart_left + index * bar_width
        y = chart_top + chart_height - bar_height

        svg += f'''
        <rect x="{x + 2}" y="{y}"
              width="{max(0, bar_width - 4)}"
              height="{bar_height}"
              fill="#6E2430" rx="3"/>
        <text x="{x + bar_width / 2}"
              y="{chart_top + chart_height + 25}"
              text-anchor="middle"
              font-family="Arial" font-size="11">
            {index + 1}
        </text>
        '''

    svg += f'''
    <text x="410" y="500" text-anchor="middle"
          font-family="Arial" font-size="15">
        Income range: ₱{minimum:,.0f} – ₱{maximum:,.0f}
    </text>
    <text x="25" y="260" text-anchor="middle"
          transform="rotate(-90 25 260)"
          font-family="Arial" font-size="14">
        Number of households
    </text>
    <text x="410" y="535" text-anchor="middle"
          font-family="Arial" font-size="13">
        Income groups (₱)
    </text>
    <text x="400" y="75" text-anchor="middle"
          font-family="Arial" font-size="13">
        {len(values)} households
    </text>
    '''

    return _image(svg + _svg_end())


def create_feature_relationship_chart(records):
    """
    Household Feature Relationships:
    Correlation heatmap using actual household scoring data.
    Missing features are not fabricated or filled with zero.
    """

    numeric_columns = [
        "member_count",
        "household_monthly_income",
        "family_size",
        "income_points",
        "family_size_points",
        "employment_points",
        "education_points",
        "provisional_disability_points",
        "illness_points",
        "total_score"
    ]

    title = "Household Data Correlation Heatmap"
    svg = _svg_start(title)

    if not records:
        svg += '''
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="18">
            No household scoring data available
        </text>
        '''
        return _image(svg + _svg_end())

    df = pd.DataFrame(records)

    missing = [
        column for column in numeric_columns
        if column not in df.columns
    ]

    if missing:
        svg += '''
        <text x="400" y="140" text-anchor="middle"
              font-family="Arial" font-size="17">
            Required scoring features are missing
        </text>
        '''

        for index, column in enumerate(missing):
            svg += f'''
            <text x="400" y="{180 + index * 25}"
                  text-anchor="middle"
                  font-family="Arial" font-size="13">
                {escape(column)}
            </text>
            '''

        return _image(svg + _svg_end())

    # Convert only actual values to numeric.
    data = df[numeric_columns].apply(
        pd.to_numeric, errors="coerce"
    )

    # Remove columns without usable variation.
    usable_columns = [
        column for column in numeric_columns
        if data[column].notna().sum() >= 2
        and data[column].nunique() > 1
    ]

    if len(usable_columns) < 2:
        svg += '''
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="17">
            Not enough varied numeric data for correlation
        </text>
        '''
        return _image(svg + _svg_end())

    correlation = data[usable_columns].corr()

    columns = list(correlation.columns)
    count = len(columns)

    cell = min(48, 480 / count)
    left = 220
    top = 100

    # Heatmap cells and correlation values.
    for row_index, row_name in enumerate(columns):
        for col_index, col_name in enumerate(columns):
            value = correlation.loc[row_name, col_name]

            if pd.isna(value):
                continue

            # Red = negative, white = zero, blue = positive.
            intensity = int(abs(value) * 255)

            if value < 0:
                color = f"rgb(255,{255-intensity},{255-intensity})"
            else:
                color = f"rgb({255-intensity},{255-intensity},255)"

            x = left + col_index * cell
            y = top + row_index * cell

            svg += f'''
            <rect x="{x}" y="{y}"
                  width="{cell}" height="{cell}"
                  fill="{color}"
                  stroke="white" stroke-width="1"/>

            <text x="{x + cell/2}" y="{y + cell/2 + 4}"
                  text-anchor="middle"
                  font-family="Arial" font-size="10">
                {value:.2f}
            </text>
            '''

        label_y = top + row_index * cell + cell / 2 + 4

        svg += f'''
        <text x="{left - 8}" y="{label_y}"
              text-anchor="end"
              font-family="Arial" font-size="10">
            {escape(row_name)}
        </text>
        '''

    # Rotated column labels.
    for col_index, column in enumerate(columns):
        x = left + col_index * cell + cell / 2

        svg += f'''
        <text x="{x}" y="{top - 8}"
              text-anchor="start"
              transform="rotate(-55 {x} {top - 8})"
              font-family="Arial" font-size="10">
            {escape(column)}
        </text>
        '''

    svg += f'''
    <text x="400" y="530" text-anchor="middle"
          font-family="Arial" font-size="12">
        Correlation coefficient (Pearson)
    </text>
    '''

    return _image(svg + _svg_end())